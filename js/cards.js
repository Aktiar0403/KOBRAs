// ==========================
// FULL cards.js (FINAL BUILD)
// Includes:
// - Glossy Cards + Neon Border + Glow + 3D Tilt
// - Squad Icon System (Thin Neon Ring, 44px)
// - Right-Side Icon Placement Below POWER
// - Auto-shrink on mobile (M1)
// - Hybrid System + Backward Compatibility
// ==========================

/* Add keyframes once */
const styleTag = document.createElement("style");
styleTag.innerHTML = `
@keyframes glossMove {
  0% { top:-160%; left:-160%; }
  100% { top:160%; left:160%; }
}

@keyframes neonPulse {
  0% { transform:scale(1); opacity:1; }
  50% { transform:scale(1.05); opacity:0.8; }
  100% { transform:scale(1); opacity:1; }
}
`;
document.head.appendChild(styleTag);

/* ==============================
   BACKWARD-COMPATIBLE SQUAD PARSER
   ============================== */

function parseOldSquad(str) {
  const s = String(str || "").toUpperCase();

  let primary = null;
  if (s.includes("TANK")) primary = "TANK";
  else if (s.includes("AIR")) primary = "AIR";
  else if (s.includes("MISSILE")) primary = "MISSILE";

  const hybrid = s.includes("HYBRID");

  return { primary, hybrid };
}

/* ==============================
   NEW STRUCTURED PROPS
   ============================== */

function squadPillProps(primary, hybrid) {
  const base = {
    TANK: {
      bg: "rgba(10,102,255,0.12)",
      fg: "rgba(10,102,255,0.95)",
      border: "rgba(10,102,255,0.25)",
      neon: "rgba(10,102,255,0.85)",
      neonLight: "rgba(10,102,255,0.45)",
      icon: "/assets/squad-icons/tank.png"
    },
    MISSILE: {
      bg: "rgba(255,50,50,0.12)",
      fg: "rgba(255,80,80,0.95)",
      border: "rgba(255,50,50,0.25)",
      neon: "rgba(255,50,50,0.85)",
      neonLight: "rgba(255,50,50,0.45)",
      icon: "/assets/squad-icons/missile.png"
    },
    AIR: {
      bg: "rgba(138,43,226,0.12)",
      fg: "rgba(170,120,255,0.95)",
      border: "rgba(138,43,226,0.25)",
      neon: "rgba(138,43,226,0.85)",
      neonLight: "rgba(138,43,226,0.45)",
      icon: "/assets/squad-icons/air.png"
    }
  };

  const hybridIcon = (p) =>
    `/assets/squad-icons/hybrid-${p.toLowerCase()}.png`;

  if (primary && hybrid) {
    const p = base[primary];
    return {
      bg: p.bg,
      fg: p.fg,
      border: p.border,
      neon: p.neon,
      neonLight: p.neonLight,
      icon: hybridIcon(primary),
      label: `HYBRID (${primary})`
    };
  }

  if (primary) {
    return {
      ...base[primary],
      label: primary
    };
  }

  return {
    bg: "rgba(255,255,255,0.05)",
    fg: "rgba(255,255,255,0.65)",
    border: "rgba(255,255,255,0.12)",
    neon: "rgba(255,255,255,0.6)",
    neonLight: "rgba(255,255,255,0.25)",
    icon: "/assets/squad-icons/default.png",
    label: "—"
  };
}

/* Wrapper combining NEW + OLD compatibility */
function getSquadInfo(m) {
  if (m.squadPrimary) {
    return squadPillProps(m.squadPrimary, !!m.squadHybrid);
  }

  const parsed = parseOldSquad(m.squad);
  return squadPillProps(parsed.primary, parsed.hybrid);
}

/* ===========================
   MAIN CARD RENDER FUNCTION
   =========================== */

export function renderCards(gridEl, members, options = {}) {
  gridEl.innerHTML = "";
  const showAdminActions = !!options.showAdminActions;

  members.forEach((m) => {
    const id = m.id || "";
    const fullName = m.name || "";
    const role = m.role || "";
    const stars = Number(m.stars) || 1;

    const mainName = fullName.replace(/\(.+\)/, "").trim();
    const bracketName = (fullName.match(/\(.+\)/)?.[0] || "").trim();

    const power =
      m.power !== undefined && m.power !== null
        ? Number(m.power).toFixed(1)
        : "0.0";

    const powerType = m.powerType || "Precise";

    let lastTsMs = "";
    if (m.lastUpdated?.toMillis) lastTsMs = m.lastUpdated.toMillis();
    const updatedLabel = lastTsMs
      ? "Updated " + timeAgoInitial(lastTsMs)
      : "Updated never";

    const squadInfo = getSquadInfo(m);

    const glowIntensity = Math.min(45, Number(power) * 0.9);

    const card = document.createElement("div");
    card.className = "member-card";
    card.dataset.id = id;

    card.style.cssText = `
      margin:10px;
      padding:14px;
      border-radius:16px;
      background: linear-gradient(145deg, rgba(30,33,40,0.75), rgba(18,20,24,0.75));
      backdrop-filter: blur(10px) saturate(180%);
      border: 2px solid ${squadInfo.neon};
      box-shadow:
          0 0 ${glowIntensity}px ${squadInfo.neonLight},
          inset 0 0 20px rgba(255,255,255,0.06);
      transition: transform 0.25s ease, box-shadow 0.25s ease;
      position: relative;
      overflow: hidden;
      display:flex;
      flex-direction:column;
    `;

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
      card.style.transform = "translateY(0)";
      card.style.boxShadow = `
        0 0 ${glowIntensity}px ${squadInfo.neonLight},
        inset 0 0 20px rgba(255,255,255,0.06)
      `;
    };

    // ==========================================
    // HTML Structure With Right-Side Icon
    // ==========================================

    card.innerHTML = `
      <div style="display:flex;">

        <!-- LEFT CONTENT -->
        <div style="flex:1; min-width:0; display:flex; flex-direction:column;">

          <div style="display:flex; gap:0.75rem;">
            <div style="
              width:44px;height:44px;border-radius:50%;
              background:#ccc;display:flex;align-items:center;justify-content:center;
              font-weight:600;color:#222; flex-shrink:0;">
              ${generateInitialsAvatar(fullName)}
            </div>

            <div style="flex:1; display:flex; flex-direction:column; min-width:0;">

              <!-- NAME + POWER -->
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <div style="font-size:1rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                  ${escapeHtml(mainName)}
                </div>

                <div style="flex-shrink:0; width:75px; text-align:right;">
                  <div style="font-weight:700; font-size:1.15rem;">
                    ${escapeHtml(power)}
                  </div>
                  <div style="font-size:0.72rem; margin-top:3px; color:${
                    powerType === "Approx"
                      ? "rgba(255,210,0,0.95)"
                      : "rgba(0,255,180,0.9)"
                  }; font-weight:600;">
                    ${escapeHtml(powerType)}
                  </div>
                </div>
              </div>

              ${
                bracketName
                  ? `<div style="font-size:0.85rem;color:rgba(255,255,255,0.55);margin-top:2px;">
                       ${escapeHtml(bracketName)}
                     </div>`
                  : ""
              }

              <div style="font-size:0.85rem; opacity:0.75; margin-top:2px;">
                ${escapeHtml(role)}
              </div>

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

              <div class="muted xsmall updated-label"
                   data-lastts="${lastTsMs}"
                   style="opacity:0.75; margin-top:8px;">
                ${escapeHtml(updatedLabel)}
              </div>

            </div>
          </div>
        </div>

        <!-- RIGHT-SIDE BIG ICON AREA -->
        <div style="
          width:70px;
          display:flex;
          align-items:center;
          justify-content:center;
          padding-left:6px;
        ">
          <div style="
  width:50px;
  height:50px;
  border-radius:6px;           /* SQUARE STYLE */
  border:2px solid ${squadInfo.neon};
  display:flex;
  align-items:center;
  justify-content:center;
  background:rgba(255,255,255,0.03);
  box-shadow:0 0 8px ${squadInfo.neonLight};
">
  <img src="${squadInfo.icon}" 
       style="
         width:44px;
         height:44px;
         object-fit:contain;
         filter: drop-shadow(0 0 6px ${squadInfo.neon});
       ">
</div>

        </div>

      </div>

      <!-- ADMIN BUTTONS -->
      ${
        showAdminActions
          ? `<div style="margin-top:10px; display:flex; gap:0.5rem;">
               <button class="btn btn-edit" data-id="${id}">Edit</button>
               <button class="btn btn-delete" data-id="${id}">Delete</button>
             </div>`
          : ""
      }
    `;

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
