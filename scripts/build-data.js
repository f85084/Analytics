const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");
const YahooFinance = require("yahoo-finance2").default;
const yahooFinance = new YahooFinance();

const DISPOSAL_URL = "https://chengwaye.com/disposal-forecast";
const OUTPUT_PATH = path.join(__dirname, "..", "docs", "data.json");

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

    if (!/^\d{4,6}$/.test(ticker)) return;

    const listed = marketText.includes("市") || marketText.includes("上市");
    const market = listed ? "Listed" : "OTC";
    const symbol = `${ticker}${listed ? ".TW" : ".TWO"}`;

    rows.push({ ticker, name, market, symbol });
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
  const results = [];

  for (const stock of candidates) {
    try {
      const metrics = await calculateMetrics(stock);
      if (metrics) results.push(metrics);
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

