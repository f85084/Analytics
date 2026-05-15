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
        ? `📈 本週上漲 ${weeklyChange}%，動能不錯。` 
        : (weeklyChange < 0 ? `📉 本週下跌 ${Math.abs(weeklyChange)}%，正在回檔。` : '↔️ 本週價格波動不大。');

    // Strategy A: Breakout
    if (bb > 8 && smaSlope > 1 && upperSlope > 2) {
        recommendation = {
            score: 90,
            strategy: '強勢噴發',
            reasons: [
                `🔥 **處於極熱區**：股價正貼著預測的高點（布林上軌）往上衝，這是最強的漲勢信號。`,
                `🚀 **加速中**：均線斜率 ${smaSlope}% 代表趨勢正向上加速，不容易馬上回頭。`,
                weeklyText,
                `💡 **白話解釋**：這支股票現在「非常有活力」，就像正在起飛的火箭。`
            ]
        };
    } 
    // Strategy B: Trend Following
    else if (bb > 2 && bb <= 8 && smaSlope > 1.5) {
        recommendation = {
            score: 80,
            strategy: '穩健上漲',
            reasons: [
                `✅ **趨勢穩定**：20天來的平均成本一直往上墊高（均線斜率 ${smaSlope}%），走得很穩。`,
                `🛡️ **安全區間**：股價沒有過熱，還在合理的漲幅範圍內。`,
                weeklyText,
                `💡 **白話解釋**：這支股票現在走得很健康，「步步高升」，適合順著趨勢看下去。`
            ]
        };
    }
    // Strategy C: Oversold Rebound
    else if (bb < -8 && smaSlope > -0.5) {
        recommendation = {
            score: 70,
            strategy: '跌深反彈',
            reasons: [
                `🆘 **嚴重超跌**：股價已經跌破了近期的正常範圍（布林下軌），通常會有人想進場撿便宜。`,
                `🛑 **跌勢止住**：雖然之前在跌，但目前趨勢已經開始走平，不再劇烈重挫。`,
                weeklyText,
                `💡 **白話解釋**：這支股票「跌過頭了」，隨時可能像皮球掉到地上後彈起來。`
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
