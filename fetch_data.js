const axios = require('axios');
const cheerio = require('cheerio');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
const fs = require('fs');

const DISPOSAL_URL = 'https://chengwaye.com/disposal-forecast';

async function fetchDisposalList() {
    console.log('Fetching disposal list...');
    try {
        const { data } = await axios.get(DISPOSAL_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const $ = cheerio.load(data);
        const stocks = [];

        $('table tr').each((i, el) => {
            const tds = $(el).find('td');
            if (tds.length < 3) return;
            
            const marketText = $(tds[0]).text().trim();
            const ticker = $(tds[1]).text().trim();
            const name = $(tds[2]).text().trim();
            
            if (/^\d{4,6}$/.test(ticker)) {
                // Check if it's listed (市) or OTC (櫃)
                const isListed = marketText.includes('市') || marketText.includes('上市'); 
                const suffix = isListed ? '.TW' : '.TWO';
                stocks.push({
                    symbol: ticker + suffix,
                    ticker,
                    name,
                    market: isListed ? 'Listed' : 'OTC'
                });
            }
        });

        const unique = Array.from(new Set(stocks.map(s => s.symbol)))
            .map(symbol => stocks.find(s => s.symbol === symbol));
        
        return unique;
    } catch (error) {
        console.error('Fetch Error:', error.message);
        return [];
    }
}

function calculateSMA(prices, period) {
    if (prices.length < period) return null;
    return prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
}

function calculateSD(prices, period, sma) {
    if (prices.length < period) return null;
    const sqDiffs = prices.slice(0, period).map(v => Math.pow(v - sma, 2));
    const avgSqDiff = sqDiffs.reduce((a, b) => a + b, 0) / period;
    return Math.sqrt(avgSqDiff);
}

function analyzeStock(m) {
    const bb = parseFloat(m.bbPosition);
    const smaSlope = parseFloat(m.smaSlope);
    const upperSlope = parseFloat(m.upperSlope);
    const weeklyChange = parseFloat(m.weeklyChange);
    
    let recommendation = { score: 0, strategy: 'Neutral', reasons: [] };

    const weeklyText = weeklyChange > 0 
        ? `近一週漲幅達 ${weeklyChange}%，表現強於大盤。` 
        : (weeklyChange < 0 ? `近一週跌幅 ${Math.abs(weeklyChange)}%，正處於修正階段。` : '近一週價格持平。');

    // Strategy A: Breakout
    if (bb > 8 && smaSlope > 1 && upperSlope > 2) {
        recommendation = {
            score: 90,
            strategy: '突破佈局',
            reasons: [
                '股價貼著布林通道上軌，正處於極強的多頭噴發期。',
                `通道上軌斜率達 ${upperSlope}%，波動率劇烈擴張，通常伴隨大行情。`,
                weeklyText
            ]
        };
    } 
    // Strategy B: Trend Following
    else if (bb > 2 && bb <= 8 && smaSlope > 1.5) {
        recommendation = {
            score: 80,
            strategy: '多頭延續',
            reasons: [
                `20日均線（生命線）穩定向上，長期趨勢看好。`,
                '股價回測支撐後再度轉強，目前位於安全的操作區間。',
                weeklyText
            ]
        };
    }
    // Strategy C: Oversold Rebound
    else if (bb < -8 && smaSlope > -0.5) {
        recommendation = {
            score: 70,
            strategy: '超跌反彈',
            reasons: [
                '股價嚴重乖離布林下軌，短線超跌，隨時可能出現報復性反彈。',
                '均線下行斜率趨緩，代表低檔承接力道轉強。',
                weeklyText
            ]
        };
    }

    return recommendation;
}

async function getMetrics(stock) {
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 60);

        const queryOptions = {
            period1: startDate,
            period2: endDate,
            interval: '1d'
        };

        const history = await yahooFinance.historical(stock.symbol, queryOptions);
        if (history.length < 22) return null;

        const sorted = history.sort((a, b) => new Date(b.date) - new Date(a.date));
        const prices = sorted.map(h => h.close);

        const sma20 = calculateSMA(prices, 20);
        const sd20 = calculateSD(prices, 20, sma20);
        if (sma20 === null || sd20 === null) return null;
        
        const upper = sma20 + 2 * sd20;
        const current = prices[0];

        // Original logic was * 10, keeping it as is.
        const bbPos = ((current - sma20) / (upper - sma20)) * 10;

        const prevPrices = prices.slice(1);
        const prevSma20 = calculateSMA(prevPrices, 20);
        const prevSd20 = calculateSD(prevPrices, 20, prevSma20);
        if (prevSma20 === null || prevSd20 === null) return null;
        
        const prevUpper = prevSma20 + 2 * prevSd20;

        const smaSlope = ((sma20 - prevSma20) / prevSma20) * 100;
        const upperSlope = ((upper - prevUpper) / prevUpper) * 100;

        // Calculate weekly change (approx. last 5 trading days)
        let weeklyChange = 0;
        if (prices.length >= 6) {
            const currentPrice = prices[0];
            const price5DaysAgo = prices[5];
            weeklyChange = ((currentPrice - price5DaysAgo) / price5DaysAgo) * 100;
        }

        const metrics = {
            ...stock,
            price: current.toFixed(2),
            bbPosition: bbPos.toFixed(2),
            smaSlope: smaSlope.toFixed(2),
            upperSlope: upperSlope.toFixed(2),
            weeklyChange: weeklyChange.toFixed(2),
            updatedAt: new Date().toISOString()
        };
        
        metrics.analysis = analyzeStock(metrics);
        return metrics;
    } catch (e) {
        console.error('Error for ' + stock.symbol + ': ' + e.message);
        return null;
    }
}

async function main() {
    const list = await fetchDisposalList();
    console.log('Found ' + list.length + ' potential stocks.');
    
    const results = [];
    // To avoid hitting Yahoo Finance rate limits or blocks, we process them with a delay.
    for (const s of list) {
        console.log('Processing ' + s.name + ' (' + s.symbol + ')...');
        const m = await getMetrics(s);
        if (m) {
            results.push(m);
        }
        await new Promise(r => setTimeout(r, 1000)); // Increased delay slightly
    }

    const outputPath = require('path').join(__dirname, 'data.json');
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log('Saved ' + results.length + ' results to ' + outputPath);
}

main();
