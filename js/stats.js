// ── STATS ──────────────────────────────────────────────────────
function updateStats() {
  let threads = 0, msgs = 0, forumCount = 0;
  for (const [, v] of Object.entries(state.tree.forums ?? {})) {
    forumCount++;
    threads += v.threads.length;
    msgs    += v.threads.reduce((s, t) => s + (t.messages?.length ?? 0), 0);
  }
  for (const [, v] of Object.entries(state.tree.channels ?? {})) {
    msgs    += v.messages.length;
    threads += v.threads?.length ?? 0;
  }
  document.getElementById('stat-threads').textContent = threads;
  document.getElementById('stat-msgs').textContent    = msgs;
  document.getElementById('stat-forums').textContent  = forumCount;
  const firstName = state.tree.sections?.[0]?.catMeta?.name ?? state.tree.sections?.[0]?.folderName ?? '';
  document.getElementById('status-path').textContent  = firstName;
}
