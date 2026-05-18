const axios = require('axios');
const cheerio = require('cheerio');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
const fs = require('fs');

const DISPOSAL_URL = 'https://chengwaye.com/disposal-forecast';
const HOT_STOCKS_URL = 'https://tw.stock.yahoo.com/rank/value'; // Yahoo 股市成交值排行榜

async function fetchDisposalList() {
    console.log('Fetching disposal list...');
    try {
        const { data } = await axios.get(DISPOSAL_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
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
                const isListed = marketText.includes('市'); 
                const suffix = isListed ? '.TW' : '.TWO';
                stocks.push({ symbol: ticker + suffix, ticker, name, market: isListed ? 'Listed' : 'OTC', source: 'disposal' });
            }
        });
        return Array.from(new Set(stocks.map(s => s.symbol))).map(symbol => stocks.find(s => s.symbol === symbol));
    } catch (error) {
        console.error('Fetch Disposal Error:', error.message);
        return [];
    }
}

async function fetchHotStocks() {
    console.log('Fetching market hotspots (by trading value)...');
    try {
        const { data } = await axios.get(HOT_STOCKS_URL, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        const $ = cheerio.load(data);
        const stocks = [];
        // Yahoo Finance Taiwan rank table selector
        $('.table-body li').each((i, el) => {
            const ticker = $(el).find('.info-code').text().replace(' ', '').trim();
            const name = $(el).find('.info-name').text().trim();
            if (ticker && name && stocks.length < 30) {
                // Determine market based on ticker length or pattern (Yahoo usually uses .TW for all in rank)
                const isOTC = ticker.length >= 5; 
                const suffix = isOTC ? '.TWO' : '.TW';
                stocks.push({ symbol: ticker + suffix, ticker, name, market: isOTC ? 'OTC' : 'Listed', source: 'hot' });
            }
        });
        return stocks;
    } catch (error) {
        console.error('Fetch Hot Stocks Error:', error.message);
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

function calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return null;
    let gains = 0;
    let losses = 0;
    for (let i = 0; i < period; i++) {
        const diff = prices[i] - prices[i + 1];
        if (diff >= 0) gains += diff;
        else losses += Math.abs(diff);
    }
    if (losses === 0) return 100;
    const rs = (gains / period) / (losses / period);
    return 100 - (100 / (1 + rs));
}

function analyzeStock(m) {
    const bb = parseFloat(m.bbPosition);
    const smaSlope = parseFloat(m.smaSlope);
    const upperSlope = parseFloat(m.upperSlope);
    const weeklyChange = parseFloat(m.weeklyChange);
    const rsi = parseFloat(m.rsi);
    const volRatio = parseFloat(m.volRatio);
    
    let recommendation = { score: 0, strategy: 'Neutral', reasons: [] };

    const weeklyText = weeklyChange > 0 
        ? `📈 本週上漲 ${weeklyChange}%，動能不錯。` 
        : (weeklyChange < 0 ? `📉 本週下跌 ${Math.abs(weeklyChange)}%，正在回檔。` : '↔️ 本週價格波動不大。');

    const rsiValueText = isNaN(rsi) ? '計算中' : rsi;
    const rsiText = rsi > 70 ? `⚠️ RSI 為 **${rsiValueText}**，指標顯示進入「過熱區」，追高請小心。` 
                  : (rsi < 30 ? `🔵 RSI 為 **${rsiValueText}**，指標顯示進入「超賣區」，反彈機率高。` : `✅ RSI 為 **${rsiValueText}**，動能穩定。`);
    
    const volText = volRatio > 1.5 ? `📊 成交量放大至均量的 **${volRatio}** 倍，顯示有大金主在裡面。` : `📊 成交量平穩 (均量的 **${volRatio}** 倍)。`;

    if (bb > 8 && smaSlope > 1 && upperSlope > 2) {
        let score = 90;
        if (rsi > 80) score -= 10;
        if (volRatio > 1.2) score += 5;
        recommendation = {
            score: Math.min(100, score),
            strategy: '強勢噴發',
            reasons: [
                `🔥 **處於極熱區**：股價正貼著預測的高點（布林上軌）往上衝，這是最強的漲勢信號。`,
                `🚀 **加速中**：均線斜率 **${smaSlope}%** 代表趨勢正向上加速。`,
                volText, rsiText,
                `💡 **白話解釋**：這支股票就像正在噴發的火山，動能極強，但也要注意不要追在最高點。`
            ]
        };
    } 
    else if (bb > 2 && bb <= 8 && smaSlope > 1.5) {
        recommendation = {
            score: 80,
            strategy: '穩健上漲',
            reasons: [
                `✅ **趨勢穩定**：20天平均成本持續墊高（均線斜率 **${smaSlope}%**），走勢健康。`,
                `🛡️ **安全區間**：股價未過熱，且成交量配合良好。`,
                weeklyText, rsiText,
                `💡 **白話解釋**：股票走得很穩，「步步高升」，是適合中長期觀察的標的。`
            ]
        };
    }
    else if (bb < -8 && smaSlope > -0.5) {
        recommendation = {
            score: 70,
            strategy: '跌深反彈',
            reasons: [
                `🆘 **嚴重超跌**：股價已跌破近期正常範圍，RSI (**${rsiValueText}**) 也偏低，隨時可能反彈。`,
                `🛑 **跌勢止住**：均線下行趨勢顯著緩和，賣壓趨於竭盡。`,
                weeklyText,
                `💡 **白話解釋**：這支股票像被壓扁的皮球，底部支撐轉強，有機會出現技術性反彈。`
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
        const history = await yahooFinance.historical(stock.symbol, { period1: startDate, period2: endDate, interval: '1d' });
        if (history.length < 22) return null;
        const sorted = history.sort((a, b) => new Date(b.date) - new Date(a.date));
        const prices = sorted.map(h => h.close);
        const volumes = sorted.map(h => h.volume);
        const sma20 = calculateSMA(prices, 20);
        const sd20 = calculateSD(prices, 20, sma20);
        if (sma20 === null || sd20 === null) return null;
        const upper = sma20 + 2 * sd20;
        const current = prices[0];
        const bbPos = ((current - sma20) / (upper - sma20)) * 10;
        const prevPrices = prices.slice(1);
        const prevSma20 = calculateSMA(prevPrices, 20);
        const prevSd20 = calculateSD(prevPrices, 20, prevSma20);
        if (prevSma20 === null || prevSd20 === null) return null;
        const prevUpper = prevSma20 + 2 * prevSd20;
        const smaSlope = ((sma20 - prevSma20) / prevSma20) * 100;
        const upperSlope = ((upper - prevUpper) / prevUpper) * 100;
        let weeklyChange = 0;
        if (prices.length >= 6) {
            weeklyChange = ((prices[0] - prices[5]) / prices[5]) * 100;
        }
        const rsi = calculateRSI(prices, 14);
        const avgVol5 = calculateSMA(volumes.slice(1), 5);
        const volRatio = avgVol5 ? (volumes[0] / avgVol5) : 1;
        const metrics = { ...stock, price: current.toFixed(2), bbPosition: bbPos.toFixed(2), smaSlope: smaSlope.toFixed(2), upperSlope: upperSlope.toFixed(2), weeklyChange: weeklyChange.toFixed(2), rsi: rsi ? rsi.toFixed(2) : 'N/A', volRatio: volRatio.toFixed(2), updatedAt: new Date().toISOString() };
        metrics.analysis = analyzeStock(metrics);
        return metrics;
    } catch (e) {
        console.error('Error for ' + stock.symbol + ': ' + e.message);
        return null;
    }
}

async function main() {
    const disposalList = await fetchDisposalList();
    const hotList = await fetchHotStocks();
    const combinedList = [...disposalList, ...hotList];
    const uniqueList = Array.from(new Set(combinedList.map(s => s.symbol))).map(symbol => combinedList.find(s => s.symbol === symbol));
    
    console.log('Total unique stocks to process: ' + uniqueList.length);
    const results = [];
    for (const s of uniqueList) {
        console.log('Processing ' + s.name + ' (' + s.symbol + ')...');
        const m = await getMetrics(s);
        if (m) results.push(m);
        await new Promise(r => setTimeout(r, 800));
    }
    fs.writeFileSync(require('path').join(__dirname, 'data.json'), JSON.stringify(results, null, 2));
    console.log('Saved ' + results.length + ' results.');
}
main();
