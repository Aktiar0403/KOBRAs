// js/cards.js
import { starsString } from './utils.js';

export function renderCards(container, members, options = {}) {
  const {
    showAdminActions = false,
    onEdit = () => {},
    onDelete = () => {}
  } = options;

  container.innerHTML = '';

  // Leaderboard: Top 10 by power
  const topNames = members
    .slice()
    .sort((a, b) => (b.power || 0) - (a.power || 0))
    .slice(0, 10)
    .map(m => m.name);

  members.forEach((m) => {
    const card = document.createElement('div');
    card.className = 'card-item';

    const isTop = topNames.includes(m.name);

    card.innerHTML = `
      <div class="card-top">
        <div class="card-name">
          ${m.name || '—'}
          ${isTop ? '<span style="font-size:.7rem;margin-left:4px;color:#fbbf24;">🏆</span>' : ''}
        </div>
        <div class="card-power">${m.power ?? '—'}</div>
      </div>

      <div class="card-stars">${starsString(m.stars || 1)}</div>
      <div class="card-meta">${m.role || '—'} • ${(m.squad && m.squad.trim()) || 'Unassigned'}</div>

      <div class="card-tags">
        ${m.squad ? `<span class="tag-pill">${m.squad}</span>` : ''}
        ${m.role ? `<span class="tag-pill">${m.role}</span>` : ''}
      </div>
    `;

    if (showAdminActions) {
      const actions = document.createElement('div');
      actions.className = 'card-admin-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'btn pill';
      editBtn.textContent = 'Edit';
      editBtn.onclick = () => onEdit(m);

      const delBtn = document.createElement('button');
      delBtn.className = 'btn pill';
      delBtn.textContent = 'Delete';
      delBtn.onclick = () => onDelete(m);

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      card.appendChild(actions);
    }

    container.appendChild(card);
  });
}
