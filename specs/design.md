# Design: Technical Architecture

## 1. Tech Stack
- **Frontend**: Vanilla HTML/JS/CSS (kept for simplicity and performance).
- **Backend/Storage**: **Supabase** (PostgreSQL + Auth + Realtime).
  - *Reasoning*: Extremely easy to integrate via CDN, provides a ready-to-use cloud database for mock trading data.
- **Charts**: **TradingView Lightweight Charts** or **Widget API**.
  - *Decision*: Use the Widget API for zero-config, professional-grade interactive charts.

## 2. Data Logic
### RSI Calculation
- Formula: `RSI = 100 - (100 / (1 + RS))`
- Period: 14 days.
- Implementation: Calculated in `fetch_data.js` using historical data from Yahoo Finance.

### Volume Analysis
- Metric: `currentVolume / average(volume_last_5_days)`.
- Flag: "Volume Surge" if ratio > 1.5.

## 3. Mock Trading Flow
1. **Frontend**: UI triggers `buyStock(ticker, price)`.
2. **Supabase**: Row inserted into `mock_portfolio` table.
3. **Synchronization**: On page load, `fetchPortfolio()` pulls latest data from Supabase.
4. **Calculations**: Profit = `(currentPrice - buyPrice) / buyPrice * 100`.

## 4. UI Components
- **Chart Modal**: A centered overlay appearing when "View K-Line" is clicked.
- **Portfolio Bar**: A sticky footer or dedicated section showing total mock profit and active positions.
