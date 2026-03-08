// ── CHANNEL VIEW ───────────────────────────────────────────────
function openChannel(key) {
  const c = state.tree.channels[key];
  if (!c) return;
  state.currentChannel = key;
  state.currentForum   = null;

  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('forum-view').classList.remove('visible');
  document.getElementById('channel-view').classList.add('visible');

  const meta = c.meta ?? {};
  document.getElementById('cv-name').textContent  = meta.name ?? key.replace('channel-', '');
  document.getElementById('cv-hash').textContent  = meta.type === 5 ? '📢' : '#';
  document.getElementById('cv-topic').textContent = meta.topic ?? '';
  document.getElementById('mid-title').textContent = meta.name ?? key;
  document.getElementById('mid-badge').textContent = `${c.messages.length} msgs`;

  renderMessages(c.messages, document.getElementById('messages-container'));

  clearThreadDetail();
}
