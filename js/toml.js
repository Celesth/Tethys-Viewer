// ── TOML PARSER ────────────────────────────────────────────────
// Handles: primitives, [table], [[array]], [[parent.child]] nested arrays
function parseTOML(src) {
  const lines = src.split('\n');
  const root  = {};
  let cur     = root;

  // Resolve a dot-path like "messages" or "messages.linkPreviews" from root,
  // following the LAST item of any array along the way.
  function resolvePath(parts, obj) {
    let node = obj;
    for (const p of parts) {
      if (!node[p]) node[p] = {};
      // If it's an array, follow the last element
      if (Array.isArray(node[p])) {
        node = node[p][node[p].length - 1];
      } else {
        node = node[p];
      }
    }
    return node;
  }

  for (let raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    // [[array of tables]] — may be dotted: [[messages.linkPreviews]]
    const arrMatch = line.match(/^\[\[(.+)\]\]$/);
    if (arrMatch) {
      const parts   = arrMatch[1].trim().split('.');
      const lastKey = parts.pop();
      // Navigate to parent (following last array items along the way)
      const parent  = parts.length ? resolvePath(parts, root) : root;
      if (!Array.isArray(parent[lastKey])) parent[lastKey] = [];
      const item = {};
      parent[lastKey].push(item);
      cur = item;
      continue;
    }

    // [table] — dot-pathed
    const tblMatch = line.match(/^\[([^\[\]]+)\]$/);
    if (tblMatch) {
      const parts = tblMatch[1].trim().split('.');
      cur = root;
      for (const p of parts) {
        if (!cur[p]) cur[p] = {};
        if (Array.isArray(cur[p])) cur = cur[p][cur[p].length - 1];
        else cur = cur[p];
      }
      continue;
    }

    // key = value
    const eqIdx = line.indexOf('=');
    if (eqIdx < 0) continue;
    const key    = line.slice(0, eqIdx).trim();
    const valRaw = line.slice(eqIdx + 1).trim();
    cur[key] = parseValue(valRaw);
  }
  return root;
}

function parseValue(v) {
  if (v === 'true')  return true;
  if (v === 'false') return false;
  if (v.startsWith('"')) {
    return v.slice(1, v.lastIndexOf('"'))
      .replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (v.startsWith('[')) {
    const inner = v.slice(1, v.lastIndexOf(']')).trim();
    if (!inner) return [];
    return inner.split(',').map(s => parseValue(s.trim()));
  }
  const n = Number(v);
  return isNaN(n) ? v : n;
}



// Given all files from one picked root folder, split them into per-category sections.
// Path structure: rootName/CategoryFolder/_category.toml
//                 rootName/CategoryFolder/forum-x/_forum.toml
//                 rootName/CategoryFolder/forum-x/Thread.toml
// Returns array of { catKey, catMeta, forums, channels }
