// js/cards.js
// FINAL version: names never break vertically, bracketed text goes to subtitle line.

export function renderCards(gridEl, members, options = {}) {
  gridEl.innerHTML = "";
  const showAdminActions = !!options.showAdminActions;

  members.forEach((m) => {
    const id = m.id || "";
    const fullName = m.name || "";
    const role = m.role || "";
    const squad = (m.squad || "").toUpperCase();
    const stars = Number(m.stars) || 1;

    // --------- NAME SPLITTING LOGIC ----------
    const mainName = fullName.replace(/\(.+\)/, "").trim();
    const bracketName = (fullName.match(/\(.+\)/)?.[0] || "").trim(); // ex: "(Class 1)"

    const power =
      m.power !== undefined && m.power !== null
        ? Number(m.power).toFixed(1)
        : "0.0";

    const powerType = m.powerType || "Precise";

    // Timestamp
    let lastTsMs = "";
    if (m.lastUpdated?.toMillis) lastTsMs = m.lastUpdated.toMillis();
    const updatedLabel = lastTsMs
      ? "Updated " + timeAgoInitial(lastTsMs)
      : "Updated never";

    const card = document.createElement("div");
    card.className = "member-card";
    card.dataset.id = id;

    // Card base styling
    // --- CARD BASE (Gloss + Neon + Glow + 3D Tilt) ---
const glowIntensity = Math.min(40, Number(power) * 0.8); // higher power = stronger glow

card.style.cssText = `
  margin:10px;
  padding:14px;
  border-radius:16px;
  background: linear-gradient(145deg, rgba(30,33,40,0.75), rgba(18,20,24,0.75));
  backdrop-filter: blur(10px) saturate(180%);
  -webkit-backdrop-filter: blur(10px) saturate(180%);
  border: 2px solid ${squadInfo.neon};
  box-shadow:
      0 0 ${glowIntensity}px ${squadInfo.neonLight},
      inset 0 0 18px rgba(255,255,255,0.07);
  transition: transform 0.25s ease, box-shadow 0.25s ease;
  position: relative;
  overflow: hidden;
`;

// GLOSSY SWIPE OVERLAY
card.innerHTML += `
  <div class="gloss-overlay" style="
    position:absolute;
    top:-160%;
    left:-160%;
    width:400%;
    height:400%;
    background: linear-gradient(115deg,
      transparent 0%,
      rgba(255,255,255,0.08) 20%,
      rgba(255,255,255,0.18) 30%,
      transparent 55%
    );
    opacity:0;
    pointer-events:none;
    transform:rotate(25deg);
    transition: opacity .3s ease;
  "></div>
`;

// HOVER EFFECTS
card.onmouseover = () => {
  card.querySelector(".gloss-overlay").style.animation = "glossMove 1.4s linear forwards";
  card.style.transform = "translateY(-6px) rotateX(6deg) rotateY(6deg)";
  card.style.boxShadow = `
      0 0 ${glowIntensity + 20}px ${squadInfo.neon},
      0 12px 35px rgba(0,0,0,0.45)
  `;
};
card.onmouseout = () => {
  card.querySelector(".gloss-overlay").style.animation = "";
  card.style.transform = "translateY(0px) rotateX(0deg) rotateY(0deg)";
  card.style.boxShadow = `
      0 0 ${glowIntensity}px ${squadInfo.neonLight},
      inset 0 0 18px rgba(255,255,255,0.07)
  `;
};
card.style.cssText = `
      margin:10px;
      padding:14px;
      border-radius:14px;
      background:#1b1d23;
      border:1px solid rgba(255,255,255,0.06);
      transition:0.15s;
    `;

    card.onmouseover = () => (card.style.transform = "translateY(-3px)");
    card.onmouseout = () => (card.style.transform = "translateY(0px)");

    const squadInfo = squadPillProps(squad);
    const powerTypeStyle =
      powerType === "Approx"
        ? "color:rgba(255,210,0,0.95);font-weight:600;"
        : "color:rgba(0,255,180,0.9);font-weight:600;";

    // ---------------- CARD HTML ----------------
    card.innerHTML = `
      <div style="display:flex; gap:0.75rem;">

        <!-- AVATAR -->
        <div style="
          width:44px;height:44px;border-radius:50%;
          background:#ccc;display:flex;align-items:center;justify-content:center;
          font-weight:600;color:#222;">
          ${generateInitialsAvatar(fullName)}
        </div>

        <!-- MAIN RIGHT SIDE -->
        <div style="flex:1; min-width:0; display:flex; flex-direction:column;">

          <!-- NAME ROW (Main name on one line) -->
          <div style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
            min-width:0;
          ">
            <div style="
              flex:1;
              min-width:0;
              font-size:1rem;
              font-weight:600;
              overflow:hidden;
              text-overflow:ellipsis;
              white-space:nowrap;
            ">
              ${escapeHtml(mainName)}
            </div>

            <div style="flex-shrink:0; width:75px; text-align:right; margin-left:8px;">
              <div style="font-weight:700;font-size:1.15rem;color:#fff;">
                ${escapeHtml(power)}
              </div>
              <div style="font-size:0.72rem;margin-top:3px;${powerTypeStyle}">
                ${escapeHtml(powerType)}
              </div>
            </div>
          </div>

          <!-- BRACKET NAME (NEW SUBTITLE LINE) -->
          ${
            bracketName
              ? `
          <div style="
            font-size:0.85rem;
            color:rgba(255,255,255,0.55);
            margin-top:2px;
          ">
            ${escapeHtml(bracketName)}
          </div>`
              : ""
          }

          <!-- ROLE -->
          <div style="font-size:0.85rem; opacity:0.75; margin-top:2px;">
            ${escapeHtml(role)}
          </div>

          <!-- SQUAD PILL -->
          <div style="margin-top:5px;">
            <span style="
              padding:4px 8px;
              border-radius:999px;
              font-size:0.78rem;
              font-weight:600;
              background:${squadInfo.bg};
              color:${squadInfo.fg};
              border:1px solid ${squadInfo.border};
            ">
              ${escapeHtml(squadInfo.label)}
            </span>
          </div>
        </div>
      </div>

      <!-- BOTTOM SECTION -->
      <div style="
        margin-top:10px;
        display:flex;
        justify-content:space-between;
        align-items:center;
      ">
        <div class="muted xsmall updated-label"
             data-lastts="${lastTsMs}"
             style="opacity:0.75;">
          ${escapeHtml(updatedLabel)}
        </div>

        <div style="font-size:1rem;color:#f5d142;letter-spacing:1px;">
          ${renderStars(stars)}
        </div>
      </div>

      <!-- BUTTONS -->
      <div style="margin-top:10px;display:flex;gap:0.5rem;">
        ${
          showAdminActions
            ? `<button class="btn btn-edit" data-id="${id}">Edit</button>
               <button class="btn btn-delete" data-id="${id}">Delete</button>`
            : ""
        }
      </div>
    `;

    // Admin actions
    if (showAdminActions) {
      card
        .querySelector(".btn-edit")
        ?.addEventListener("click", () => options.onEdit?.(m));
      card
        .querySelector(".btn-delete")
        ?.addEventListener("click", () => options.onDelete?.(m));
    }

    gridEl.appendChild(card);
  });
}

/* -------- HELPERS -------- */

function timeAgoInitial(ms) {
  const now = Date.now();
  const sec = (now - ms) / 1000;
  if (sec < 60) return "just now";
  if (sec < 3600) return Math.floor(sec / 60) + " mins ago";
  if (sec < 86400) return Math.floor(sec / 3600) + " hrs ago";
  return Math.floor(sec / 86400) + " days ago";
}

function renderStars(count) {
  count = Number(count) || 0;
  return "★★★★★☆☆☆☆☆".slice(5 - count, 10 - count);
}

function squadPillProps(squad) {
  const map = {
    TANK: {
      bg:"rgba(10,102,255,0.12)",
      fg:"rgba(10,102,255,0.95)",
      border:"rgba(10,102,255,0.25)",
      label:"TANK",
      neon:"rgba(10,102,255,0.85)",
      neonLight:"rgba(10,102,255,0.45)"
    },
    MISSILE: {
      bg:"rgba(255,50,50,0.12)",
      fg:"rgba(255,80,80,0.95)",
      border:"rgba(255,50,50,0.25)",
      label:"MISSILE",
      neon:"rgba(255,50,50,0.85)",
      neonLight:"rgba(255,50,50,0.45)"
    },
    AIR: {
      bg:"rgba(138,43,226,0.12)",
      fg:"rgba(170,120,255,0.95)",
      border:"rgba(138,43,226,0.25)",
      label:"AIR",
      neon:"rgba(138,43,226,0.85)",
      neonLight:"rgba(138,43,226,0.45)"
    },
    HYBRID: {
      bg:"rgba(255,140,0,0.12)",
      fg:"rgba(255,170,60,0.95)",
      border:"rgba(255,140,0,0.25)",
      label:"HYBRID",
      neon:"rgba(255,140,0,0.85)",
      neonLight:"rgba(255,140,0,0.45)"
    }
  };
  return map[squad] || {
    bg:"rgba(255,255,255,0.05)",
    fg:"rgba(255,255,255,0.65)",
    border:"rgba(255,255,255,0.12)",
    neon:"rgba(255,255,255,0.6)",
    neonLight:"rgba(255,255,255,0.25)",
    label:squad || "—"
  };
}


function generateInitialsAvatar(name) {
  if (!name) return "";
  const p = name.trim().split(/\s+/);
  return (p[0][0] + (p[1]?.[0] || "")).toUpperCase();
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
// Gloss swipe animation keyframes (inline-style compatible)
const styleTag = document.createElement("style");
styleTag.innerHTML = `
@keyframes glossMove {
  0% { top:-160%; left:-160%; }
  100% { top:160%; left:160%; }
}
`;
document.head.appendChild(styleTag);
