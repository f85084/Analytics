const axios = require('axios');
const cheerio = require('cheerio');
const YahooFinance = require('yahoo-finance2').default;
const yahooFinance = new YahooFinance();
const fs = require('fs');

const DISPOSAL_URL = 'https://chengwaye.com/disposal-forecast';
const HOT_STOCKS_URL = 'https://tw.stock.yahoo.com/rank/turnover';

// Using a very common and modern User-Agent to avoid 404/Blocking
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

async function fetchDisposalList() {
    console.log('Fetching disposal list...');
    try {
        const { data } = await axios.get(DISPOSAL_URL, {
            headers: { 'User-Agent': UA }
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
        const response = await axios.get(HOT_STOCKS_URL, {
            headers: { 'User-Agent': UA }
        });
        const data = response.data;
        const stocks = [];
        // Regex to find tickers like 2330.TW or 2330.TWO
        const regex = /(\d{4,6})\.(TW|TWO)/g;
        let match;
        const seen = new Set();
        while ((match = regex.exec(data)) !== null && seen.size < 30) {
            const symbol = match[0];
            const ticker = match[1];
            const suffix = match[2];
            if (!seen.has(symbol) && !ticker.startsWith('00')) {
                seen.add(symbol);
                stocks.push({
                    symbol: symbol,
                    ticker: ticker,
                    name: '', // Will fetch later
                    market: suffix === 'TW' ? 'Listed' : 'OTC',
                    source: 'hot'
                });
            }
        }
        
        console.log(`Found ${stocks.length} hot tickers. Fetching names...`);
        for (const s of stocks) {
            try {
                const quote = await yahooFinance.quote(s.symbol);
                s.name = quote.shortName || quote.longName || s.ticker;
            } catch (e) {
                s.name = s.ticker;
            }
        }
        
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
    const rs = (gains / period) / (Math.abs(losses) / period);
    return 100 - (100 / (1 + rs));
}

function analyzeStock(m) {
    const bb = parseFloat(m.bbPosition);
    const smaSlope = parseFloat(m.smaSlope);
    const upperSlope = parseFloat(m.upperSlope);
    const weeklyChange = parseFloat(m.weeklyChange);
    const rsi = parseFloat(m.rsi);
    const volRatio = parseFloat(m.volRatio);
    
    let recommendation = { score: 0, strategy: '一般觀察', reasons: [] };

    const weeklyText = weeklyChange > 0 
        ? `📈 本週上漲 **${weeklyChange}%**，動能不錯。` 
        : (weeklyChange < 0 ? `📉 本週下跌 **${Math.abs(weeklyChange)}%**，正在回檔。` : '↔️ 本週價格波動不大。');

    const rsiValueText = isNaN(rsi) ? '計算中' : rsi;
    const rsiText = rsi > 75 ? `⚠️ RSI 為 **${rsiValueText}**，指標顯示進入「過熱區」，追高請小心。` 
                  : (rsi < 35 ? `🔵 RSI 為 **${rsiValueText}**，指標顯示進入「超賣區」，反彈機率高。` : `✅ RSI 為 **${rsiValueText}**，買氣很穩定。`);
    
    const volText = volRatio > 1.5 ? `📊 成交量放大到平常的 **${volRatio}倍**，表示有大金主在裡面。` : `📊 成交量跟平常差不多。`;

    if (bb > 8 && smaSlope > 1 && upperSlope > 1.5) {
        let score = 90;
        if (rsi > 80) score -= 10;
        recommendation = {
            score: score,
            strategy: '強勢噴發',
            reasons: [
                `🔥 **處於極熱區**：股價正貼著預測的高點（布林上軌）往上衝，這是最強的漲勢信號。`,
                `🚀 **加速中**：均線斜率 **${smaSlope}%** 代表趨勢正向上加速。`,
                volText, rsiText,
                `💡 **白話建議**：這像是在飆車，雖然快但要抓穩，適合短線操作。`
            ]
        };
    } 
    else if (bb > 1 && bb <= 8 && smaSlope > 0.8) {
        recommendation = {
            score: 80,
            strategy: '穩健上漲',
            reasons: [
                `✅ **步步高升**：價格穩穩守在平均線之上，像「爬樓梯」一樣健康。`,
                `🛡️ **安全地帶**：股價沒有過熱，還有繼續往上的空間。`,
                weeklyText,
                rsiText,
                `💡 **白話建議**：適合想慢慢賺的人，跟著這個趨勢走通常比較安全。`
            ]
        };
    }
    else if (bb < -8 && smaSlope > -1) {
        recommendation = {
            score: 70,
            strategy: '跌深反彈',
            reasons: [
                `🆘 **正在特價**：股價跌到地板上了，就像「跳樓大拍賣」。`,
                `🛑 **不再慘跌**：雖然在低點，但已經不再像之前那樣慘跌。`,
                weeklyText,
                `💡 **白話建議**：適合想抄底的人，但要設定好停損點。`
            ]
        };
    } else {
        recommendation.reasons = [weeklyText, rsiText, volText, '💡 **建議**：目前沒有明顯信號，建議先觀望。'];
    }

    return recommendation;
}

async function getMetrics(stock) {
    try {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - 60);
        const history = await yahooFinance.historical(stock.symbol, { period1: startDate, period2: endDate, interval: '1d' });
        if (!history || history.length < 22) return null;
        const sorted = history.sort((a, b) => new Date(b.date) - new Date(a.date));
        const prices = sorted.map(h => h.close).filter(p => p != null);
        const volumes = sorted.map(h => h.volume).filter(v => v != null);
        if (prices.length < 22) return null;
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
        const volRatio = (avgVol5 && avgVol5 > 0) ? (volumes[0] / avgVol5) : 1;
        const metrics = { ...stock, price: current.toFixed(2), bbPosition: bbPos.toFixed(2), smaSlope: smaSlope.toFixed(2), upperSlope: upperSlope.toFixed(2), weeklyChange: weeklyChange.toFixed(2), rsi: rsi ? rsi.toFixed(2) : 'N/A', volRatio: volRatio.toFixed(2), updatedAt: new Date().toISOString() };
        metrics.analysis = analyzeStock(metrics);
        return metrics;
    } catch (e) {
        console.error('Error for ' + stock.symbol + ': ' + e.message);
        return null;
    }
}

async function main() {
    const [disposalList, hotList] = await Promise.all([fetchDisposalList(), fetchHotStocks()]);
    const combinedList = [...disposalList, ...hotList];
    const uniqueList = Array.from(new Set(combinedList.map(s => s.symbol))).map(symbol => combinedList.find(s => s.symbol === symbol));
    
    console.log('Total unique stocks to process: ' + uniqueList.length);
    const results = [];
    for (const s of uniqueList) {
        console.log('Processing ' + s.name + ' (' + s.symbol + ')...');
        const m = await getMetrics(s);
        if (m) results.push(m);
        await new Promise(r => setTimeout(r, 600));
    }
    fs.writeFileSync(require('path').join(__dirname, 'data.json'), JSON.stringify(results, null, 2));
    console.log('Saved ' + results.length + ' results.');
}
main();
