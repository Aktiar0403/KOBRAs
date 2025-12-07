// ==========================
// FULL cards.js (FINAL BUILD)
// Glossy Cards + Neon Border + Glow + 3D Tilt + Bracket Name Split
// ==========================

/* Add keyframes once */
const styleTag = document.createElement("style");
styleTag.innerHTML = `
@keyframes glossMove {
  0% { top:-160%; left:-160%; }
  100% { top:160%; left:160%; }
}
`;
document.head.appendChild(styleTag);

export function renderCards(gridEl, members, options = {}) {
  gridEl.innerHTML = "";
  const showAdminActions = !!options.showAdminActions;

  members.forEach((m) => {
    const id = m.id || "";
    const fullName = m.name || "";
    const role = m.role || "";
    const squad = (m.squad || "").toUpperCase();
    const stars = Number(m.stars) || 1;

    // --------- NAME SPLIT (MAIN + BRACKET) ----------
    const mainName = fullName.replace(/\(.+\)/, "").trim();
    const bracketName = (fullName.match(/\(.+\)/)?.[0] || "").trim();

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

    // ==========================
    // SQUAD COLOR MAP (with neon)
    // ==========================
    const squadInfo = squadPillProps(squad);

    // Glow power scale
    const glowIntensity = Math.min(45, Number(power) * 0.9);

    // ==========================
    // CARD BASE STYLE
    // Gloss + Neon Border + Glow + Glass Blur
    // ==========================
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
          inset 0 0 20px rgba(255,255,255,0.06);
      transition: transform 0.25s ease, box-shadow 0.25s ease;
      position: relative;
      overflow: hidden;
    `;

    // ==========================
    // ADD GLOSS OVERLAY
    // ==========================
    const gloss = document.createElement("div");
    gloss.style.cssText = `
      position:absolute;
      top:-160%;
      left:-160%;
      width:400%;
      height:400%;
      background: linear-gradient(
        115deg,
        transparent 0%,
        rgba(255,255,255,0.10) 20%,
        rgba(255,255,255,0.22) 30%,
        transparent 60%
      );
      opacity:0;
      transform:rotate(25deg);
      pointer-events:none;
      transition:opacity .3s ease;
    `;
    gloss.className = "gloss-overlay";
    card.appendChild(gloss);

    // ==========================
    // HOVER EFFECTS (3D tilt + glow boost)
    // ==========================
    card.onmouseover = () => {
      gloss.style.animation = "glossMove 1.4s linear forwards";
      gloss.style.opacity = "1";

      card.style.transform = "translateY(-6px) rotateX(6deg) rotateY(6deg)";
      card.style.boxShadow = `
        0 0 ${glowIntensity + 20}px ${squadInfo.neon},
        0 12px 32px rgba(0,0,0,0.45)
      `;
    };

    card.onmouseout = () => {
      gloss.style.animation = "";
      gloss.style.opacity = "0";

      card.style.transform = "translateY(0) rotateX(0deg) rotateY(0deg)";
      card.style.boxShadow = `
        0 0 ${glowIntensity}px ${squadInfo.neonLight},
        inset 0 0 20px rgba(255,255,255,0.06)
      `;
    };

    // ==========================
    // CARD CONTENT HTML
    // ==========================
    card.innerHTML += `
      <div style="display:flex; gap:0.75rem;">

        <!-- AVATAR -->
        <div style="
          width:44px;height:44px;border-radius:50%;
          background:#ccc;display:flex;align-items:center;justify-content:center;
          font-weight:600;color:#222; flex-shrink:0;
        ">
          ${generateInitialsAvatar(fullName)}
        </div>

        <!-- RIGHT SIDE -->
        <div style="flex:1; min-width:0; display:flex; flex-direction:column;">

          <!-- NAME + POWER ROW -->
          <div style="
            display:flex;
            justify-content:space-between;
            align-items:center;
            min-width:0;
          ">
            <div style="
              flex:1;
              min-width:0;
              font-size:1rem;
              font-weight:600;
              white-space:nowrap;
              overflow:hidden;
              text-overflow:ellipsis;
            ">
              ${escapeHtml(mainName)}
            </div>

            <div style="flex-shrink:0; width:75px; text-align:right; margin-left:10px;">
              <div style="font-weight:700; font-size:1.15rem;">
                ${escapeHtml(power)}
              </div>
              <div style="font-size:0.72rem; margin-top:3px; ${powerType === "Approx"
                  ? "color:rgba(255,210,0,0.95);font-weight:600;"
                  : "color:rgba(0,255,180,0.9);font-weight:600;"
                }">
                ${escapeHtml(powerType)}
              </div>
            </div>
          </div>

          <!-- BRACKET NAME BELOW -->
          ${
            bracketName
              ? `<div style="font-size:0.85rem;color:rgba(255,255,255,0.55);margin-top:2px;">
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

      <!-- BOTTOM ROW -->
      <div style="
        margin-top:10px;
        display:flex;
        justify-content:space-between;
        align-items:center;
      ">
        <div class="muted xsmall updated-label" data-lastts="${lastTsMs}" style="opacity:0.75;">
          ${escapeHtml(updatedLabel)}
        </div>

        <div style="font-size:1rem; color:#f5d142; letter-spacing:1px;">
          ${renderStars(stars)}
        </div>
      </div>

      <!-- ADMIN BUTTONS -->
      <div style="margin-top:10px; display:flex; gap:0.5rem;">
        ${
          showAdminActions
            ? `<button class="btn btn-edit" data-id="${id}">Edit</button>
               <button class="btn btn-delete" data-id="${id}">Delete</button>`
            : ""
        }
      </div>
    `;

    // BUTTON EVENTS
    if (showAdminActions) {
      card.querySelector(".btn-edit")
        ?.addEventListener("click", () => options.onEdit?.(m));
      card.querySelector(".btn-delete")
        ?.addEventListener("click", () => options.onDelete?.(m));
    }

    gridEl.appendChild(card);
  });
}

/* ================= HELPERS ================= */

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
      bg: "rgba(10,102,255,0.12)",
      fg: "rgba(10,102,255,0.95)",
      border: "rgba(10,102,255,0.25)",
      label: "TANK",
      neon: "rgba(10,102,255,0.85)",
      neonLight: "rgba(10,102,255,0.45)"
    },
    MISSILE: {
      bg: "rgba(255,50,50,0.12)",
      fg: "rgba(255,80,80,0.95)",
      border: "rgba(255,50,50,0.25)",
      label: "MISSILE",
      neon: "rgba(255,50,50,0.85)",
      neonLight: "rgba(255,50,50,0.45)"
    },
    AIR: {
      bg: "rgba(138,43,226,0.12)",
      fg: "rgba(170,120,255,0.95)",
      border: "rgba(138,43,226,0.25)",
      label: "AIR",
      neon: "rgba(138,43,226,0.85)",
      neonLight: "rgba(138,43,226,0.45)"
    },
    HYBRID: {
      bg: "rgba(255,140,0,0.12)",
      fg: "rgba(255,170,60,0.95)",
      border: "rgba(255,140,0,0.25)",
      label: "HYBRID",
      neon: "rgba(255,140,0,0.85)",
      neonLight: "rgba(255,140,0,0.45)"
    }
  };

  return map[squad] || {
    bg: "rgba(255,255,255,0.05)",
    fg: "rgba(255,255,255,0.65)",
    border: "rgba(255,255,255,0.12)",
    neon: "rgba(255,255,255,0.6)",
    neonLight: "rgba(255,255,255,0.25)",
    label: squad || "—"
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
