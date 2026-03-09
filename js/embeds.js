// ── LINK PREVIEW CACHE ────────────────────────────────────────
// Layer 1: in-memory Map (instant, lives for session)
// Layer 2: localStorage (OG metadata — title/desc/site, 7-day TTL)
// Layer 3: IndexedDB thumbs store (image bytes as base64, permanent until cleared)
//
// When an <img> is needed, setImgSrc() is called instead of img.src = url.
// It checks IDB first → if hit, assigns data: URI immediately (zero network).
// On miss, fetches the image, stores base64 in IDB, then assigns.

const CACHE_PREFIX = 'tethys_og_';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const embedCache   = new Map(); // in-memory OG metadata dedup

// ── THUMBNAIL CACHE (IndexedDB) ───────────────────────────────
const thumbMemCache = new Map(); // url → dataURI  (in-memory, avoids repeat IDB reads)
const thumbInFlight = new Map(); // url → Promise  (dedup concurrent fetches)

async function thumbCacheGet(url) {
  if (thumbMemCache.has(url)) return thumbMemCache.get(url);
  try {
    const db    = await openDB();
    const entry = await new Promise((res, rej) => {
      const tx  = db.transaction(THUMB_STORE, 'readonly');
      const req = tx.objectStore(THUMB_STORE).get(url);
      req.onsuccess = () => res(req.result ?? null);
      req.onerror   = () => rej(req.error);
    });
    if (entry?.dataURI) {
      thumbMemCache.set(url, entry.dataURI);
      return entry.dataURI;
    }
  } catch { /* IDB unavailable */ }
  return null;
}

async function thumbCacheSet(url, dataURI) {
  thumbMemCache.set(url, dataURI);
  try {
    const db = await openDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(THUMB_STORE, 'readwrite');
      tx.objectStore(THUMB_STORE).put({ url, dataURI, cachedAt: Date.now() });
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  } catch { /* IDB full or unavailable — still works from in-memory */ }
}

// Fetch image → base64 dataURI, cache it, return it.
async function fetchAndCacheThumb(url) {
  if (thumbInFlight.has(url)) return thumbInFlight.get(url);

  const promise = (async () => {
    try {
      const res  = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return null;
      const blob = await res.blob();
      const b64  = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload  = () => res(reader.result);
        reader.onerror = () => rej(reader.error);
        reader.readAsDataURL(blob);
      });
      await thumbCacheSet(url, b64);
      return b64;
    } catch {
      return null;
    } finally {
      thumbInFlight.delete(url);
    }
  })();

  thumbInFlight.set(url, promise);
  return promise;
}

// Main entry point — call instead of img.src = url.
async function setImgSrc(img, url) {
  if (!url) return;

  // Fast path: already in memory
  const mem = thumbMemCache.get(url);
  if (mem) { img.src = mem; return; }

  img.style.opacity = '0.3';

  const cached = await thumbCacheGet(url);
  if (cached) {
    img.src = cached;
    img.style.opacity = '';
    return;
  }

  // Not cached — fetch, store, display
  const dataURI = await fetchAndCacheThumb(url);
  if (img.isConnected) {
    img.src = dataURI ?? url; // fall back to direct URL if fetch failed
    img.style.opacity = '';
  }
}

// ── OG METADATA CACHE (localStorage) ─────────────────────────
function ogCacheGet(url) {
  if (embedCache.has(url)) return embedCache.get(url);
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + url);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_PREFIX + url);
      return null;
    }
    embedCache.set(url, entry.data);
    return entry.data;
  } catch { return null; }
}

function ogCacheSet(url, data) {
  embedCache.set(url, data);
  try {
    localStorage.setItem(CACHE_PREFIX + url, JSON.stringify({ data, cachedAt: Date.now() }));
  } catch {
    pruneOGCache(20);
    try { localStorage.setItem(CACHE_PREFIX + url, JSON.stringify({ data, cachedAt: Date.now() })); } catch { /* give up */ }
  }
}

function pruneOGCache(count = 10) {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(CACHE_PREFIX)) {
      try { keys.push({ k, ts: JSON.parse(localStorage.getItem(k)).cachedAt ?? 0 }); }
      catch { keys.push({ k, ts: 0 }); }
    }
  }
  keys.sort((a, b) => a.ts - b.ts).slice(0, count).forEach(({ k }) => localStorage.removeItem(k));
}

function updateCacheStats() { /* no-op — UI uses timing display */ }

function updateImgTiming(ms, fromToml, fromLive) {
  const el = document.getElementById('img-timing');
  if (!el) return;
  if (fromToml === 0 && fromLive === 0) {
    el.textContent = 'imgs: —';
    el.title = 'no embeds in this thread';
    return;
  }
  const parts = [];
  if (fromToml > 0) parts.push(`${fromToml} instant`);
  if (fromLive  > 0) parts.push(`${fromLive} live`);
  el.textContent = `imgs: ${ms}ms · ${parts.join(' · ')}`;
  el.title = `rendered in ${ms}ms — ${fromToml} from toml cache, ${fromLive} fetched live`;
}

// Flush expired OG metadata on load
(function cleanExpired() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (!k?.startsWith(CACHE_PREFIX)) continue;
    try {
      if (Date.now() - JSON.parse(localStorage.getItem(k)).cachedAt > CACHE_TTL_MS)
        localStorage.removeItem(k);
    } catch { localStorage.removeItem(k); }
  }
})();

// ── LIVE OG FETCH (fallback for old backups without linkPreviews) ──
const inFlight = new Set();

async function fetchOGData(url) {
  const cached = ogCacheGet(url);
  if (cached !== null) return cached;

  if (inFlight.has(url)) {
    for (let i = 0; i < 40; i++) {
      await new Promise(r => setTimeout(r, 200));
      const c = ogCacheGet(url);
      if (c !== null) return c;
    }
    return 'error';
  }

  inFlight.add(url);
  try {
    const proxy = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const res   = await fetch(proxy, { signal: AbortSignal.timeout(8000) });
    const json  = await res.json();
    const html  = json.contents ?? '';

    const get = (prop) => {
      const m = html.match(new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))
      || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, 'i'));
      return m?.[1] ?? null;
    };
    const getMeta = (name) => {
      const m = html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'))
      || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`, 'i'));
      return m?.[1] ?? null;
    };

    const data = {
      title: get('og:title') || getMeta('twitter:title') || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() || new URL(url).hostname,
      desc:  get('og:description') || getMeta('description') || getMeta('twitter:description') || '',
      image: get('og:image') || getMeta('twitter:image') || null,
      site:  get('og:site_name') || new URL(url).hostname,
    };
    ogCacheSet(url, data);
    return data;
  } catch {
    ogCacheSet(url, 'error');
    return 'error';
  } finally {
    inFlight.delete(url);
  }
}

// ── EMBED RENDERERS ───────────────────────────────────────────
function createLinkEmbedFromData(url, data) {
  const wrap = document.createElement('div');
  wrap.className = 'link-embed';
  if (url) wrap.onclick = () => window.open(url, '_blank');

  const imgUrl = data?.image ?? '';
  const title  = data?.title ?? '';
  const desc   = data?.desc  ?? '';
  const site   = data?.site  ?? (() => { try { return new URL(url).hostname; } catch { return ''; } })();

  const wideHosts = ['youtube.com', 'youtu.be', 'twitter.com', 'x.com', 'reddit.com', 'twitch.tv'];
  const isWide    = !url || wideHosts.some(h => url.includes(h));

  if (imgUrl) {
    const img = document.createElement('img');
    img.className = isWide ? 'link-embed-thumb wide' : 'link-embed-thumb';
    img.alt = '';
    img.onerror = function() { this.style.display = 'none'; wrap.classList.remove('has-thumb'); };
    setImgSrc(img, imgUrl); // ← cached path, no repeated network requests

    const body = document.createElement('div');
    body.className = 'link-embed-body';
    body.innerHTML = `
    ${site  ? `<div class="link-embed-site">${escHtml(site)}</div>`  : ''}
    ${title ? `<div class="link-embed-title">${escHtml(title)}</div>` : ''}
    ${desc  ? `<div class="link-embed-desc">${escHtml(desc)}</div>`  : ''}
    `;

    if (isWide) {
      wrap.appendChild(img);
      wrap.appendChild(body);
    } else {
      wrap.classList.add('has-thumb');
      wrap.appendChild(body);
      wrap.appendChild(img);
    }
  } else {
    const body = document.createElement('div');
    body.className = 'link-embed-body';
    body.innerHTML = `
    ${site  ? `<div class="link-embed-site">${escHtml(site)}</div>`  : ''}
    ${title ? `<div class="link-embed-title">${escHtml(title)}</div>` : (url ? `<div class="link-embed-title">${escHtml(url)}</div>` : '')}
    ${desc  ? `<div class="link-embed-desc">${escHtml(desc)}</div>`  : ''}
    `;
    wrap.appendChild(body);
  }
  return wrap;
}

function createLinkEmbed(url) {
  const wrap = document.createElement('div');
  wrap.className = 'link-embed';
  wrap.onclick = () => window.open(url, '_blank');
  wrap.innerHTML = `<div class="link-embed-loading"><div class="spinner"></div><span>${escHtml(new URL(url).hostname)}</span></div>`;

  fetchOGData(url).then(data => {
    wrap.innerHTML = '';
    wrap.className = 'link-embed';
    if (!data || data === 'error') {
      const body = document.createElement('div');
      body.className = 'link-embed-body';
      body.innerHTML = `<div class="link-embed-site">${escHtml((() => { try { return new URL(url).hostname; } catch { return url; } })())}</div>
      <div class="link-embed-title">${escHtml(url)}</div>`;
      wrap.appendChild(body);
      return;
    }
    const filled = createLinkEmbedFromData(url, data);
    wrap.className = filled.className;
    while (filled.firstChild) wrap.appendChild(filled.firstChild);
  });

    return wrap;
}

function formatContent(text) {
  if (!text) return '<span class="msg-empty">— empty —</span>';
  return escHtml(text).replace(/(https?:\/\/[^\s<>"]+)/g, '<a href="$1" target="_blank">$1</a>');
}

function extractUrls(text) {
  if (!text) return [];
  return [...(text.matchAll(/(https?:\/\/[^\s<>"]+)/g))].map(m => m[1]);
}

// ── CACHE MANAGEMENT ─────────────────────────────────────────
async function clearThumbCache() {
  thumbMemCache.clear();
  try {
    const db = await openDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(THUMB_STORE, 'readwrite');
      tx.objectStore(THUMB_STORE).clear();
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
    setStatus('thumbnail cache cleared', 'yellow');
    setTimeout(() => setStatus('ready', 'green'), 2000);
  } catch { setStatus('cache clear failed', 'yellow'); }
}

async function getThumbCacheSize() {
  try {
    const db  = await openDB();
    const all = await new Promise((res, rej) => {
      const tx  = db.transaction(THUMB_STORE, 'readonly');
      const req = tx.objectStore(THUMB_STORE).getAll();
      req.onsuccess = () => res(req.result ?? []);
      req.onerror   = () => rej(req.error);
    });
    const bytes = all.reduce((s, e) => s + (e.dataURI?.length ?? 0) * 0.75, 0);
    return { count: all.length, mb: (bytes / 1024 / 1024).toFixed(1) };
  } catch { return { count: 0, mb: '0.0' }; }
}
