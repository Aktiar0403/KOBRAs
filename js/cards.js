// js/cards.js
// Responsible for rendering member cards used by admin.js
// Updated: adds squad pill (color-coded) and themed powerType styling

export function renderCards(gridEl, members, options = {}) {
  gridEl.innerHTML = '';
  const showAdminActions = !!options.showAdminActions;

  members.forEach(m => {
    const id = m.id || '';
    const name = m.name || '';
    const role = m.role || '';
    const squad = (m.squad || '').toUpperCase();
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
    card.style.border = "1px solid rgba(255,255,255,0.06)";
    card.style.transition = "transform 0.15s ease, box-shadow 0.15s ease";
    card.style.boxShadow = "0 1px 0 rgba(0,0,0,0.25)";

    // hover effect
    card.onmouseover = () => {
      card.style.transform = "translateY(-4px)";
      card.style.boxShadow = "0 8px 30px rgba(0,0,0,0.6)";
    };
    card.onmouseout  = () => {
      card.style.transform = "translateY(0px)";
      card.style.boxShadow = "0 1px 0 rgba(0,0,0,0.25)";
    };

    // compute squad pill color
    const squadInfo = squadPillProps(squad);

    // compute powerType style (subtle tint)
    const powerTypeStyle = powerType === 'Approx'
      ? 'color: rgba(255,210,0,0.95); font-weight:600;' // warm/yellow for Approx
      : 'color: rgba(0,255,180,0.9); font-weight:600;';  // greenish for Precise

    // card content
    card.innerHTML = `
      <div class="card-top" style="display:flex; gap:0.75rem; align-items:center;">
        
        <!-- AVATAR -->
        <div class="avatar"
             style="width:44px;height:44px;border-radius:50%;background:#ccc;flex:0 0 44px;display:flex;align-items:center;justify-content:center;font-weight:600;color:#222;">
          ${generateInitialsAvatar(name)}
        </div>

        <!-- NAME + ROLE + SQUAD PILL -->
        <div style="flex:1; min-width:0;">
          <div style="display:flex; align-items:center; gap:0.5rem; justify-content:space-between;">
            <div style="min-width:0;">
              <div class="name" style="font-weight:600;font-size:1rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                ${escapeHtml(name)}
              </div>
              <div class="muted xsmall" style="opacity:0.75; font-size:0.9rem; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                ${escapeHtml(role)}
              </div>
            </div>
            <div style="margin-left:8px; flex-shrink:0;">
              <div style="font-size:0.82rem; color:rgba(255,255,255,0.7);">
                ${escapeHtml(squad)}
              </div>
            </div>
          </div>

          <!-- squad pill shown below name (left side) -->
          <div style="margin-top:8px; display:flex; align-items:center; gap:6px;">
            <div class="squad-pill" style="
              padding:4px 8px;
              border-radius:999px;
              font-size:0.78rem;
              font-weight:600;
              background: ${squadInfo.bg};
              color: ${squadInfo.fg};
              border: 1px solid ${squadInfo.border};
              display:inline-block;
              ">
              ${escapeHtml(squadInfo.label)}
            </div>
          </div>
        </div>

        <!-- POWER ON TOP RIGHT -->
        <div style="text-align:right; width:84px; flex-shrink:0;">
          <div style="font-weight:700; font-size:1.15rem; color: #fff;">
            ${escapeHtml(power)}
          </div>
          <div style="font-size:0.72rem; color: rgba(255,255,255,0.75); margin-top:3px; ${powerTypeStyle}">
            ${escapeHtml(powerType)}
          </div>
        </div>
      </div>

      <div class="card-body" style="margin-top:0.6rem;">
        <div class="member-meta"
             style="display:flex; gap:0.75rem; margin-top:0.5rem; align-items:center; justify-content:space-between;">
          
          <!-- Left: timestamp -->
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <div class="muted xsmall updated-label"
                 data-lastts="${lastTsMs || ''}"
                 data-id="${id}"
                 style="opacity:0.75;">
              ${escapeHtml(updatedLabel)}
            </div>
          </div>

          <!-- Right: stars -->
          <div style="display:flex; align-items:center; gap:0.5rem;">
            <div class="xsmall"
                 style="font-size:0.95rem; letter-spacing:1px; color:#f5d142;">
              ${renderStars(stars)}
            </div>
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
  count = Number(count) || 0;
  for (let i = 1; i <= max; i++) {
    out += i <= count ? "★" : "☆";
  }
  return out;
}

// Squad pill props (color mapping)
function squadPillProps(squadKey) {
  // defaults
  const map = {
    'TANK': { label: 'TANK', bg: 'rgba(10,102,255,0.12)', fg: 'rgba(10,102,255,0.95)', border: 'rgba(10,102,255,0.25)' },
    'MISSILE': { label: 'MISSILE', bg: 'rgba(255,50,50,0.10)', fg: 'rgba(255,80,80,0.95)', border: 'rgba(255,50,50,0.25)' },
    'AIR': { label: 'AIR', bg: 'rgba(138,43,226,0.10)', fg: 'rgba(170,120,255,0.95)', border: 'rgba(138,43,226,0.25)' },
    'HYBRID': { label: 'HYBRID', bg: 'rgba(255,140,0,0.10)', fg: 'rgba(255,170,60,0.95)', border: 'rgba(255,140,0,0.25)' }
  };
  if (map[squadKey]) return map[squadKey];
  // fallback: show squad text but muted
  return { label: squadKey || '—', bg: 'rgba(255,255,255,0.03)', fg: 'rgba(255,255,255,0.65)', border: 'rgba(255,255,255,0.06)' };
}

// Simple initials generator for avatar placeholder (2 letters max)
function generateInitialsAvatar(fullName) {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last = (parts.length > 1) ? (parts[parts.length-1]?.[0] || '') : '';
  const initials = (first + last).toUpperCase().slice(0,2);
  return `<span style="font-size:0.95rem;">${escapeHtml(initials)}</span>`;
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
