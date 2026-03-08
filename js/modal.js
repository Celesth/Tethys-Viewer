// ── MODAL ─────────────────────────────────────────────────────
function openModal(mode, forumKey = null, sectionId = null) {
  state.modalCtx = { mode, forumKey, sectionId };
  const overlay  = document.getElementById('modal-overlay');
  const titleEl  = document.getElementById('modal-title-text');
  const labelEl  = document.getElementById('modal-label');
  const typeRow  = document.getElementById('modal-type-row');
  const input    = document.getElementById('modal-input');

  if (mode === 'channel') {
    titleEl.textContent = 'new channel / forum';
    labelEl.textContent = 'name';
    typeRow.style.display = '';
  } else {
    const parentName = (forumKey ?? '').split('::').pop().replace('forum-', '').replace('channel-', '');
    titleEl.textContent = `new thread in ${parentName}`;
    labelEl.textContent = 'thread name';
    typeRow.style.display = 'none';
  }

  input.value = '';
  overlay.classList.remove('hidden');
  setTimeout(() => input.focus(), 50);
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modal-overlay') && e.type === 'click') return;
  document.getElementById('modal-overlay').classList.add('hidden');
  state.modalCtx = null;
}

function confirmModal() {
  const input = document.getElementById('modal-input').value.trim();
  if (!input) return;
  const ctx = state.modalCtx;
  if (!ctx) return;

  if (ctx.mode === 'channel') {
    const type    = document.getElementById('modal-type').value;
    const subKey  = (type === 'forum' ? 'forum-' : 'channel-') + input.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const section = state.tree.sections.find(s => s.sectionId === ctx.sectionId) ?? state.tree.sections[0];
    if (!section) return;
    const fullKey = section.sectionId + '::' + subKey;
    if (type === 'forum') {
      section.forums[subKey] = { meta: { name: input, topic: '' }, threads: [] };
      state.tree.forums[fullKey] = section.forums[subKey];
    } else {
      section.channels[subKey] = { meta: { name: input, topic: '', type: 0 }, messages: [], threads: [] };
      state.tree.channels[fullKey] = section.channels[subKey];
    }
  } else if (ctx.mode === 'thread') {
    const newThread = {
      name: input, archived: false, locked: false,
      createdAt: new Date().toISOString(),
      messages: [], appliedTags: [], _new: true,
    };
    if (state.tree.forums[ctx.forumKey])        state.tree.forums[ctx.forumKey].threads.push(newThread);
    else if (state.tree.channels[ctx.forumKey]) state.tree.channels[ctx.forumKey].threads.push(newThread);
  }

  document.getElementById('modal-overlay').classList.add('hidden');
  state.modalCtx = null;
  renderTree();
  updateStats();
}

function clearOGCache() {
  let removed = 0;
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k?.startsWith(CACHE_PREFIX)) { localStorage.removeItem(k); removed++; }
  }
  embedCache.clear();
  inFlight.clear();
  updateCacheStats();
  setStatus(`cache cleared — ${removed} entries removed`, 'yellow');
  setTimeout(() => setStatus('ready', 'green'), 2000);
}


function setStatus(text, color = 'idle') {
  document.getElementById('status-text').textContent = text;
  const dot = document.getElementById('status-dot');
  dot.className = `dot ${color === 'green' ? '' : color === 'yellow' ? 'yellow' : 'idle'}`;
  if (color === 'green') dot.style.background = 'var(--green)';
  else if (color === 'yellow') dot.style.background = 'var(--yellow)';
  else dot.style.background = 'var(--text2)';
}
