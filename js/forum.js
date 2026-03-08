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
}

function clearThreadDetail() {
  document.getElementById('thread-detail-empty').style.display = 'flex';
  document.getElementById('thread-detail').classList.remove('visible');
  document.getElementById('right-badge').textContent = '—';
}
