-- Create tables for trading bot data

-- Trades table
CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
  price NUMERIC NOT NULL,
  quantity NUMERIC NOT NULL,
  pnl NUMERIC,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Market data table
CREATE TABLE IF NOT EXISTS market_data (
  symbol TEXT PRIMARY KEY,
  price NUMERIC NOT NULL,
  change24h NUMERIC NOT NULL,
  volume NUMERIC NOT NULL,
  high24h NUMERIC NOT NULL,
  low24h NUMERIC NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Order book table
CREATE TABLE IF NOT EXISTS order_book (
  id INTEGER PRIMARY KEY DEFAULT 1,
  bids JSONB NOT NULL DEFAULT '[]',
  asks JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Candlestick data table
CREATE TABLE IF NOT EXISTS candles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  time BIGINT NOT NULL,
  open NUMERIC NOT NULL,
  high NUMERIC NOT NULL,
  low NUMERIC NOT NULL,
  close NUMERIC NOT NULL,
  volume NUMERIC,
  symbol TEXT NOT NULL DEFAULT 'BTC/USDT',
  timeframe TEXT NOT NULL DEFAULT '1m',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(time, symbol, timeframe)
);

-- Enable realtime for trades
ALTER PUBLICATION supabase_realtime ADD TABLE trades;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_trades_symbol ON trades(symbol);
CREATE INDEX IF NOT EXISTS idx_candles_time ON candles(time DESC);
CREATE INDEX IF NOT EXISTS idx_candles_symbol_timeframe ON candles(symbol, timeframe, time DESC);
