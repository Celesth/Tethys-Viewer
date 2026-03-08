// ── LINK PREVIEW CACHE ────────────────────────────────────────
// Two-layer cache: in-memory Map (instant) + localStorage (persists across reloads)
// localStorage key: "tethys_og_" + url
// Each entry: { title, desc, image, site, cachedAt } — expires after 7 days

const CACHE_PREFIX  = 'tethys_og_';
const CACHE_TTL_MS  = 7 * 24 * 60 * 60 * 1000; // 7 days
const embedCache    = new Map(); // in-flight / in-memory dedup

function ogCacheGet(url) {
  // 1. Check in-memory first (catches in-flight and already-resolved this session)
  if (embedCache.has(url)) return embedCache.get(url);
  // 2. Check localStorage
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + url);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    // Expire old entries
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_PREFIX + url);
      return null;
    }
    // Warm the in-memory cache too
    embedCache.set(url, entry.data);
    return entry.data;
  } catch {
    return null;
  }
}

function ogCacheSet(url, data) {
  embedCache.set(url, data);
  try {
    localStorage.setItem(CACHE_PREFIX + url, JSON.stringify({ data, cachedAt: Date.now() }));
  } catch (e) {
    // localStorage full — prune oldest 20 entries and retry
    pruneOGCache(20);
    try { localStorage.setItem(CACHE_PREFIX + url, JSON.stringify({ data, cachedAt: Date.now() })); } catch { /* give up */ }
  }
  updateCacheStats();
}

function pruneOGCache(count = 10) {
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(CACHE_PREFIX)) {
      try {
        const entry = JSON.parse(localStorage.getItem(k));
        keys.push({ k, ts: entry.cachedAt ?? 0 });
      } catch { keys.push({ k, ts: 0 }); }
    }
  }
  // Remove oldest entries first
  keys.sort((a, b) => a.ts - b.ts).slice(0, count).forEach(({ k }) => localStorage.removeItem(k));
}

function getOGCacheSize() {
  let count = 0, bytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(CACHE_PREFIX)) {
      count++;
      bytes += (localStorage.getItem(k) ?? '').length * 2; // UTF-16
    }
  }
  return { count, kb: Math.round(bytes / 1024) };
}

function updateCacheStats() {
  // kept for clearOGCache compat — no-op now, UI replaced by timing
}

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
  if (fromLive > 0) parts.push(`${fromLive} live`);
  el.textContent = `imgs: ${ms}ms · ${parts.join(' · ')}`;
  el.title = `rendered in ${ms}ms — ${fromToml} from toml cache, ${fromLive} fetched live`;
}

// Flush expired entries on load
(function cleanExpired() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (!k?.startsWith(CACHE_PREFIX)) continue;
    try {
      const entry = JSON.parse(localStorage.getItem(k));
      if (Date.now() - entry.cachedAt > CACHE_TTL_MS) localStorage.removeItem(k);
    } catch { localStorage.removeItem(k); }
  }
})();

// Using allorigins as CORS proxy to fetch OG tags
const inFlight = new Set(); // prevent duplicate concurrent fetches for same URL

async function fetchOGData(url) {
  // Check persistent cache first
  const cached = ogCacheGet(url);
  if (cached !== null) return cached;

  // Prevent duplicate concurrent requests
  if (inFlight.has(url)) {
    // Poll until the other request finishes (max 8s)
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
    const getTitle = () => {
      const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      return m?.[1]?.trim() ?? null;
    };

    const data = {
      title: get('og:title') || getMeta('twitter:title') || getTitle() || new URL(url).hostname,
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

// Render embed from pre-fetched TOML data — image rendered as real <img> tag
function createLinkEmbedFromData(url, data) {
  const wrap = document.createElement('div');
  wrap.className = 'link-embed';
  if (url) wrap.onclick = () => window.open(url, '_blank');

  const imgUrl   = data?.image ?? '';
  const title    = data?.title ?? '';
  const desc     = data?.desc  ?? '';
  const site     = data?.site  ?? (() => { try { return new URL(url).hostname; } catch { return ''; } })();

  // Wide layout: image on top, text below (youtube, twitter etc or no url)
  // Narrow layout: image on the right side (most other links)
  const wideHosts = ['youtube.com', 'youtu.be', 'twitter.com', 'x.com', 'reddit.com', 'twitch.tv'];
  const isWide    = !url || wideHosts.some(h => url.includes(h));

  if (imgUrl) {
    // Build img element directly (avoids escHtml corrupting & in query params)
    const img = document.createElement('img');
    img.className = isWide ? 'link-embed-thumb wide' : 'link-embed-thumb';
    img.alt = '';
    img.src = imgUrl; // set directly, not via innerHTML — no escaping issues
    img.onerror = function() {
      this.style.display = 'none';
      wrap.classList.remove('has-thumb');
    };

    const body = document.createElement('div');
    body.className = 'link-embed-body';
    body.innerHTML = `
      ${site  ? `<div class="link-embed-site">${escHtml(site)}</div>` : ''}
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
    // No image — text only
    const body = document.createElement('div');
    body.className = 'link-embed-body';
    body.innerHTML = `
      ${site  ? `<div class="link-embed-site">${escHtml(site)}</div>` : ''}
      ${title ? `<div class="link-embed-title">${escHtml(title)}</div>` : (url ? `<div class="link-embed-title">${escHtml(url)}</div>` : '')}
      ${desc  ? `<div class="link-embed-desc">${escHtml(desc)}</div>`  : ''}
    `;
    wrap.appendChild(body);
  }
  return wrap;
}

// Create a placeholder embed element, then populate async
function createLinkEmbed(url) {
  const wrap = document.createElement('div');
  wrap.className = 'link-embed';
  wrap.onclick = () => window.open(url, '_blank');
  wrap.innerHTML = `<div class="link-embed-loading"><div class="spinner"></div><span>${escHtml(new URL(url).hostname)}</span></div>`;

  // Async populate — reuse createLinkEmbedFromData once data arrives
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
    // Build using the same safe DOM builder
    const filled = createLinkEmbedFromData(url, data);
    wrap.className = filled.className;
    while (filled.firstChild) wrap.appendChild(filled.firstChild);
  });

  return wrap;
}

function formatContent(text) {
  if (!text) return '<span class="msg-empty">— empty —</span>';
  const urlRegex = /(https?:\/\/[^\s<>"]+)/g;
  return escHtml(text).replace(urlRegex, '<a href="$1" target="_blank">$1</a>');
}

// Extract all URLs from a message content string
function extractUrls(text) {
  if (!text) return [];
  const urlRegex = /(https?:\/\/[^\s<>"]+)/g;
  return [...text.matchAll(urlRegex)].map(m => m[1]);
}
