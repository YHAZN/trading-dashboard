# Trading Bot Dashboard

Professional trading terminal UI inspired by Bloomberg/TradingView aesthetics.

## Features

- **Real-time Order Book** - Live bid/ask depth visualization
- **Candlestick Charts** - Professional price charts using lightweight-charts
- **Market Watch** - Multi-symbol price tracking
- **Trade History** - Complete trade log with P&L tracking
- **Dark Theme** - Terminal-style UI optimized for extended viewing

## Setup

### 1. Create Supabase Project

1. Go to https://supabase.com and create a new project
2. Run the SQL in `supabase-setup.sql` in the SQL editor
3. Get your project URL and anon key from Settings > API

### 2. Configure Environment

```bash
# Edit .env.local
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Run Development Server

```bash
npm run dev
```

### 5. Integrate with Your Bot

In your trading bot, add:

```javascript
const botLogger = require('./bot-logger');

// Log trades
await botLogger.logTrade({
  symbol: 'BTC/USDT',
  side: 'buy',
  price: 50000,
  quantity: 0.001,
  status: 'open'
});

// Update market data (every second)
await botLogger.updateMarketData([
  {
    symbol: 'BTC/USDT',
    price: 50000,
    change24h: 2.5,
    volume: 1000000000,
    high24h: 51000,
    low24h: 49000
  }
]);

// Update order book (every second)
await botLogger.updateOrderBook(
  [{ price: 49999, size: 0.5 }, { price: 49998, size: 1.2 }], // bids
  [{ price: 50001, size: 0.3 }, { price: 50002, size: 0.8 }]  // asks
);

// Log candles (every minute)
await botLogger.logCandle({
  time: Math.floor(Date.now() / 1000),
  open: 50000,
  high: 50100,
  low: 49900,
  close: 50050,
  volume: 100,
  symbol: 'BTC/USDT',
  timeframe: '1m'
});
```

### 6. Deploy to Vercel

```bash
vercel --prod
```

Add environment variables in Vercel dashboard.

## Database Schema

- `trades` - All executed trades with P&L
- `market_data` - Current market prices and stats
- `order_book` - Live bid/ask depth
- `candles` - OHLCV candlestick data

## Tech Stack

- Next.js 15 + React 19
- Supabase (PostgreSQL + Realtime)
- lightweight-charts (TradingView library)
- Tailwind CSS

## Planned: Multi-Agent Decision Panel

Based on GreymatterAI asymmetric architecture research:

```
┌─────────────────────────────────────────────────────────┐
│  AGENT PANEL                          [Last: 15:34:22]  │
├──────────────┬──────────────┬──────────────┬────────────┤
│  TECHNICAL   │    MACRO     │  SENTIMENT   │ COMPOSITE  │
│  BUY 0.72 ✅ │  NEUTRAL 0.4 │  BULLISH 0.6 │   0.62 ✅  │
│  ORB break   │  Risk-on     │  Positive    │  EXECUTE   │
└──────────────┴──────────────┴──────────────┴────────────┘
```

Each agent receives only its own data feed (asymmetric). The composite score must exceed 0.35 to execute a trade.

## Architecture

```
Kraken WebSocket (ticks)  →  Technical Agent  ─┐
FRED + Economic calendar  →  Macro Agent      ─┤ → Synthesis → Quality Gate → Execute
NewsAPI + Fear & Greed    →  Sentiment Agent  ─┘
```

See `../trading-bot/docs/MULTI_AGENT_ARCHITECTURE.md` for full spec.
