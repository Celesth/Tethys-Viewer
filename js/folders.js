// ── FILE INPUT → folder ingestion ─────────────────────────────
document.getElementById('file-input').addEventListener('change', async (e) => {
  const rawFiles = Array.from(e.target.files);
  if (!rawFiles.length) return;

  // Derive folder name from the common root prefix
  const firstPath  = rawFiles[0].webkitRelativePath || rawFiles[0].name;
  const folderName = firstPath.split('/')[0] || 'backup';
  const key        = folderName + '_' + Date.now();

  setStatus(`reading ${folderName}...`, 'yellow');

  const files = {};
  for (const file of rawFiles) {
    if (!file.name.endsWith('.toml')) continue;
    const path = file.webkitRelativePath || file.name;
    files[path] = { content: await file.text(), name: file.name };
  }

  // Persist to IndexedDB
  try { await dbSaveFolder(key, folderName, files); } catch { /* storage full — ok, still works in-memory */ }

  addFolder(key, folderName, files);
  // Reset input so same folder can be re-selected
  e.target.value = '';
});

function addFolder(key, name, files) {
  state.folders = state.folders.filter(f => f.name !== name);
  state.folders.push({ key, name, files });
  buildTree();
  setStatus(`loaded ${name}`, 'green');
}

async function removeFolder(key) {
  state.folders = state.folders.filter(f => f.key !== key);
  try { await dbRemoveFolder(key); } catch { /* ignore */ }
  buildTree();
}

function renderFolderList() { /* folders now rendered inside tree */ }

function renderFolderList() {
  const el = document.getElementById('folder-list');
  el.innerHTML = '';
  for (const folder of state.folders) {
    const row = document.createElement('div');
    row.className = 'folder-entry';
    const fileCount = Object.keys(folder.files).length;
    row.innerHTML = `<span style="color:var(--accent2);font-size:10px">📁</span>
      <span class="folder-name" title="${escHtml(folder.name)}">${escHtml(folder.name)}</span>
      <span style="font-size:9px;color:var(--text2);margin-left:4px">${fileCount}f</span>
      <span class="folder-remove" onclick="removeFolder('${escHtml(folder.key)}')" title="remove">✕</span>`;
    el.appendChild(row);
  }
}



// ── RESTORE SAVED FOLDERS ON LOAD ────────────────────────────
(async () => {
  try {
    const saved = await dbGetAllFolders();
    if (!saved.length) return;
    for (const { key, name, files } of saved) {
      state.folders.push({ key, name, files });
    }
    buildTree();
    setStatus(`restored ${saved.length} folder${saved.length > 1 ? 's' : ''}`, 'green');
  } catch { /* IndexedDB unavailable or empty */ }
})();
