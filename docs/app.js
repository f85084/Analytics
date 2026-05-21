let allStocks = [];
let expandedTicker = null;

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
    const isExpanded = expandedTicker === s.ticker;
    tr.innerHTML = `
      <td><button class="expand-btn" data-ticker="${s.ticker}">${isExpanded ? "收合" : "展開"}</button></td>
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

    if (isExpanded) {
      const detail = document.createElement("tr");
      detail.className = "detail-row";
      detail.innerHTML = `
        <td colspan="10">
          <div class="reason">${buildReasonHtml(s)}</div>
        </td>
      `;
      tbody.appendChild(detail);
    }
  });

  document.querySelectorAll(".expand-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const ticker = btn.dataset.ticker;
      expandedTicker = expandedTicker === ticker ? null : ticker;
      renderRows(stocks);
    });
  });
}

function buildReasonHtml(s) {
  const smaReason = s.smaSlopePct >= 0.8
    ? "月線斜率 >= 0.8%，趨勢向上加分。"
    : (s.smaSlopePct > 0 ? "月線斜率為正，小幅趨勢向上。" : "月線斜率非正，趨勢分較弱。");
  const upperReason = s.upperSlopePct >= 0.8
    ? "上軌斜率 >= 0.8%，波動上沿同步抬升。"
    : (s.upperSlopePct > 0 ? "上軌斜率為正，短線結構偏強。" : "上軌斜率非正，結構動能偏弱。");
  const zoneReason = (s.bbPosition >= 4 && s.bbPosition <= 6)
    ? "位階落在 4~6（接近你設定的 5 左右區間）。"
    : `位階目前在 ${s.bbPosition}，和 5 的距離較大。`;

  return `
    <strong>推薦原因（${s.level} 級 / ${s.score} 分）</strong><br>
    1. ${smaReason}<br>
    2. ${upperReason}<br>
    3. ${zoneReason}<br>
    建議：搭配籌碼面再確認是否有大戶提前調節。
  `;
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
