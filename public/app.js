const API_BASE = "/api/profiles";
const API_KEY_STORAGE = "followtrack_api_key";

// Paleta categorica validada (ordem fixa, nao ciclar) - usada no modo de
// comparar varios perfis. Cada perfil mantem a mesma cor pela sessao.
// Conjuntos claro/escuro validados separadamente (ver scripts/validate_palette.js).
const CATEGORICAL_LIGHT = [
  "#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948",
];
const CATEGORICAL_DARK = [
  "#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767",
];

function isDarkMode() {
  const stamped = document.documentElement.getAttribute("data-theme");
  if (stamped === "dark") return true;
  if (stamped === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function categoricalColors() {
  return isDarkMode() ? CATEGORICAL_DARK : CATEGORICAL_LIGHT;
}

const root = getComputedStyle(document.documentElement);
function cssVar(name) {
  return root.getPropertyValue(name).trim();
}

// DOM refs
const toastStack = document.getElementById("toast-stack");
const statsRow = document.getElementById("stats-row");

const apikeyForm = document.getElementById("apikey-form");
const apikeyInput = document.getElementById("apikey-input");
const apikeyToggle = document.getElementById("apikey-toggle");

const form = document.getElementById("add-form");
const usernameInput = document.getElementById("username-input");
const addButton = document.getElementById("add-button");

const searchInput = document.getElementById("search-input");
const sortSelect = document.getElementById("sort-select");

const compareBar = document.getElementById("compare-bar");
const compareCount = document.getElementById("compare-count");
const compareButton = document.getElementById("compare-button");
const compareClear = document.getElementById("compare-clear");

const profilesContainer = document.getElementById("profiles");
const emptyState = document.getElementById("empty-state");
const skeleton = document.getElementById("skeleton");

const historyModal = document.getElementById("history-modal");
const historyTitle = document.getElementById("history-title");
const historyCanvas = document.getElementById("history-chart");
const modalLegend = document.getElementById("modal-legend");
const closeModalBtn = document.getElementById("close-modal");
const daysSelect = document.getElementById("days-select");
const csvButton = document.getElementById("csv-button");

let chartInstance = null;
let currentHistoryUsername = null;
let compareUsernames = null; // array quando o modal esta em modo de comparacao
const sparklineCharts = new Map();
const selectedForCompare = new Set();

const numberFormatter = new Intl.NumberFormat("pt-BR");
const percentFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2, minimumFractionDigits: 0 });

function formatNumber(n) {
  return numberFormatter.format(n);
}

function formatPercent(n) {
  return percentFormatter.format(n) + "%";
}

function formatDate(iso) {
  return new Date(iso).toLocaleString("pt-BR");
}

// ---------- Toasts ----------

function showToast(message, type = "error") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  toastStack.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function showError(message) {
  showToast(message, "error");
}

function showSuccess(message) {
  showToast(message, "success");
}

// ---------- API key ----------

function getApiKey() {
  try {
    return localStorage.getItem(API_KEY_STORAGE) || "";
  } catch {
    return "";
  }
}

function setApiKey(key) {
  try {
    if (key) {
      localStorage.setItem(API_KEY_STORAGE, key);
    } else {
      localStorage.removeItem(API_KEY_STORAGE);
    }
  } catch {
    // localStorage indisponivel (ex.: navegacao privada); a chave so vale para esta pagina
  }
}

function showApiKeyForm() {
  apikeyForm.hidden = false;
  apikeyToggle.hidden = true;
  apikeyInput.focus();
}

function updateApiKeyVisibility() {
  const hasKey = Boolean(getApiKey());
  apikeyForm.hidden = hasKey;
  apikeyToggle.hidden = !hasKey;
}

async function apiFetch(url, options = {}) {
  const key = getApiKey();
  const headers = new Headers(options.headers || {});
  if (key) {
    headers.set("Authorization", `Bearer ${key}`);
  }
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    showError("API key invalida ou ausente.");
    showApiKeyForm();
  }
  return res;
}

apikeyInput.value = getApiKey();
updateApiKeyVisibility();

apikeyForm.addEventListener("submit", (e) => {
  e.preventDefault();
  setApiKey(apikeyInput.value.trim());
  updateApiKeyVisibility();
  loadProfiles();
});

apikeyToggle.addEventListener("click", showApiKeyForm);

// ---------- Data loading ----------

function currentQuery() {
  const params = new URLSearchParams();
  if (searchInput.value.trim()) params.set("q", searchInput.value.trim());
  const [sort, order] = sortSelect.value.split("-");
  params.set("sort", sort);
  params.set("order", order);
  return params.toString();
}

async function loadProfiles() {
  skeleton.hidden = profilesContainer.childElementCount > 0;
  try {
    const res = await apiFetch(`${API_BASE}?${currentQuery()}`);
    if (!res.ok) throw new Error("Falha ao carregar perfis.");
    const profiles = await res.json();
    renderStats(profiles);
    renderProfiles(profiles);
  } catch (err) {
    showError(err.message);
  } finally {
    skeleton.hidden = true;
  }
}

// ---------- Stats ----------

function renderStats(profiles) {
  if (profiles.length === 0) {
    statsRow.hidden = true;
    statsRow.innerHTML = "";
    return;
  }

  const totalFollowers = profiles.reduce((sum, p) => sum + (p.latest?.followers ?? 0), 0);
  const withDelta = profiles.filter((p) => typeof p.delta === "number");
  const topGrower = withDelta.length
    ? withDelta.reduce((best, p) => (p.delta > best.delta ? p : best))
    : null;
  const failing = profiles.filter((p) => p.consecutiveFailures > 0).length;

  const tiles = [
    { label: "Perfis monitorados", value: formatNumber(profiles.length) },
    { label: "Seguidores no total", value: formatNumber(totalFollowers) },
    topGrower && topGrower.delta !== 0
      ? {
          label: "Maior crescimento",
          value: `${topGrower.delta > 0 ? "+" : ""}${formatNumber(topGrower.delta)}`,
          sub: `@${topGrower.username}`,
          good: topGrower.delta > 0,
        }
      : { label: "Maior crescimento", value: "—" },
  ];

  if (failing > 0) {
    tiles.push({ label: "Com falha na coleta", value: formatNumber(failing) });
  }

  statsRow.hidden = false;
  statsRow.innerHTML = tiles
    .map(
      (t) => `
      <div class="stat-tile">
        <div class="stat-label">${escapeHtml(t.label)}</div>
        <div class="stat-value${t.good ? " good" : ""}">${escapeHtml(t.value)}</div>
        ${t.sub ? `<div class="stat-sub">${escapeHtml(t.sub)}</div>` : ""}
      </div>
    `
    )
    .join("");
}

// ---------- Cards ----------

function renderProfiles(profiles) {
  for (const chart of sparklineCharts.values()) chart.destroy();
  sparklineCharts.clear();

  profilesContainer.innerHTML = "";
  emptyState.hidden = profiles.length > 0;

  for (const p of profiles) {
    const card = document.createElement("div");
    card.className = "card";

    const followers = p.latest ? formatNumber(p.latest.followers) : "sem dados";
    const updated = p.latest ? `Atualizado em ${formatDate(p.latest.fetchedAt)}` : "Ainda nao coletado";

    let deltaHtml = "";
    if (typeof p.delta === "number") {
      const sign = p.delta > 0 ? "+" : "";
      const cls = p.delta > 0 ? "positive" : p.delta < 0 ? "negative" : "neutral";
      const pct = typeof p.deltaPercent === "number" ? ` (${sign}${formatPercent(p.deltaPercent)})` : "";
      deltaHtml = `<span class="delta ${cls}">${sign}${formatNumber(p.delta)}${pct}</span>`;
    }

    const failureHtml =
      p.consecutiveFailures > 0
        ? `<div class="failure-badge" title="${escapeHtml(p.lastError || "")}">
             <span class="dot"></span>${p.consecutiveFailures} falha${p.consecutiveFailures > 1 ? "s" : ""} seguida${p.consecutiveFailures > 1 ? "s" : ""}
           </div>`
        : "";

    // Instagram bloqueia embutir a foto em alguns contextos (CORP/CORS);
    // se falhar, troca por um placeholder do mesmo tamanho em vez de sumir
    // e deslocar o layout do card.
    const avatarHtml = p.profilePicUrl
      ? `<img class="avatar" src="${p.profilePicUrl}" alt="" onerror="this.outerHTML='&lt;div class=&quot;avatar&quot;&gt;&lt;/div&gt;'" />`
      : `<div class="avatar"></div>`;

    card.innerHTML = `
      <div class="card-header">
        <input type="checkbox" class="card-select" data-username="${p.username}" title="Selecionar para comparar" ${selectedForCompare.has(p.username) ? "checked" : ""} />
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
      <div class="sparkline-wrap"><canvas></canvas></div>
      <div class="updated">${updated}</div>
      ${failureHtml}
      <div class="card-actions">
        <button type="button" class="secondary" data-action="refresh" data-username="${p.username}">Atualizar agora</button>
        <button type="button" class="secondary" data-action="history" data-username="${p.username}">Historico</button>
        <button type="button" data-action="remove" data-username="${p.username}" class="danger">Remover</button>
      </div>
    `;
    profilesContainer.appendChild(card);

    if (p.sparkline && p.sparkline.length > 1) {
      renderSparkline(card.querySelector(".sparkline-wrap canvas"), p.username, p.sparkline);
    } else {
      card.querySelector(".sparkline-wrap").style.visibility = "hidden";
    }
  }
}

function renderSparkline(canvas, username, data) {
  const chart = new Chart(canvas, {
    type: "line",
    data: {
      labels: data.map((_, i) => i),
      datasets: [
        {
          data,
          borderColor: cssVar("--accent"),
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      scales: { x: { display: false }, y: { display: false } },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
    },
  });
  sparklineCharts.set(username, chart);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Card actions ----------

profilesContainer.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;
  const { action, username } = btn.dataset;

  if (action === "refresh") {
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Atualizando...";
    try {
      const res = await apiFetch(`${API_BASE}/${encodeURIComponent(username)}/refresh`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Falha ao atualizar.");
      }
      showSuccess(`@${username} atualizado.`);
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
      const res = await apiFetch(`${API_BASE}/${encodeURIComponent(username)}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Falha ao remover.");
      selectedForCompare.delete(username);
      showSuccess(`@${username} removido.`);
      await loadProfiles();
      updateCompareBar();
    } catch (err) {
      showError(err.message);
    }
  }

  if (action === "history") {
    openHistory(username);
  }
});

profilesContainer.addEventListener("change", (e) => {
  const checkbox = e.target.closest(".card-select");
  if (!checkbox) return;
  const { username } = checkbox.dataset;
  if (checkbox.checked) {
    selectedForCompare.add(username);
  } else {
    selectedForCompare.delete(username);
  }
  updateCompareBar();
});

// ---------- Compare bar ----------

function updateCompareBar() {
  const n = selectedForCompare.size;
  compareBar.hidden = n === 0;
  compareCount.textContent = `${n} selecionado${n === 1 ? "" : "s"}`;
  compareButton.disabled = n < 2;
}

compareClear.addEventListener("click", () => {
  selectedForCompare.clear();
  document.querySelectorAll(".card-select").forEach((cb) => (cb.checked = false));
  updateCompareBar();
});

compareButton.addEventListener("click", () => {
  openHistory(null, Array.from(selectedForCompare));
});

// ---------- Add / search / sort ----------

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = usernameInput.value.trim().replace(/^@/, "");
  if (!username) return;

  addButton.disabled = true;
  addButton.textContent = "Adicionando...";
  try {
    const res = await apiFetch(API_BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Falha ao adicionar perfil.");
    }
    usernameInput.value = "";
    showSuccess(`@${username} adicionado.`);
    await loadProfiles();
  } catch (err) {
    showError(err.message);
  } finally {
    addButton.disabled = false;
    addButton.textContent = "Adicionar";
  }
});

let searchDebounce;
searchInput.addEventListener("input", () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(loadProfiles, 300);
});

sortSelect.addEventListener("change", loadProfiles);

// ---------- History modal ----------

async function openHistory(username, usernames) {
  compareUsernames = usernames && usernames.length ? usernames : null;
  currentHistoryUsername = username;

  if (compareUsernames) {
    historyTitle.textContent = `Comparando ${compareUsernames.length} perfis`;
    csvButton.hidden = true;
  } else {
    historyTitle.textContent = `Historico de @${username}`;
    csvButton.hidden = false;
  }

  historyModal.hidden = false;
  await loadHistory();
}

async function fetchHistory(username, days) {
  const res = await apiFetch(`${API_BASE}/${encodeURIComponent(username)}/history?days=${days}`);
  if (!res.ok) throw new Error(`Falha ao carregar historico de @${username}.`);
  const { snapshots } = await res.json();
  return snapshots;
}

async function loadHistory() {
  const days = daysSelect.value;
  try {
    if (compareUsernames) {
      const results = await Promise.all(compareUsernames.map((u) => fetchHistory(u, days)));
      renderCompareChart(compareUsernames, results);
    } else {
      if (!currentHistoryUsername) return;
      const snapshots = await fetchHistory(currentHistoryUsername, days);
      renderChart(snapshots);
    }
  } catch (err) {
    showError(err.message);
  }
}

function labelsFor(snapshots) {
  return snapshots.map((s) =>
    new Date(s.fetchedAt).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  );
}

function destroyChart() {
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }
}

function renderChart(snapshots) {
  modalLegend.hidden = true;
  modalLegend.innerHTML = "";
  destroyChart();

  if (snapshots.length === 0) return;

  chartInstance = new Chart(historyCanvas, {
    type: "line",
    data: {
      labels: labelsFor(snapshots),
      datasets: [
        {
          label: "Seguidores",
          data: snapshots.map((s) => s.followers),
          borderColor: cssVar("--accent"),
          backgroundColor: cssVar("--accent") + "26",
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

function renderCompareChart(usernames, seriesList) {
  destroyChart();

  const colors = categoricalColors();
  const allLabels = seriesList
    .flatMap((s) => s.map((snap) => snap.fetchedAt))
    .sort();
  const uniqueLabels = [...new Set(allLabels)];
  const labels = uniqueLabels.map((iso) =>
    new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
  );

  const datasets = usernames.map((username, i) => {
    const color = colors[i % colors.length];
    const byTime = new Map(seriesList[i].map((s) => [s.fetchedAt, s.followers]));
    return {
      label: `@${username}`,
      data: uniqueLabels.map((iso) => byTime.get(iso) ?? null),
      borderColor: color,
      backgroundColor: color,
      spanGaps: true,
      fill: false,
      tension: 0.3,
      pointRadius: 2,
    };
  });

  chartInstance = new Chart(historyCanvas, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { ticks: { callback: (v) => formatNumber(v) } },
      },
    },
  });

  modalLegend.hidden = false;
  modalLegend.innerHTML = usernames
    .map(
      (u, i) => `
      <span class="legend-item">
        <span class="swatch" style="background:${colors[i % colors.length]}"></span>
        @${escapeHtml(u)}
      </span>
    `
    )
    .join("");
}

csvButton.addEventListener("click", async () => {
  if (!currentHistoryUsername) return;
  try {
    const res = await apiFetch(
      `${API_BASE}/${encodeURIComponent(currentHistoryUsername)}/history?days=${daysSelect.value}&format=csv`
    );
    if (!res.ok) throw new Error("Falha ao gerar CSV.");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentHistoryUsername}-historico.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    showError(err.message);
  }
});

daysSelect.addEventListener("change", loadHistory);

closeModalBtn.addEventListener("click", () => {
  historyModal.hidden = true;
  currentHistoryUsername = null;
  compareUsernames = null;
});

historyModal.addEventListener("click", (e) => {
  if (e.target === historyModal) {
    historyModal.hidden = true;
    currentHistoryUsername = null;
    compareUsernames = null;
  }
});

loadProfiles();
setInterval(loadProfiles, 60000);
