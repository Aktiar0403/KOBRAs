console.log("🖨️ structures-print.js loaded");

window.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("printContainer");

  if (!window.deployment || !window.deployment.structures) {
    container.innerHTML = `<p style="color:#ff7777">No deployment data found.</p>`;
    return;
  }

  const structures = window.deployment.structures;

  const ORDER = [
    { key: "hospital1", label: "Hospital I" },
    { key: "hospital2", label: "Hospital II" },
    { key: "info_center", label: "Info Center" },
    { key: "oil_refinery", label: "Oil Refinery" },
    { key: "science_hub", label: "Science Hub" },
    { key: "nuclear_silo", label: "Nuclear Silo (Multi-Assign Allowed)" }
  ];

  ORDER.forEach(struct => {
    const list = structures[struct.key] || [];

    const totalPower = list.reduce((a, b) => a + (Number(b.power) || 0), 0);

    const squadCounts = { TANK: 0, AIR: 0, MISSILE: 0, HYBRID: 0 };
    list.forEach(p => {
      const sq = (p.squad || "").toUpperCase();
      if (squadCounts[sq] !== undefined) squadCounts[sq]++;
    });

    // Build card
    const card = document.createElement("div");
    card.className = "structure-card";

    card.innerHTML = `
      <div class="structure-header">
        <div class="structure-title">${struct.label}</div>
        <div class="structure-totals">
          <div><strong>${list.length}</strong> Players</div>
          <div><strong>${totalPower}</strong> Power</div>
        </div>
      </div>

      <div class="squad-summary">
        <div class="squad-pill">TANK: ${squadCounts.TANK}</div>
        <div class="squad-pill">AIR: ${squadCounts.AIR}</div>
        <div class="squad-pill">MISSILE: ${squadCounts.MISSILE}</div>
        <div class="squad-pill">HYBRID: ${squadCounts.HYBRID}</div>
      </div>

      <div class="player-list">
        ${list.map(p => `
          <div class="player-row">
            <div class="player-name">${p.name}</div>
            <div class="player-meta">
              ${p.squad} • ${p.power}
            </div>
          </div>
        `).join("")}
      </div>
    `;

    container.appendChild(card);
  });

});
