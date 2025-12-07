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
    const stars = Number(m.stars) || 1;

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

    // CARD STYLING
    card.style.margin = "10px";
    card.style.padding = "14px";
    card.style.borderRadius = "14px";
    card.style.background = "#1b1d23";
    card.style.border = "1px solid rgba(255,255,255,0.08)";
    card.style.transition = "0.2s";

    // hover effect
    card.onmouseover = () => card.style.transform = "translateY(-3px)";
    card.onmouseout  = () => card.style.transform = "translateY(0px)";

    // card content
    card.innerHTML = `
      <div class="card-top" style="display:flex; gap:0.75rem; align-items:center;">
        
        <!-- AVATAR -->
        <div class="avatar"
             style="width:44px;height:44px;border-radius:50%;background:#ccc;flex:0 0 44px;">
        </div>

        <!-- NAME + ROLE -->
        <div style="flex:1;">
          <div class="name" style="font-weight:600;font-size:1rem;">
            ${escapeHtml(name)}
          </div>
          <div class="muted xsmall">${escapeHtml(role)}</div>
        </div>

        <!-- POWER ON TOP RIGHT -->
        <div style="text-align:right; width:60px;">
          <div style="font-weight:700; font-size:1.1rem;">
            ${escapeHtml(power)}
          </div>
          <div style="
    font-size:0.72rem;
    color: rgba(255,255,255,0.65);
    font-weight:500;
    margin-top:2px;
">
  ${escapeHtml(powerType)}
</div>

        </div>
      </div>

      <div class="card-body" style="margin-top:0.6rem;">
        <div class="member-meta"
             style="display:flex; gap:0.75rem; margin-top:0.5rem; align-items:center;">
          
          <!-- TIMESTAMP -->
          <div class="muted xsmall updated-label"
               data-lastts="${lastTsMs || ''}"
               data-id="${id}">
            ${escapeHtml(updatedLabel)}
          </div>

          <!-- STARS -->
          <div class="xsmall"
               style="font-size:0.95rem; letter-spacing:1px; color:#f5d142;">
            ${renderStars(stars)}
          </div>
        </div>
      </div>

      <!-- ACTION BUTTONS -->
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

    // Wire admin actions
    if (showAdminActions) {
      const btnEdit = card.querySelector('.btn-edit');
      const btnDelete = card.querySelector('.btn-delete');

      btnEdit?.addEventListener('click', () => options.onEdit?.(m));
      btnDelete?.addEventListener('click', () => options.onDelete?.(m));
    }

    gridEl.appendChild(card);
  });
}

/* ------------- HELPERS ------------- */

// Initial time-ago (admin.js handles automatic refreshing)
function timeAgoInitial(ms) {
  const now = Date.now();
  const sec = Math.floor((now - ms) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return Math.floor(sec / 60) + " mins ago";
  if (sec < 86400) return Math.floor(sec / 3600) + " hrs ago";
  return Math.floor(sec / 86400) + " days ago";
}

// STARS: ★ = filled, ☆ = empty
function renderStars(count) {
  const max = 5;
  let out = "";
  for (let i = 1; i <= max; i++) {
    out += i <= count ? "★" : "☆";
  }
  return out;
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
