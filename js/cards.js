// js/cards.js
// Updated: Full names always stay in ONE LINE on top of card.

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

    // CARD CONTAINER STYLE
    card.style.margin = "10px";
    card.style.padding = "14px";
    card.style.borderRadius = "14px";
    card.style.background = "#1b1d23";
    card.style.border = "1px solid rgba(255,255,255,0.06)";
    card.style.transition = "0.15s ease";

    card.onmouseover = () => card.style.transform = "translateY(-3px)";
    card.onmouseout  = () => card.style.transform = "translateY(0px)";

    // squad pill colors
    const squadInfo = squadPillProps(squad);

    const powerTypeStyle = powerType === 'Approx'
      ? 'color: rgba(255,210,0,0.95); font-weight:600;'
      : 'color: rgba(0,255,180,0.9); font-weight:600;';

    card.innerHTML = `
      <div class="card-top" style="display:flex; gap:0.75rem; align-items:flex-start;">
        
        <!-- AVATAR -->
        <div class="avatar"
          style="width:44px;height:44px;border-radius:50%;background:#ccc;display:flex;align-items:center;justify-content:center;font-weight:600;color:#222;">
          ${generateInitialsAvatar(name)}
        </div>

        <!-- NAME + ROLE + SQUAD PILL -->
        <div style="flex:1; min-width:0;">
          <div style="display:flex; gap:0.5rem; justify-content:space-between; width:100%;">
  
  <!-- NAME + ROLE (full wrap) -->
  <div style="flex:1; min-width:0;">
    <div class="name"
         style="
           font-weight:600;
           font-size:1rem;
           line-height:1.2;
           white-space:normal;       /* <-- allows wrapping */
           word-break:break-word;    /* <-- prevents overflow */
         ">
      ${escapeHtml(name)}
    </div>

    <div class="muted xsmall"
         style="
           opacity:0.75;
           font-size:0.9rem;
           margin-top:2px;
           white-space:normal;       /* <-- allow wrapping */
           word-break:break-word;
         ">
      ${escapeHtml(role)}
    </div>
  </div>

  <!-- SQUAD LABEL -->
  <div style="margin-left:8px; flex-shrink:0; text-align:right;">
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
            ">
              ${escapeHtml(squadInfo.label)}
            </span>
          </div>

        </div>

        <!-- FIXED POWER BLOCK (keeps name from wrapping) -->
        <div style="text-align:right; width:80px; flex-shrink:0;">
          <div style="font-weight:700; font-size:1.15rem; color:#fff;">
            ${escapeHtml(power)}
          </div>
          <div style="font-size:0.72rem; margin-top:3px; ${powerTypeStyle}">
            ${escapeHtml(powerType)}
          </div>
        </div>

      </div>

      <!-- Bottom Section -->
      <div style="margin-top:10px; display:flex; justify-content:space-between; align-items:center;">
        <div class="muted xsmall updated-label"
          data-lastts="${lastTsMs}"
          style="opacity:0.75;">
          ${escapeHtml(updatedLabel)}
        </div>

        <div style="font-size:1rem; color:#f5d142; letter-spacing:1px;">
          ${renderStars(stars)}
        </div>
      </div>

      <!-- Buttons -->
      <div style="margin-top:10px; display:flex; gap:0.5rem;">
        ${
          showAdminActions
            ? `<button class="btn btn-edit" data-id="${id}">Edit</button>
               <button class="btn btn-delete" data-id="${id}">Delete</button>`
            : ''
        }
      </div>
    `;

    // wire actions
    if (showAdminActions) {
      card.querySelector('.btn-edit')?.addEventListener('click', () => options.onEdit?.(m));
      card.querySelector('.btn-delete')?.addEventListener('click', () => options.onDelete?.(m));
    }

    gridEl.appendChild(card);
  });
}

/* ---------- helpers ---------- */

function timeAgoInitial(ms) {
  const now = Date.now();
  const sec = Math.floor((now - ms) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return Math.floor(sec / 60) + " mins ago";
  if (sec < 86400) return Math.floor(sec / 3600) + " hrs ago";
  return Math.floor(sec / 86400) + " days ago";
}

function renderStars(count) {
  count = Number(count) || 0;
  let out = "";
  for (let i = 1; i <= 5; i++) {
    out += i <= count ? "★" : "☆";
  }
  return out;
}

function squadPillProps(squad) {
  const map = {
    'TANK': { bg:'rgba(10,102,255,0.12)', fg:'rgba(10,102,255,0.95)', border:'rgba(10,102,255,0.25)', label:'TANK' },
    'MISSILE': { bg:'rgba(255,50,50,0.12)', fg:'rgba(255,80,80,0.95)', border:'rgba(255,50,50,0.25)', label:'MISSILE' },
    'AIR': { bg:'rgba(138,43,226,0.12)', fg:'rgba(170,120,255,0.95)', border:'rgba(138,43,226,0.25)', label:'AIR' },
    'HYBRID': { bg:'rgba(255,140,0,0.12)', fg:'rgba(255,170,60,0.95)', border:'rgba(255,140,0,0.25)', label:'HYBRID' }
  };
  return map[squad] || { bg:'rgba(255,255,255,0.05)', fg:'rgba(255,255,255,0.65)', border:'rgba(255,255,255,0.12)', label:squad || '—' };
}

function generateInitialsAvatar(name) {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const last  = parts.length > 1 ? parts[parts.length-1][0] : '';
  return `<span style="font-size:0.95rem;">${(first + last).toUpperCase()}</span>`;
}

function escapeHtml(s) {
  return String(s || '')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#39;");
}
