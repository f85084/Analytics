const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");
const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance();

const DISPOSAL_URL = "https://chengwaye.com/disposal-forecast";
const OUTPUT_PATH = path.join(__dirname, "..", "docs", "data.json");
const TWSE_T86_URL = "https://www.twse.com.tw/rwd/zh/fund/T86";
const TPEX_3I_URL = "https://www.tpex.org.tw/web/stock/3insti/daily_trade/3itrade.php";

function parseDisposalDateText(text) {
  if (!text) return null;
  const match = text.match(/(\d{2})-(\d{2})/);
  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  if (!month || !day) return null;

  const now = new Date();
  const year = now.getFullYear();
  let target = new Date(year, month - 1, day);

  // If date looks far in the past (year boundary), roll to next year.
  if (target.getTime() < now.getTime() - 120 * 24 * 60 * 60 * 1000) {
    target = new Date(year + 1, month - 1, day);
  }

  return target;
}

function getDaysUntil(date) {
  if (!date) return null;
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function formatTwDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function formatRocDate(date = new Date()) {
  const y = date.getFullYear() - 1911;
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
}

function parseNumberLike(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/,/g, "").trim();
  if (cleaned === "" || cleaned === "--") return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function sharesToLots(shares) {
  if (shares === null || shares === undefined) return null;
  return Math.round((shares / 1000) * 100) / 100;
}

async function fetchInstitutionalNetMap() {
  const netMap = new Map();

  let pickedDate = null;
  for (let i = 0; i < 7; i++) {
    try {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const twseDate = formatTwDate(d);
      const twseRes = await axios.get(TWSE_T86_URL, {
        params: {
          response: "json",
          date: twseDate,
          selectType: "ALLBUT0999"
        },
        timeout: 20000
      });

      const rows = twseRes.data?.data || [];
      if (!Array.isArray(rows) || rows.length === 0) continue;

      rows.forEach((row) => {
        const ticker = String(row[0] || "").trim();
        const netShares = parseNumberLike(row[row.length - 1]);
        const net = sharesToLots(netShares);
        if (/^\d{4,6}$/.test(ticker) && net !== null) {
          netMap.set(ticker, net);
        }
      });
      pickedDate = d;
      break;
    } catch (error) {
      // Try previous day.
    }
  }

  try {
    const d = pickedDate || new Date();
    const rocDate = formatRocDate(d);
    const tpexRes = await axios.get(TPEX_3I_URL, {
      params: {
        l: "zh-tw",
        d: rocDate
      },
      headers: {
        "User-Agent": "Mozilla/5.0",
        Referer: "https://www.tpex.org.tw/"
      },
      timeout: 20000
    });

    const html = typeof tpexRes.data === "string" ? tpexRes.data : "";
    const $ = cheerio.load(html);
    $("table tbody tr").each((_, tr) => {
      const tds = $(tr).find("td");
      if (tds.length < 3) return;

      const ticker = $(tds[0]).text().trim();
      const netText = $(tds[tds.length - 1]).text().trim();
      const netShares = parseNumberLike(netText);
      const net = sharesToLots(netShares);
      if (/^\d{4,6}$/.test(ticker) && net !== null) {
        netMap.set(ticker, net);
      }
    });
  } catch (error) {
    console.error(`TPEX institutional data failed: ${error.message}`);
  }

  return netMap;
}

function sma(values, period) {
  if (values.length < period) return null;
  const slice = values.slice(0, period);
  return slice.reduce((sum, v) => sum + v, 0) / period;
}

function stdev(values, period, mean) {
  if (values.length < period || mean === null) return null;
  const slice = values.slice(0, period);
  const variance = slice.reduce((sum, v) => sum + (v - mean) ** 2, 0) / period;
  return Math.sqrt(variance);
}

function toPercent(today, yesterday) {
  if (!yesterday) return null;
  return ((today - yesterday) / yesterday) * 100;
}

function scoreStock(metrics) {
  let score = 0;
  if (metrics.smaSlopePct >= 0.8) score += 40;
  else if (metrics.smaSlopePct > 0) score += 20;

  if (metrics.upperSlopePct >= 0.8) score += 30;
  else if (metrics.upperSlopePct > 0) score += 15;

  const distanceToFive = Math.abs(metrics.bbPosition - 5);
  if (distanceToFive <= 1) score += 30;
  else if (distanceToFive <= 2) score += 20;
  else if (distanceToFive <= 3) score += 10;

  if (score >= 80) return { score, level: "A" };
  if (score >= 55) return { score, level: "B" };
  return { score, level: "C" };
}

async function fetchDisposalCandidates() {
  const response = await axios.get(DISPOSAL_URL, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    },
    timeout: 20000
  });

  const $ = cheerio.load(response.data);
  const rows = [];

  $("table tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 3) return;

    const marketText = $(tds[0]).text().trim();
    const ticker = $(tds[1]).text().trim();
    const name = $(tds[2]).text().trim();
    const fastestDisposalText = $(tds[5]).text().trim();

    if (!/^\d{4,6}$/.test(ticker)) return;

    const listed = marketText.includes("市") || marketText.includes("上市");
    const market = listed ? "Listed" : "OTC";
    const symbol = `${ticker}${listed ? ".TW" : ".TWO"}`;

    const fastestDisposalDate = parseDisposalDateText(fastestDisposalText);
    const daysUntilDisposal = getDaysUntil(fastestDisposalDate);

    rows.push({
      ticker,
      name,
      market,
      symbol,
      fastestDisposal: fastestDisposalText || null,
      daysUntilDisposal
    });
  });

  const bySymbol = new Map();
  rows.forEach((item) => {
    if (!bySymbol.has(item.symbol)) bySymbol.set(item.symbol, item);
  });

  return [...bySymbol.values()];
}

async function calculateMetrics(stock) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 90);

  const history = await yahooFinance.historical(stock.symbol, {
    period1: start,
    period2: end,
    interval: "1d"
  });

  if (!history || history.length < 22) return null;

  const prices = history
    .filter((h) => typeof h.close === "number")
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map((h) => h.close);

  if (prices.length < 22) return null;

  const smaToday = sma(prices, 20);
  const sdToday = stdev(prices, 20, smaToday);

  const prevSeries = prices.slice(1);
  const smaYesterday = sma(prevSeries, 20);
  const sdYesterday = stdev(prevSeries, 20, smaYesterday);

  if ([smaToday, sdToday, smaYesterday, sdYesterday].some((v) => v === null)) {
    return null;
  }

  const upperToday = smaToday + 2 * sdToday;
  const upperYesterday = smaYesterday + 2 * sdYesterday;
  const currentPrice = prices[0];

  const bbDenominator = upperToday - smaToday;
  if (bbDenominator === 0) return null;

  const bbPosition = ((currentPrice - smaToday) / bbDenominator) * 10;
  const smaSlopePct = toPercent(smaToday, smaYesterday);
  const upperSlopePct = toPercent(upperToday, upperYesterday);

  if (smaSlopePct === null || upperSlopePct === null) return null;

  const scored = scoreStock({ bbPosition, smaSlopePct, upperSlopePct });

  return {
    ...stock,
    price: Number(currentPrice.toFixed(2)),
    bbPosition: Number(bbPosition.toFixed(2)),
    smaSlopePct: Number(smaSlopePct.toFixed(2)),
    upperSlopePct: Number(upperSlopePct.toFixed(2)),
    score: scored.score,
    level: scored.level
  };
}

async function run() {
  const candidates = await fetchDisposalCandidates();
  const institutionalNetMap = await fetchInstitutionalNetMap();
  const results = [];

  for (const stock of candidates) {
    try {
      const metrics = await calculateMetrics(stock);
      if (metrics) {
        const net = institutionalNetMap.get(stock.ticker);
        results.push({
          ...metrics,
          institutionalNetLots: net ?? null
        });
      }
    } catch (error) {
      console.error(`Skip ${stock.symbol}: ${error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 600));
  }

  results.sort((a, b) => b.score - a.score);

  if (results.length === 0 && fs.existsSync(OUTPUT_PATH)) {
    console.warn("No stock results generated; keeping existing data.json to avoid empty page.");
    return;
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    source: {
      disposal: DISPOSAL_URL,
      quote: "Yahoo Finance"
    },
    summary: {
      total: results.length,
      levelA: results.filter((x) => x.level === "A").length,
      levelB: results.filter((x) => x.level === "B").length,
      levelC: results.filter((x) => x.level === "C").length
    },
    stocks: results
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), "utf-8");
  console.log(`Wrote ${results.length} stocks to ${OUTPUT_PATH}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});

