// ── FORUM VIEW ─────────────────────────────────────────────────
function openForum(key) {
  const f = state.tree.forums[key];
  if (!f) return;
  state.currentForum = key;
  state.currentChannel = null;
  state.allThreads = f.threads;
  state.activeTag  = null;

  // switch views
  document.getElementById('empty-state').style.display  = 'none';
  document.getElementById('forum-view').classList.add('visible');
  document.getElementById('channel-view').classList.remove('visible');
  document.getElementById('recent-view')?.classList.remove('visible');

  const meta = f.meta ?? {};
  document.getElementById('fv-name').textContent  = meta.name ?? key.replace('forum-', '');
  document.getElementById('fv-topic').textContent = meta.topic ?? '';
  document.getElementById('fv-threads').textContent = f.threads.length;
  const totalMsgs = f.threads.reduce((s, t) => s + (t.messages?.length ?? 0), 0);
  document.getElementById('fv-msgs').textContent = totalMsgs;

  document.getElementById('mid-title').textContent = meta.name ?? key;
  document.getElementById('mid-badge').textContent = `${f.threads.length} posts`;

  // Tags
  const tagsRow = document.getElementById('tags-row');
  tagsRow.innerHTML = '';
  const allTags = new Set();
  f.threads.forEach(t => (t.appliedTags ?? []).forEach(tag => allTags.add(tag)));
  if (allTags.size) {
    const all = document.createElement('div');
    all.className = 'tag active';
    all.textContent = 'all';
    all.onclick = () => { state.activeTag = null; setActiveTag(all); filterThreads(document.getElementById('thread-search').value); };
    tagsRow.appendChild(all);
    for (const tag of allTags) {
      const el = document.createElement('div');
      el.className = 'tag';
      el.textContent = tag;
      el.onclick = () => { state.activeTag = tag; setActiveTag(el); filterThreads(document.getElementById('thread-search').value); };
      tagsRow.appendChild(el);
    }
  }

  document.getElementById('thread-search').value = '';
  renderThreads(f.threads);
  clearThreadDetail();
}

function setActiveTag(el) {
  document.querySelectorAll('.tag').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
}

function filterThreads(query) {
  const f = state.tree.forums[state.currentForum];
  if (!f) return;
  let threads = f.threads;
  if (state.activeTag) {
    threads = threads.filter(t => (t.appliedTags ?? []).includes(state.activeTag));
  }
  if (query.trim()) {
    const q = query.toLowerCase();
    threads = threads.filter(t =>
      t.name?.toLowerCase().includes(q) ||
      (t.messages ?? []).some(m => m.content?.toLowerCase().includes(q))
    );
  }
  renderThreads(threads);
}

function renderThreads(threads) {
  const container = document.getElementById('threads-container');
  container.innerHTML = '';

  if (!threads.length) {
    container.innerHTML = '<div class="no-data"><div class="icon">🔍</div>no posts found</div>';
    return;
  }

  // Sort: active first, then archived; newest first within each group
  const sorted = [...threads].sort((a, b) => {
    if (a.archived !== b.archived) return a.archived ? 1 : -1;
    return new Date(b.createdAt ?? 0) - new Date(a.createdAt ?? 0);
  });

  for (const thread of sorted) {
    const card = document.createElement('div');
    card.className = `thread-card fade-in${thread.archived ? ' archived' : ''}`;

    const preview = thread.messages?.[0]?.content ?? '';
    const previewText = preview.slice(0, 80) + (preview.length > 80 ? '…' : '');
    const author  = thread.messages?.[0]?.author ?? '?';
    const initials = author.slice(0, 2).toUpperCase();
    const date   = thread.createdAt ? new Date(thread.createdAt).toLocaleDateString() : '';
    const msgCount = thread.messages?.length ?? 0;

    const tagsHtml = (thread.appliedTags ?? [])
      .map(t => `<span class="thread-tag">${escHtml(t)}</span>`).join('');

    card.innerHTML = `
      <div class="thread-avatar">${initials}</div>
      <div class="thread-main">
        <div class="thread-title">
          ${escHtml(thread.name ?? 'untitled')}
          ${thread.archived ? '<span class="archived-badge">archived</span>' : ''}
        </div>
        ${previewText ? `<div class="thread-preview">${escHtml(previewText)}</div>` : ''}
        ${tagsHtml ? `<div class="thread-tags">${tagsHtml}</div>` : ''}
        <div class="thread-meta"><span>${date}</span></div>
      </div>
      <div class="thread-right">
        <span class="thread-count">${msgCount} msg${msgCount !== 1 ? 's' : ''}</span>
      </div>
    `;
    card.onclick = () => {
      document.querySelectorAll('.thread-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      openThreadDetail(thread);
    };
    container.appendChild(card);
  }
}

// ── THREAD DETAIL ──────────────────────────────────────────────
function openThreadDetail(thread) {
  document.getElementById('thread-detail-empty').style.display = 'none';
  const td = document.getElementById('thread-detail');
  td.classList.add('visible');

  // Store active thread reference for composer
  state.activeThread = thread;

  document.getElementById('td-name').textContent = thread.name ?? 'untitled';
  document.getElementById('right-badge').textContent = `${thread.messages?.length ?? 0} msgs`;

  const meta = document.getElementById('td-meta');
  meta.innerHTML = '';
  const pills = [
    { label: thread.archived ? 'archived' : 'active', dotClass: thread.archived ? 'yellow' : 'green' },
    { label: thread.locked   ? 'locked'   : 'unlocked', dotClass: thread.locked ? 'red' : 'green' },
  ];
  if (thread.createdAt) pills.push({ label: new Date(thread.createdAt).toLocaleDateString() });
  for (const p of pills) {
    const el = document.createElement('div');
    el.className = 'meta-pill';
    el.innerHTML = p.dotClass ? `<div class="dot ${p.dotClass}"></div>${p.label}` : p.label;
    meta.appendChild(el);
  }

  renderMessages(thread.messages ?? [], document.getElementById('thread-messages'));

  // Show composer
  document.getElementById('thread-composer').classList.add('visible');
  document.getElementById('composer-text').value = '';
  document.getElementById('composer-url').value = '';
}

function clearThreadDetail() {
  document.getElementById('thread-detail-empty').style.display = 'flex';
  document.getElementById('thread-detail').classList.remove('visible');
  document.getElementById('thread-composer').classList.remove('visible');
  document.getElementById('right-badge').textContent = '—';
  state.activeThread = null;
}

function sendComposerMessage() {
  const text    = document.getElementById('composer-text').value.trim();
  const urlRaw  = document.getElementById('composer-url').value.trim();
  const thread  = state.activeThread;
  if (!thread || (!text && !urlRaw)) return;

  // Build content string
  const content = urlRaw ? (text ? `${text}\n${urlRaw}` : urlRaw) : text;

  // Build message object matching TOML structure
  const msg = {
    author:       'you',
    content,
    createdAt:    new Date().toISOString(),
    pinned:       false,
    attachments:  '',
    thumbnail:    '',
    linkPreviews: urlRaw ? [{ url: urlRaw, title: '', desc: '', image: '', site: '' }] : [],
    _local:       true,
  };

  if (!thread.messages) thread.messages = [];
  thread.messages.push(msg);

  // Re-render the thread
  const container = document.getElementById('thread-messages');
  renderMessages(thread.messages, container);
  container.scrollTop = container.scrollHeight;

  // Update badge
  document.getElementById('right-badge').textContent = `${thread.messages.length} msgs`;

  // Clear inputs
  document.getElementById('composer-text').value = '';
  document.getElementById('composer-url').value = '';
  document.getElementById('composer-text').focus();

  // Update thread card preview in middle panel
  const cards = document.querySelectorAll('.thread-card.active');
  if (cards.length) {
    const countEl = cards[0].querySelector('.thread-count');
    if (countEl) countEl.textContent = `${thread.messages.length} msgs`;
  }
}

// ── RECENT VIEW ────────────────────────────────────────────────
function fmtTimestamp(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const mo = d.toLocaleString('en-US', { month: 'short' });
  const day = d.getDate();
  const yr  = d.getFullYear();
  const hh  = String(d.getHours()).padStart(2, '0');
  const mm  = String(d.getMinutes()).padStart(2, '0');
  return `${mo} ${day}, ${yr} · ${hh}:${mm}`;
}

function openRecentView() {
  document.getElementById('empty-state').style.display   = 'none';
  document.getElementById('forum-view').classList.remove('visible');
  document.getElementById('channel-view').classList.remove('visible');

  const view = document.getElementById('recent-view');
  view.classList.add('visible');

  document.getElementById('mid-title').textContent = 'recent links';
  const links = state.recentLinks;
  document.getElementById('mid-badge').textContent = `${links.length} links`;

  clearThreadDetail();

  const container = document.getElementById('recent-container');
  container.innerHTML = '';

  if (!links.length) {
    container.innerHTML = '<div class="no-data"><div class="icon">🔗</div>no links found</div>';
    return;
  }

  for (const { msg, thread, forumKey, ts } of links) {
    const card = document.createElement('div');
    card.className = 'recent-card fade-in';

    // Get the best preview source
    const previews = msg.linkPreviews ?? [];
    const firstP   = previews[0] ?? {};
    const url      = firstP.url || extractUrls(msg.content ?? '')[0] || '';
    const title    = firstP.title || msg.content?.slice(0, 80) || url;
    const thumb    = firstP.image || msg.thumbnail || '';
    const site     = firstP.site || (url ? (() => { try { return new URL(url).hostname.replace('www.',''); } catch { return ''; } })() : '');
    const timeStr  = fmtTimestamp(msg.createdAt);
    const author   = msg.author ?? '?';
    const threadName = thread?.name ?? forumKey.split('::').pop().replace('forum-','').replace('channel-','');

    card.innerHTML = `
      <div class="recent-thumb-wrap">
        ${thumb ? `<img class="recent-thumb" src="" alt="">` : `<div class="recent-thumb-ph">🔗</div>`}
      </div>
      <div class="recent-info">
        <div class="recent-title">${escHtml(title)}</div>
        <div class="recent-meta">
          <span class="recent-site">${escHtml(site)}</span>
          <span class="recent-sep">·</span>
          <span class="recent-author">${escHtml(author)}</span>
          <span class="recent-sep">·</span>
          <span class="recent-time">${escHtml(timeStr)}</span>
        </div>
        <div class="recent-thread">in <span>${escHtml(threadName)}</span></div>
      </div>
      ${url ? `<a class="recent-open" href="${escHtml(url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">↗</a>` : ''}
    `;

    // Set img src via DOM (avoids & escaping corruption)
    if (thumb) {
      const img = card.querySelector('.recent-thumb');
      img.src = thumb;
      img.onerror = () => { img.style.display = 'none'; card.querySelector('.recent-thumb-wrap').innerHTML = '<div class="recent-thumb-ph">🔗</div>'; };
    }

    // Click → open thread detail if we have one
    if (thread) {
      card.onclick = () => {
        // Find and activate the thread in whatever forum it belongs to
        openForum(forumKey);
        // Wait for render then click the matching card
        setTimeout(() => {
          const cards = document.querySelectorAll('.thread-card');
          for (const c of cards) {
            if (c.querySelector('.thread-title')?.textContent.trim() === thread.name) {
              c.click(); break;
            }
          }
        }, 50);
      };
      card.style.cursor = 'pointer';
    }

    container.appendChild(card);
  }
}
