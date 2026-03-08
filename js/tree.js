function parseFolderFiles(files) {
  // Group file paths by their category folder (first dir after the root)
  const catBuckets = {}; // catKey → { files }

  for (const [fpath, entry] of Object.entries(files)) {
    const parts = fpath.split('/');
    // parts[0] = root folder name (the one you picked)
    // parts[1] = category subfolder  (e.g. "Guild-2024-01-01T00-00-00-Characters")
    // parts[2] = channel/forum dir   (e.g. "forum-ellen-joe")
    // parts[3] = file                (e.g. "_forum.toml")
    // Some backups may be flat (no category subdir), handle depth=2 too
    if (parts.length < 2) continue;

    // Detect depth: if parts[1] is forum-/channel-/voice- or _category.toml → flat (no catdir)
    const depth1 = parts[1];
    const isCatFile = entry.name === '_category.toml';
    const isChannelDir = depth1.startsWith('forum-') || depth1.startsWith('channel-') || depth1.startsWith('voice-');

    let catKey;
    if (parts.length === 2 && isCatFile) {
      // flat: root/_category.toml
      catKey = '__root__';
    } else if (parts.length >= 3 && isChannelDir) {
      // flat structure: root/forum-x/file.toml
      catKey = '__root__';
    } else if (parts.length >= 2) {
      // nested: root/CategoryFolder/...
      catKey = depth1;
    } else {
      catKey = '__root__';
    }

    if (!catBuckets[catKey]) catBuckets[catKey] = {};
    // Store with path relative to the catKey so inner parser sees consistent depth
    const relPath = parts.slice(catKey === '__root__' ? 1 : 2).join('/');
    catBuckets[catKey][relPath] = entry;
  }

  // Parse each bucket into { catMeta, forums, channels }
  return Object.entries(catBuckets).map(([catKey, catFiles]) => {
    const forums   = {};
    const channels = {};
    let   catMeta  = null;

    for (const [relPath, { content, name }] of Object.entries(catFiles)) {
      const parts = relPath.split('/');

      if (name === '_category.toml') {
        catMeta = parseTOML(content);
        continue;
      }

      // After stripping catdir, parts[0] = forum-x or channel-x, parts[1] = file
      const subfolder = parts.length >= 2 ? parts[parts.length - 2] : (parts[0] || null);
      if (!subfolder) continue;

      if (subfolder.startsWith('forum-')) {
        if (!forums[subfolder]) forums[subfolder] = { meta: null, threads: [] };
        if (name === '_forum.toml') {
          forums[subfolder].meta = parseTOML(content);
        } else if (name.endsWith('.toml')) {
          const thread = parseTOML(content);
          thread._fileName = name;
          forums[subfolder].threads.push(thread);
        }
      } else if (subfolder.startsWith('channel-')) {
        if (!channels[subfolder]) channels[subfolder] = { meta: null, messages: [], threads: [] };
        if (name === '_channel.toml') {
          channels[subfolder].meta = parseTOML(content);
        } else if (name === 'messages.toml') {
          const d = parseTOML(content);
          channels[subfolder].messages = d.messages || [];
        } else if (name.startsWith('thread-') && name.endsWith('.toml')) {
          const t = parseTOML(content);
          t._fileName = name;
          channels[subfolder].threads.push(t);
        }
      }
    }

    return { catKey, catMeta, forums, channels };
  });
}

function buildTree() {
  // Each picked folder may contain multiple category subfolders
  // sections = flat list of all { folderKey, folderName, catKey, catMeta, forums, channels }
  const sections = [];

  for (const folder of state.folders) {
    const parsed = parseFolderFiles(folder.files);
    for (const cat of parsed) {
      sections.push({
        folderKey:  folder.key,
        folderName: folder.name,
        catKey:     cat.catKey,
        catMeta:    cat.catMeta,
        forums:     cat.forums,
        channels:   cat.channels,
      });
    }
  }

  // Build flat lookup maps — sectionId = folderKey + '::' + catKey
  const forums   = {};
  const channels = {};
  for (const s of sections) {
    const sid = s.folderKey + '::' + s.catKey;
    for (const [k, v] of Object.entries(s.forums))   forums[sid + '::' + k]   = v;
    for (const [k, v] of Object.entries(s.channels)) channels[sid + '::' + k] = v;
    s.sectionId = sid;
  }

  state.tree = { sections, forums, channels };
  renderTree();
  updateStats();
}

// ── TREE RENDER ────────────────────────────────────────────────
function renderTree() {
  const root = document.getElementById('tree-root');
  root.innerHTML = '';

  const sections = state.tree.sections ?? [];
  let   totalItems = 0;
  let   autoOpened = false;

  for (const section of sections) {
    const { folderKey, sectionId, catMeta, forums, channels } = section;
    const catName     = catMeta?.name ?? section.catKey.replace(/__root__/, section.folderName);
    const forumKeys   = Object.keys(forums);
    const channelKeys = Object.keys(channels);
    totalItems += forumKeys.length + channelKeys.length;

    // ── Category row ───────────────────────────────────────────
    const catEl = document.createElement('div');
    catEl.className = 'tree-category open';
    catEl.innerHTML = `<span class="caret">▶</span><span class="cat-icon" style="font-size:9px">▸</span><span style="flex:1;text-transform:uppercase;letter-spacing:0.08em;font-size:10px">${escHtml(catName)}</span>`;

    const addCatBtn = document.createElement('button');
    addCatBtn.className = 'tree-add-btn';
    addCatBtn.title = 'add channel or forum';
    addCatBtn.textContent = '+';
    addCatBtn.onclick = (e) => { e.stopPropagation(); openModal('channel', null, sectionId); };

    const removeBtn = document.createElement('button');
    removeBtn.className = 'tree-add-btn';
    removeBtn.title = 'remove folder';
    removeBtn.textContent = '✕';
    removeBtn.style.color = 'var(--text2)';
    removeBtn.onclick = (e) => { e.stopPropagation(); removeFolder(folderKey); };

    catEl.appendChild(addCatBtn);
    catEl.appendChild(removeBtn);

    const children = document.createElement('div');
    children.className = 'tree-children open';

    catEl.onclick = (e) => {
      if (e.target === addCatBtn || e.target === removeBtn) return;
      catEl.classList.toggle('open');
      children.classList.toggle('open');
    };

    root.appendChild(catEl);
    root.appendChild(children);

    // ── Forums ─────────────────────────────────────────────────
    for (const key of forumKeys.sort()) {
      const f       = forums[key];
      const name    = f.meta?.name ?? key.replace('forum-', '');
      const fullKey = sectionId + '::' + key;
      const el      = makeTreeItem('💬', 'type-forum', name, f.threads.length,
        () => { setActiveTree(el); openForum(fullKey); },
        () => openModal('thread', fullKey));
      children.appendChild(el);

      if (!autoOpened) { el.classList.add('active'); openForum(fullKey); autoOpened = true; }
    }

    // ── Channels ───────────────────────────────────────────────
    for (const key of channelKeys.sort()) {
      const c       = channels[key];
      const name    = c.meta?.name ?? key.replace('channel-', '');
      const fullKey = sectionId + '::' + key;
      const el      = makeTreeItem('#', 'type-channel', name, c.messages.length,
        () => { setActiveTree(el); openChannel(fullKey); },
        () => openModal('thread', fullKey));
      children.appendChild(el);
    }
  }

  document.getElementById('tree-badge').textContent = `${totalItems} items`;

  if (sections.length === 0) {
    document.getElementById('topbar-title').textContent = 'backup viewer';
  } else if (sections.length === 1) {
    const n = sections[0].catMeta?.name ?? sections[0].folderName;
    document.getElementById('topbar-title').textContent = `backup — ${n}`;
  } else {
    document.getElementById('topbar-title').textContent = `backup — ${sections.length} folders`;
  }
}

function makeTreeItem(icon, iconClass, name, count, onClick, onAdd) {
  const el = document.createElement('div');
  el.className = 'tree-item';
  el.innerHTML = `<span class="item-icon ${iconClass}">${icon}</span><span class="item-name">${escHtml(name)}</span>`;

  const countSpan = document.createElement('span');
  countSpan.className = 'item-count';
  countSpan.textContent = count;

  const addBtn = document.createElement('button');
  addBtn.className = 'tree-add-btn';
  addBtn.title = 'new thread';
  addBtn.textContent = '+';
  addBtn.style.display = 'none';
  addBtn.onclick = (e) => { e.stopPropagation(); onAdd(); };

  el.appendChild(countSpan);
  el.appendChild(addBtn);
  el.onmouseenter = () => { addBtn.style.display = 'flex'; countSpan.style.display = 'none'; };
  el.onmouseleave = () => { addBtn.style.display = 'none'; countSpan.style.display = ''; };
  el.onclick = (e) => { if (e.target === addBtn) return; onClick(); };
  return el;
}

function setActiveTree(el) {
  document.querySelectorAll('.tree-item').forEach(e => e.classList.remove('active'));
  el.classList.add('active');
}
