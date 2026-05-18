# Specification: Advanced Stock Assistant

## 1. Functional Requirements

### FR1: Advanced Technical Analysis
- The system must calculate **RSI (14-day)** to detect overbought/oversold conditions.
- The system must calculate **Volume Change** (current vs 5-day average).
- The "Why" section must synthesize BB, SMA, RSI, and Volume into a plain-language summary.

### FR2: K-Line Chart Visualization
- Each stock card must feature a button to display a **TradingView K-line chart**.
- The chart should default to a 1-day interval and show indicators (BB, SMA).

### FR3: Cloud-Synced Mock Trading
- Users can "Buy" a stock at its current price.
- Users can "Sell" a stock from their portfolio.
- Portfolio data (Ticker, Buy Price, Quantity, Date) must be **synced to a cloud database**.
- The UI must display "Current Profit/Loss (%)" for each mock holding.

## 2. User Scenarios

### Scenario 1: Confirming a Breakout
1. User sees a stock marked as "Strong Breakout" (強勢噴發).
2. User checks the "Why" section: "Volume is 2x average, RSI is 65 (not overheated yet)."
3. User clicks "📊 View K-Line" to visually confirm the breakout pattern.
4. User clicks "💰 Mock Buy" to track the performance.

### Scenario 2: Mobile Review
1. User buys a mock position on their PC at work.
2. User opens the dashboard on their phone during the commute.
3. User sees the exact same portfolio and updated profit/loss.
