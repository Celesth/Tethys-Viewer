// ── STATE ──────────────────────────────────────────────────────
const state = {
  files: {},
  tree: {},
  currentForum: null,
  currentChannel: null,
  currentThreads: [],
  allThreads: [],
  activeTag: null,
  activeThread: null,
  recentLinks: [],   // [{ msg, thread, forumKey, ts }] sorted newest first
  folders: [],
  modalCtx: null,
};
