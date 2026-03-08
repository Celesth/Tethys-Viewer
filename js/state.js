// ── STATE ──────────────────────────────────────────────────────
const state = {
  files: {},
  tree: {},
  currentForum: null,
  currentChannel: null,
  currentThreads: [],
  allThreads: [],
  activeTag: null,
  folders: [],        // [{ key, name, files }]
  modalCtx: null,     // { mode: 'channel'|'thread', forumKey }
};
