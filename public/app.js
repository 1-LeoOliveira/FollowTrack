const API_BASE = "/api/profiles";

const form = document.getElementById("add-form");
const usernameInput = document.getElementById("username-input");
const addButton = document.getElementById("add-button");
const profilesContainer = document.getElementById("profiles");
const emptyState = document.getElementById("empty-state");
const errorBanner = document.getElementById("error-banner");

const historyModal = document.getElementById("history-modal");
const historyTitle = document.getElementById("history-title");
const historyCanvas = document.getElementById("history-chart");
const closeModalBtn = document.getElementById("close-modal");
const daysSelect = document.getElementById("days-select");

let chartInstance = null;
let currentHistoryUsername = null;

const numberFormatter = new Intl.NumberFormat("pt-BR");

function formatNumber(n) {
  return numberFormatter.format(n);
}

function formatDate(iso) {
  return new Date(iso).toLocaleString("pt-BR");
}

function showError(message) {
  errorBanner.textContent = message;
  errorBanner.hidden = false;
  clearTimeout(showError._timer);
  showError._timer = setTimeout(() => {
    errorBanner.hidden = true;
  }, 5000);
}

async function loadProfiles() {
  try {
    const res = await fetch(API_BASE);
    if (!res.ok) throw new Error("Falha ao carregar perfis.");
    const profiles = await res.json();
    renderProfiles(profiles);
  } catch (err) {
    showError(err.message);
  }
}

function renderProfiles(profiles) {
  profilesContainer.innerHTML = "";
  emptyState.hidden = profiles.length > 0;

  for (const p of profiles) {
    const card = document.createElement("div");
    card.className = "card";

    const followers = p.latest ? formatNumber(p.latest.followers) : "sem dados";
    const updated = p.latest ? `Atualizado em ${formatDate(p.latest.fetchedAt)}` : "Ainda nao coletado";

    let deltaHtml = "";
    if (p.delta !== null && p.delta !== undefined) {
      const sign = p.delta > 0 ? "+" : "";
      const cls = p.delta > 0 ? "positive" : p.delta < 0 ? "negative" : "neutral";
      deltaHtml = `<span class="delta ${cls}">${sign}${formatNumber(p.delta)}</span>`;
    }

    const avatarHtml = p.profilePicUrl
      ? `<img class="avatar" src="${p.profilePicUrl}" alt="" onerror="this.remove()" />`
      : `<div class="avatar"></div>`;

    card.innerHTML = `
      <div class="card-header">
        ${avatarHtml}
        <div>
          <div class="username">@${escapeHtml(p.username)}</div>
          <div class="fullname">${escapeHtml(p.fullName || "")}</div>
        </div>
      </div>
      <div class="followers-row">
        <span class="followers-count">${followers}</span>
        ${deltaHtml}
      </div>
      <div class="updated">${updated}</div>
      <div class="card-actions">
        <button type="button" data-action="refresh" data-username="${p.username}">Atualizar agora</button>
        <button type="button" data-action="history" data-username="${p.username}">Historico</button>
        <button type="button" data-action="remove" data-username="${p.username}" class="danger">Remover</button>
      </div>
    `;
    profilesContainer.appendChild(card);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

profilesContainer.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const { action, username } = btn.dataset;

  if (action === "refresh") {
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Atualizando...";
    try {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(username)}/refresh`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Falha ao atualizar.");
      }
      await loadProfiles();
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  }

  if (action === "remove") {
    if (!confirm(`Parar de monitorar @${username}?`)) return;
    try {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(username)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Falha ao remover.");
      await loadProfiles();
    } catch (err) {
      showError(err.message);
    }
  }

  if (action === "history") {
    openHistory(username);
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = usernameInput.value.trim().replace(/^@/, "");
  if (!username) return;

  addButton.disabled = true;
  addButton.textContent = "Adicionando...";
  try {
    const res = await fetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Falha ao adicionar perfil.");
    }
    usernameInput.value = "";
    await loadProfiles();
  } catch (err) {
    showError(err.message);
  } finally {
    addButton.disabled = false;
    addButton.textContent = "Adicionar";
  }
});

async function openHistory(username) {
  currentHistoryUsername = username;
  historyTitle.textContent = `Historico de @${username}`;
  historyModal.hidden = false;
  await loadHistory();
}

async function loadHistory() {
  if (!currentHistoryUsername) return;
  const days = daysSelect.value;
  try {
    const res = await fetch(
      `${API_BASE}/${encodeURIComponent(currentHistoryUsername)}/history?days=${days}`
    );
    if (!res.ok) throw new Error("Falha ao carregar historico.");
    const { snapshots } = await res.json();
    renderChart(snapshots);
  } catch (err) {
    showError(err.message);
  }
}

function renderChart(snapshots) {
  const labels = snapshots.map((s) =>
    new Date(s.fetchedAt).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  );
  const data = snapshots.map((s) => s.followers);

  if (chartInstance) {
    chartInstance.destroy();
  }

  if (snapshots.length === 0) {
    const ctx = historyCanvas.getContext("2d");
    ctx.clearRect(0, 0, historyCanvas.width, historyCanvas.height);
    return;
  }

  chartInstance = new Chart(historyCanvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Seguidores",
          data,
          borderColor: "#4f46e5",
          backgroundColor: "rgba(79, 70, 229, 0.15)",
          fill: true,
          tension: 0.3,
          pointRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { ticks: { callback: (v) => formatNumber(v) } },
      },
    },
  });
}

daysSelect.addEventListener("change", loadHistory);

closeModalBtn.addEventListener("click", () => {
  historyModal.hidden = true;
  currentHistoryUsername = null;
});

historyModal.addEventListener("click", (e) => {
  if (e.target === historyModal) {
    historyModal.hidden = true;
    currentHistoryUsername = null;
  }
});

loadProfiles();
setInterval(loadProfiles, 60000);
