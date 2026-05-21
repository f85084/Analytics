let allStocks = [];

function renderKpis(summary) {
  const root = document.getElementById("kpis");
  root.innerHTML = "";
  const cards = [
    ["候選總數", summary.total],
    ["A 級", summary.levelA],
    ["B 級", summary.levelB],
    ["C 級", summary.levelC]
  ];

  cards.forEach(([label, value]) => {
    const div = document.createElement("div");
    div.className = "kpi";
    div.innerHTML = `<div class="label">${label}</div><div class="value">${value}</div>`;
    root.appendChild(div);
  });
}

function applyFilters() {
  const market = document.getElementById("marketFilter").value;
  const level = document.getElementById("levelFilter").value;
  const zoneOnly = document.getElementById("zoneFilter").checked;

  let rows = [...allStocks];
  if (market !== "ALL") rows = rows.filter((s) => s.market === market);
  if (level !== "ALL") rows = rows.filter((s) => s.level === level);
  if (zoneOnly) rows = rows.filter((s) => s.bbPosition >= 4 && s.bbPosition <= 6);

  renderRows(rows);
}

function renderRows(stocks) {
  const tbody = document.getElementById("rows");
  tbody.innerHTML = "";

  stocks.forEach((s) => {
    const tr = document.createElement("tr");
    const zoneClass = s.bbPosition >= 4 && s.bbPosition <= 6 ? "zone" : "";
    tr.innerHTML = `
      <td>${s.ticker}</td>
      <td>${s.name}</td>
      <td>${s.market === "Listed" ? "上市" : "上櫃"}</td>
      <td>${s.price}</td>
      <td class="${zoneClass}">${s.bbPosition}</td>
      <td class="${s.smaSlopePct >= 0 ? "up" : "down"}">${s.smaSlopePct}</td>
      <td class="${s.upperSlopePct >= 0 ? "up" : "down"}">${s.upperSlopePct}</td>
      <td><span class="level level-${s.level.toLowerCase()}">${s.level}</span></td>
      <td>${s.score}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function init() {
  const res = await fetch("./data.json");
  const data = await res.json();
  allStocks = data.stocks || [];

  renderKpis(data.summary || { total: 0, levelA: 0, levelB: 0, levelC: 0 });
  renderRows(allStocks);

  document.getElementById("updatedAt").textContent = `更新時間: ${new Date(data.updatedAt).toLocaleString("zh-TW")}`;

  document.getElementById("marketFilter").addEventListener("change", applyFilters);
  document.getElementById("levelFilter").addEventListener("change", applyFilters);
  document.getElementById("zoneFilter").addEventListener("change", applyFilters);
}

init().catch((err) => {
  console.error(err);
  document.getElementById("updatedAt").textContent = "資料讀取失敗";
});
