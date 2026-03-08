// ── MESSAGE RENDERER ───────────────────────────────────────────
function renderMessages(messages, container) {
  const _t0 = performance.now();
  container.innerHTML = '';
  if (!messages.length) {
    container.innerHTML = '<div class="no-data"><div class="icon">💬</div>no messages</div>';
    updateImgTiming(0, 0, 0);
    return;
  }

  // Group consecutive messages by same author (within 5 min)
  let lastAuthor = null, lastTime = 0, groupEl = null;
  for (const msg of messages) {
    const ts       = msg.createdAt ? new Date(msg.createdAt).getTime() : 0;
    const sameAuth = msg.author === lastAuthor && (ts - lastTime) < 5 * 60 * 1000;

    if (!sameAuth) {
      groupEl = document.createElement('div');
      groupEl.className = 'msg-group fade-in';
      const header = document.createElement('div');
      header.className = 'msg-header';
      const timeStr = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';
      header.innerHTML = `
        <span class="msg-author">${escHtml(msg.author ?? 'Unknown')}</span>
        <span class="msg-time">${timeStr}</span>
        ${msg.pinned ? '<span class="msg-pinned-badge">📌 pinned</span>' : ''}
      `;
      groupEl.appendChild(header);
      container.appendChild(groupEl);
      lastAuthor = msg.author;
      lastTime   = ts;
    }

    const content = document.createElement('div');
    content.className = 'msg-content';
    content.innerHTML = formatContent(msg.content ?? '');
    if (groupEl) groupEl.appendChild(content);

    // Thumbnail — use flat msg.thumbnail from TOML first (fastest path),
    // then walk linkPreviews for richer data, fall back to live fetch if neither exists
    const thumbnail    = msg.thumbnail ?? '';
    const previews     = msg.linkPreviews ?? [];
    const firstPreview = previews.find(p => p.url);

    if (thumbnail || firstPreview) {
      // Build from TOML data — zero network requests
      const sources = previews.length ? previews : [{ url: '', image: thumbnail, title: '', desc: '', site: '' }];
      for (const p of sources.slice(0, 3)) {
        const imgSrc = p.image || thumbnail || '';
        if (!p.url && !imgSrc) continue;
        const data = {
          title: p.title ?? '',
          desc:  p.desc  ?? '',
          image: imgSrc,
          site:  p.site  ?? (() => { try { return new URL(p.url).hostname; } catch { return ''; } })(),
        };
        const embed = createLinkEmbedFromData(p.url || '', data);
        if (groupEl) groupEl.appendChild(embed);
      }
    } else {
      // Old backup — no linkPreviews saved, fall back to live fetch
      const contentUrls = extractUrls(msg.content ?? '');
      for (const url of contentUrls.slice(0, 3)) {
        const embed = createLinkEmbed(url);
        if (groupEl) groupEl.appendChild(embed);
      }
    }

    // Attachments (file links from backup)
    if (msg.attachments) {
      const urls = msg.attachments.split(',').map(u => u.trim()).filter(Boolean);
      for (const url of urls) {
        // If it's a direct media URL, show as embed too
        if (url.match(/\.(jpg|jpeg|png|gif|webp|mp4|mov)$/i)) {
          const att = document.createElement('div');
          att.className = 'msg-attachment';
          att.innerHTML = `🖼️ ${escHtml(url.split('/').pop() ?? url)}`;
          att.onclick = () => window.open(url, '_blank');
          if (groupEl) groupEl.appendChild(att);
        } else {
          const embed = createLinkEmbed(url);
          if (groupEl) groupEl.appendChild(embed);
        }
      }
    }
  }

  // Count how many embeds have pre-loaded thumbnails vs need live fetch
  const totalEmbeds  = container.querySelectorAll('.link-embed').length;
  const tomlEmbeds   = messages.reduce((s, m) => s + ((m.thumbnail || (m.linkPreviews ?? []).length) ? 1 : 0), 0);
  const liveEmbeds   = totalEmbeds - tomlEmbeds;
  const elapsed      = Math.round(performance.now() - _t0);
  updateImgTiming(elapsed, tomlEmbeds, liveEmbeds);
}
