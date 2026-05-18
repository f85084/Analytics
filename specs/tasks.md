# Tasks: Implementation Plan

## Phase 1: Data Analysis Upgrade
- [ ] Add RSI calculation to `fetch_data.js`.
- [ ] Add 5-day average volume calculation to `fetch_data.js`.
- [ ] Update `analyzeStock()` logic to synthesize RSI and Volume.
- [ ] Run `node fetch_data.js` and verify `data.json` structure.

## Phase 2: Visualization (Charts)
- [ ] Add TradingView Widget script to `index.html`.
- [ ] Implement `showChart(symbol)` modal logic in `index.html`.
- [ ] Add "📊 查看 K 線圖" button to card template.

## Phase 3: Cloud Storage (Supabase)
- [ ] Set up Supabase project and `mock_portfolio` table.
- [ ] Integrate Supabase CDN client in `index.html`.
- [ ] Implement `mockBuy(ticker, price)` and `fetchPortfolio()` functions.

## Phase 4: UI Refinement
- [ ] Design and implement the "My Portfolio" section.
- [ ] Add real-time profit/loss calculation in the UI.
- [ ] Final polishing and responsive testing (Mobile vs Desktop).
