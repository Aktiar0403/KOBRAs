// js/cards.js
// Responsible for rendering member cards used by admin.js
// Exported function: renderCards(containerElement, membersArray, options)

export function renderCards(gridEl, members, options = {}) {
  gridEl.innerHTML = '';
  const showAdminActions = !!options.showAdminActions;

  members.forEach(m => {
    const id = m.id || '';
    const name = m.name || '';
    const role = m.role || '';
    const squad = m.squad || '';
    const power = (m.power !== undefined && m.power !== null) ? Number(m.power).toFixed(1) : '0.0';
    const stars = m.stars || 1;
    const powerType = m.powerType || 'Precise';

    // compute lastUpdated millis if available
    let lastTsMs = '';
    if (m.lastUpdated && typeof m.lastUpdated.toMillis === 'function') {
      lastTsMs = m.lastUpdated.toMillis();
    } else if (m.lastUpdated && typeof m.lastUpdated === 'number') {
      lastTsMs = m.lastUpdated;
    }

    const updatedLabel = lastTsMs ? ('Updated ' + (function(){
      const now = Date.now();
      const seconds = Math.floor((now - lastTsMs) / 1000);
      if (seconds < 60) return 'just now';
      if (seconds < 3600) return Math.floor(seconds/60) + ' mins ago';
      if (seconds < 86400) return Math.floor(seconds/3600) + ' hrs ago';
      return Math.floor(seconds/86400) + ' days ago';
    })()) : 'Updated never';

    const card = document.createElement('div');
    card.className = 'member-card';
    card.dataset.id = id;

    card.innerHTML = `
      <div class="card-top" style="display:flex;gap:0.75rem;align-items:center;">
        <div class="avatar" style="width:44px;height:44px;border-radius:50%;background:#ddd;flex:0 0 44px;"></div>
        <div style="flex:1;">
          <div class="name" style="font-weight:600;">${escapeHtml(name)}</div>
          <div class="muted xsmall">${escapeHtml(role)}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:700;">${escapeHtml(power)}</div>
          <div style="font-size:0.8rem">${escapeHtml(squad)}</div>
        </div>
      </div>

      <div class="card-body" style="margin-top:0.6rem;">
        <div class="power-row" style="display:flex;align-items:center;gap:0.5rem;">
          <div class="power">Power: <strong>${escapeHtml(power)}</strong></div>
          <div class="power-type-pill" style="padding:2px 8px;border-radius:999px;font-size:0.75rem;background:rgba(0,0,0,0.06);border:1px solid rgba(0,0,0,0.06);">
            ${escapeHtml(powerType)}
          </div>
        </div>

        <div class="member-meta" style="display:flex;gap:0.75rem;margin-top:0.5rem;align-items:center;">
          <div class="muted xsmall updated-label" data-lastts="${lastTsMs || ''}" data-id="${id}">
            ${escapeHtml(updatedLabel)}
          </div>
          <div class="muted xsmall">Stars: ${escapeHtml(String(stars))}</div>
        </div>
      </div>

      <div class="card-actions" style="margin-top:0.6rem;display:flex;gap:0.5rem;">
        ${ showAdminActions ? `<button class="btn btn-edit" data-id="${id}">Edit</button>
                               <button class="btn btn-delete" data-id="${id}">Delete</button>` : ''}
      </div>
    `;

    // wire admin buttons if present
    if (showAdminActions) {
      const btnEdit = card.querySelector('.btn-edit');
      const btnDelete = card.querySelector('.btn-delete');

      if (btnEdit && typeof options.onEdit === 'function') {
        btnEdit.addEventListener('click', () => options.onEdit(m));
      }
      if (btnDelete && typeof options.onDelete === 'function') {
        btnDelete.addEventListener('click', () => options.onDelete(m));
      }
    }

    gridEl.appendChild(card);
  });
}

// local escape helper
function escapeHtml(str) {
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
