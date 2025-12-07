// js/cards.js
// Responsible for rendering member cards used by admin.js

export function renderCards(gridEl, members, options = {}) {
  gridEl.innerHTML = '';
  const showAdminActions = !!options.showAdminActions;

  members.forEach(m => {
    const id = m.id || '';
    const name = m.name || '';
    const role = m.role || '';
    const squad = m.squad || '';
    const stars = m.stars || 1;

    const power = (m.power !== undefined && m.power !== null)
      ? Number(m.power).toFixed(1)
      : '0.0';

    const powerType = m.powerType || 'Precise';

    // timestamp
    let lastTsMs = '';
    if (m.lastUpdated && typeof m.lastUpdated.toMillis === 'function') {
      lastTsMs = m.lastUpdated.toMillis();
    }

    const updatedLabel = lastTsMs
      ? ('Updated ' + timeAgoInitial(lastTsMs))
      : 'Updated never';

    const card = document.createElement('div');
    card.className = 'member-card';
    card.dataset.id = id;

    card.style.margin = "10px";
    card.style.padding = "14px";
    card.style.borderRadius = "14px";
    card.style.background = "#1b1d23";
    card.style.border = "1px solid rgba(255,255,255,0.08)";

    // card content
    card.innerHTML = `
      <div class="card-top" style="display:flex; gap:0.75rem; align-items:center;">
        <div class="avatar"
             style="width:44px;height:44px;border-radius:50%;background:#ddd;flex:0 0 44px;">
        </div>

        <div style="flex:1;">
          <div class="name" style="font-weight:600;font-size:1rem;">
            ${escapeHtml(name)}
          </div>
          <div class="muted xsmall">${escapeHtml(role)}</div>
        </div>

        <div style="text-align:right;">
          <div style="font-weight:700; font-size:1.1rem;">
            ${escapeHtml(power)}
          </div>
          <div style="font-size:0.75rem; opacity:0.7;">
            ${escapeHtml(powerType)}
          </div>
        </div>
      </div>

      <div class="card-body" style="margin-top:0.6rem;">
        <div class="member-meta"
             style="display:flex; gap:0.75rem; margin-top:0.5rem; align-items:center;">
          <div class="muted xsmall updated-label"
               data-lastts="${lastTsMs || ''}"
               data-id="${id}">
            ${escapeHtml(updatedLabel)}
          </div>
          <div class="muted xsmall">
            Stars: ${escapeHtml(String(stars))}
          </div>
        </div>
      </div>

      <div class="card-actions"
           style="margin-top:0.6rem; display:flex; gap:0.5rem;">
        ${
          showAdminActions
            ? `<button class="btn btn-edit" data-id="${id}">Edit</button>
               <button class="btn btn-delete" data-id="${id}">Delete</button>`
            : ''
        }
      </div>
    `;

    // wire admin buttons
    if (showAdminActions) {
      const btnEdit = card.querySelector('.btn-edit');
      const btnDelete = card.querySelector('.btn-delete');

      btnEdit?.addEventListener('click', () => options.onEdit?.(m));
      btnDelete?.addEventListener('click', () => options.onDelete?.(m));
    }

    gridEl.appendChild(card);
  });
}

// Local helper for initial timestamp formatting
function timeAgoInitial(ms) {
  const now = Date.now();
  const sec = Math.floor((now - ms) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return Math.floor(sec / 60) + " mins ago";
  if (sec < 86400) return Math.floor(sec / 3600) + " hrs ago";
  return Math.floor(sec / 86400) + " days ago";
}

// escape HTML
function escapeHtml(str) {
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
