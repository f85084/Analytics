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
  const smaScore = s.smaSlopePct >= 0.8 ? 40 : (s.smaSlopePct > 0 ? 20 : 0);
  const upperScore = s.upperSlopePct >= 0.8 ? 30 : (s.upperSlopePct > 0 ? 15 : 0);
  const distanceToFive = Math.abs(s.bbPosition - 5);
  const zoneScore = distanceToFive <= 1 ? 30 : (distanceToFive <= 2 ? 20 : (distanceToFive <= 3 ? 10 : 0));

  const smaStatus = s.smaSlopePct >= 0.8 ? "強勢上升" : (s.smaSlopePct > 0 ? "緩升" : "非上升");
  const upperStatus = s.upperSlopePct >= 0.8 ? "上軌抬升明顯" : (s.upperSlopePct > 0 ? "上軌小幅抬升" : "上軌未抬升");
  const zoneStatus = (s.bbPosition >= 4 && s.bbPosition <= 6) ? "落在理想撿點區" : "不在理想撿點區";

  const actionHint = s.level === "A"
    ? "可列入優先觀察，下一步用籌碼面確認是否有大戶提前調節。"
    : (s.level === "B"
      ? "條件有部分成立，建議等待位階更靠近 5 或斜率再轉強。"
      : "目前偏追蹤名單，先觀察趨勢是否轉正再考慮。");

  return `
    <strong>推薦原因（${s.level} 級 / ${s.score} 分）</strong><br>
    <div style="margin-top:8px;">
      <div><strong>1) 月線斜率</strong>：目前 <strong>${s.smaSlopePct}%</strong>，門檻 >= 0.8%（強）或 > 0%（弱強），狀態：${smaStatus}，得分：${smaScore}/40。</div>
      <div><strong>2) 上軌斜率</strong>：目前 <strong>${s.upperSlopePct}%</strong>，門檻 >= 0.8%（強）或 > 0%（弱強），狀態：${upperStatus}，得分：${upperScore}/30。</div>
      <div><strong>3) 位階（BB）</strong>：目前 <strong>${s.bbPosition}</strong>，目標接近 5（理想區 4~6），狀態：${zoneStatus}，得分：${zoneScore}/30。</div>
      <div style="margin-top:6px;"><strong>判讀建議</strong>：${actionHint}</div>
    </div>
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
