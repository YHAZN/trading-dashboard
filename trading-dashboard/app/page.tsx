'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// ─── Types ──────────────────────────────────────────────────────────────
interface Trade {
  id: string;
  timestamp: string;
  created_at: string;
  side: 'buy' | 'sell';
  entry_price: number | null;
  exit_price: number | null;
  price: number;
  quantity: number;
  pnl: number | null;
  status: 'OPEN' | 'CLOSED';
  reason: string;
  symbol: string;
}

interface BotLog {
  id: string;
  timestamp: string;
  message: string;
  data: { price?: number; indicators?: Record<string, number>; signal?: string } | null;
}

interface BotState {
  balance: number;
  total_pnl: number;
  total_trades: number;
  winning_trades: number;
  win_rate: number;
  open_positions: number;
  current_price: number;
  current_z: number;
  current_rsi: number;
  current_regime: string;
  last_signal: string;
  is_running: boolean;
  updated_at: string;
}

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface PricePoint {
  time: string;
  price: number;
  ts: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────
function fmt(n: number | null | undefined, decimals = 2) {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const DEFAULT_STATE: BotState = {
  balance: 10000, total_pnl: 0, total_trades: 0, winning_trades: 0,
  win_rate: 0, open_positions: 0, current_price: 0, current_z: 0,
  current_rsi: 50, current_regime: 'RANGING', last_signal: 'WAIT',
  is_running: false, updated_at: '',
};

// ─── Dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [trades, setTrades]         = useState<Trade[]>([]);
  const [logs, setLogs]             = useState<BotLog[]>([]);
  const [botState, setBotState]     = useState<BotState>(DEFAULT_STATE);
  const [candles, setCandles]       = useState<Candle[]>([]);
  const [priceHistory, setPriceHist]= useState<PricePoint[]>([]);
  const [activeTab, setActiveTab]   = useState<'price' | 'pnl'>('price');

  // ─── Loaders ──────────────────────────────────────────────────────────
  const loadBotState = useCallback(async () => {
    const { data } = await supabase.from('bot_state').select('*').eq('id', 1).single();
    if (data) setBotState(data as BotState);
  }, []);

  const loadTrades = useCallback(async () => {
    const { data } = await supabase
      .from('trades').select('*').order('created_at', { ascending: false }).limit(100);
    if (data) setTrades(data as Trade[]);
  }, []);

  const loadLogs = useCallback(async () => {
    const { data } = await supabase
      .from('bot_logs').select('*').order('timestamp', { ascending: false }).limit(150);
    if (data) {
      setLogs(data as BotLog[]);
      // Seed price history from logs
      const pts: PricePoint[] = [];
      [...data].reverse().forEach(l => {
        if (l.data?.price) {
          pts.push({ time: fmtTime(l.timestamp), price: l.data.price, ts: new Date(l.timestamp).getTime() });
        }
      });
      setPriceHist(pts.slice(-120));
    }
  }, []);

  const loadCandles = useCallback(async () => {
    const { data } = await supabase
      .from('candles')
      .select('time,open,high,low,close,volume')
      .eq('symbol', 'BTC-USD')
      .eq('timeframe', '5m')
      .order('time', { ascending: false })
      .limit(60);
    if (data && data.length > 0) {
      setCandles([...data].reverse() as Candle[]);
    }
  }, []);

  // ─── Init + realtime ──────────────────────────────────────────────────
  useEffect(() => {
    loadBotState();
    loadTrades();
    loadLogs();
    loadCandles();

    // Poll bot_state every 10s
    const poll = setInterval(() => { loadBotState(); loadCandles(); }, 10_000);

    // Realtime: new log → append + update price history
    const logsCh = supabase.channel('rt-logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bot_logs' }, payload => {
        const l = payload.new as BotLog;
        setLogs(prev => [l, ...prev].slice(0, 150));
        if (l.data?.price) {
          const pt = { time: fmtTime(l.timestamp), price: l.data.price, ts: new Date(l.timestamp).getTime() };
          setPriceHist(prev => [...prev, pt].slice(-120));
        }
      })
      .subscribe();

    // Realtime: trades
    const tradesCh = supabase.channel('rt-trades')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades' }, loadTrades)
      .subscribe();

    return () => {
      clearInterval(poll);
      supabase.removeChannel(logsCh);
      supabase.removeChannel(tradesCh);
    };
  }, [loadBotState, loadTrades, loadLogs, loadCandles]);

  // ─── Derived stats ────────────────────────────────────────────────────
  const closedTrades = trades.filter(t => t.status === 'CLOSED');
  const pnlHistory = closedTrades
    .slice().reverse()
    .reduce<{ n: number; cum: number; label: string }[]>((acc, t, i) => {
      const prev = acc[i - 1]?.cum ?? 0;
      const cum = prev + (t.pnl ?? 0);
      acc.push({ n: i + 1, cum: parseFloat(cum.toFixed(2)), label: fmtDateTime(t.created_at) });
      return acc;
    }, []);

  // Candles for mini chart (use price history if no candles yet)
  const chartData = candles.length >= 5
    ? candles.map(c => ({ time: new Date(c.time * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), price: c.close, volume: c.volume }))
    : priceHistory;

  const price = botState.current_price || (priceHistory.at(-1)?.price ?? 0);
  const priceChangeRaw = priceHistory.length >= 2
    ? price - priceHistory[0].price : 0;
  const priceChangePct = priceHistory.length >= 2 && priceHistory[0].price
    ? (priceChangeRaw / priceHistory[0].price) * 100 : 0;

  const isRunning = botState.is_running;
  const lastUpdate = botState.updated_at ? fmtTime(botState.updated_at) : '—';

  // Indicator gauges
  const rsi = botState.current_rsi ?? 50;
  const zScore = botState.current_z ?? 0;
  const regime = botState.current_regime ?? 'RANGING';
  const signal = botState.last_signal ?? 'WAIT';

  return (
    <div className="min-h-screen bg-[#0d1117] text-white font-mono text-sm">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-blue-400">⚡ BTC Bot</span>
          <span className={`text-xs px-2 py-0.5 rounded ${isRunning ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
            {isRunning ? '● LIVE' : '○ STOPPED'}
          </span>
          <span className="text-xs text-gray-500">updated {lastUpdate}</span>
        </div>
        <div className="flex items-center gap-6 text-xs text-gray-400">
          <span>Paper Mode</span>
          <span>Kraken · BTC/USD · 5m</span>
        </div>
      </div>

      <div className="px-6 py-4 max-w-[1600px] mx-auto space-y-4">

        {/* Top stat bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {/* Price */}
          <div className="bg-[#161b22] rounded-lg p-4 col-span-2 sm:col-span-1">
            <div className="text-gray-500 text-xs mb-1">BTC/USD</div>
            <div className="text-2xl font-bold text-blue-300">${fmt(price, 0)}</div>
            <div className={`text-xs mt-1 ${priceChangeRaw >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {priceChangeRaw >= 0 ? '▲' : '▼'} ${Math.abs(priceChangeRaw).toFixed(0)} ({priceChangePct >= 0 ? '+' : ''}{priceChangePct.toFixed(2)}%)
            </div>
          </div>
          {/* Balance */}
          <div className="bg-[#161b22] rounded-lg p-4">
            <div className="text-gray-500 text-xs mb-1">Balance</div>
            <div className="text-xl font-bold">${fmt(botState.balance, 0)}</div>
            <div className="text-xs text-gray-500 mt-1">paper</div>
          </div>
          {/* P&L */}
          <div className="bg-[#161b22] rounded-lg p-4">
            <div className="text-gray-500 text-xs mb-1">Total P&L</div>
            <div className={`text-xl font-bold ${botState.total_pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {botState.total_pnl >= 0 ? '+' : ''}${fmt(botState.total_pnl)}
            </div>
            <div className="text-xs text-gray-500 mt-1">{closedTrades.length} closed</div>
          </div>
          {/* Win rate */}
          <div className="bg-[#161b22] rounded-lg p-4">
            <div className="text-gray-500 text-xs mb-1">Win Rate</div>
            <div className="text-xl font-bold text-yellow-300">{(botState.win_rate * 100).toFixed(0)}%</div>
            <div className="text-xs text-gray-500 mt-1">{botState.winning_trades}W / {botState.total_trades - botState.winning_trades}L</div>
          </div>
          {/* RSI */}
          <div className="bg-[#161b22] rounded-lg p-4">
            <div className="text-gray-500 text-xs mb-1">RSI (14)</div>
            <div className={`text-xl font-bold ${rsi < 30 ? 'text-green-400' : rsi > 70 ? 'text-red-400' : 'text-white'}`}>
              {fmt(rsi, 1)}
            </div>
            <div className="text-xs text-gray-500 mt-1">{rsi < 30 ? 'oversold' : rsi > 70 ? 'overbought' : 'neutral'}</div>
          </div>
          {/* Z-score */}
          <div className="bg-[#161b22] rounded-lg p-4">
            <div className="text-gray-500 text-xs mb-1">Z-Score</div>
            <div className={`text-xl font-bold ${zScore < -1.8 ? 'text-green-400' : zScore > 1.8 ? 'text-red-400' : 'text-white'}`}>
              {zScore >= 0 ? '+' : ''}{fmt(zScore, 2)}
            </div>
            <div className="text-xs text-gray-500 mt-1">20-bar mean</div>
          </div>
          {/* Regime + Signal */}
          <div className="bg-[#161b22] rounded-lg p-4">
            <div className="text-gray-500 text-xs mb-1">Regime</div>
            <div className={`text-base font-bold ${regime === 'TRENDING' ? 'text-orange-400' : 'text-cyan-400'}`}>{regime}</div>
            <div className={`text-xs font-bold mt-1 ${signal === 'BUY' ? 'text-green-400' : signal === 'SELL' ? 'text-red-400' : 'text-gray-400'}`}>
              {signal}
            </div>
          </div>
        </div>

        {/* Chart area */}
        <div className="bg-[#161b22] rounded-lg p-4">
          <div className="flex items-center gap-4 mb-3">
            <h2 className="font-bold text-gray-200">
              {candles.length >= 5 ? 'BTC/USD — 5m Candles' : 'BTC/USD — Live Price'}
            </h2>
            <div className="flex gap-2 ml-auto">
              <button onClick={() => setActiveTab('price')} className={`text-xs px-3 py-1 rounded ${activeTab === 'price' ? 'bg-blue-800 text-blue-200' : 'text-gray-500'}`}>Price</button>
              <button onClick={() => setActiveTab('pnl')} className={`text-xs px-3 py-1 rounded ${activeTab === 'pnl' ? 'bg-blue-800 text-blue-200' : 'text-gray-500'}`}>Cumulative P&L</button>
            </div>
          </div>

          {activeTab === 'price' && (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="time" stroke="#4b5563" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis
                  stroke="#4b5563"
                  tick={{ fontSize: 10 }}
                  domain={['auto', 'auto']}
                  tickFormatter={(v) => `$${v.toLocaleString()}`}
                  width={80}
                />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 6, fontSize: 11 }}
                  formatter={(v: number) => [`$${fmt(v, 2)}`, 'Price']}
                />
                <Line type="monotone" dataKey="price" stroke="#3b82f6" strokeWidth={1.5} dot={false} />
                {/* Entry price reference line */}
                {botState.open_positions > 0 && trades.find(t => t.status === 'OPEN') && (
                  <ReferenceLine
                    y={trades.find(t => t.status === 'OPEN')?.entry_price ?? undefined}
                    stroke="#f59e0b"
                    strokeDasharray="4 2"
                    label={{ value: 'Entry', fill: '#f59e0b', fontSize: 10 }}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          )}

          {activeTab === 'pnl' && (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={pnlHistory}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="n" stroke="#4b5563" tick={{ fontSize: 10 }} label={{ value: 'trade #', fill: '#6b7280', fontSize: 10, position: 'insideBottom', offset: -2 }} />
                <YAxis stroke="#4b5563" tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v}`} width={60} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 6, fontSize: 11 }}
                  formatter={(v: number) => [`$${fmt(v)}`, 'Cumulative P&L']}
                  labelFormatter={(n) => pnlHistory[n - 1]?.label ?? `trade #${n}`}
                />
                <ReferenceLine y={0} stroke="#374151" />
                <Line type="monotone" dataKey="cum" stroke={pnlHistory.at(-1)?.cum ?? 0 >= 0 ? '#10b981' : '#ef4444'} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Bottom panels */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Live Logs */}
          <div className="bg-[#161b22] rounded-lg p-4">
            <h2 className="font-bold text-gray-200 mb-3 flex items-center gap-2">
              Live Bot Logs
              <span className="text-xs text-gray-500 ml-auto">{logs.length} entries</span>
            </h2>
            <div className="h-80 overflow-y-auto space-y-1 pr-1">
              {logs.length === 0 && <div className="text-gray-600 text-xs py-8 text-center">Waiting for bot…</div>}
              {logs.map(log => {
                const isError  = log.message.includes('⚠️') || log.message.includes('❌');
                const isTrade  = log.message.includes('✅') || log.message.includes('🟢') || log.message.includes('🔴') || log.message.includes('💰') || log.message.includes('💸');
                const isSignal = log.message.includes('BUY') || log.message.includes('SELL');
                return (
                  <div key={log.id} className={`text-xs flex gap-2 ${isError ? 'text-red-400' : isTrade || isSignal ? 'text-yellow-300' : 'text-gray-400'}`}>
                    <span className="text-gray-600 shrink-0">{fmtTime(log.timestamp)}</span>
                    <span>{log.message}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Trades */}
          <div className="bg-[#161b22] rounded-lg p-4">
            <h2 className="font-bold text-gray-200 mb-3 flex items-center gap-2">
              Trades
              <span className="text-xs text-gray-500 ml-auto">{trades.length} total</span>
            </h2>
            <div className="h-80 overflow-y-auto">
              {trades.length === 0 && <div className="text-gray-600 text-xs py-8 text-center">No trades yet</div>}
              {/* Header */}
              {trades.length > 0 && (
                <div className="grid grid-cols-5 text-xs text-gray-600 border-b border-gray-800 pb-1 mb-1">
                  <span>Side</span><span>Price</span><span>P&L</span><span>Status</span><span className="col-span-1 truncate">Reason</span>
                </div>
              )}
              {trades.map(trade => {
                const isLong   = trade.side === 'buy';
                const isClosed = trade.status === 'CLOSED';
                const pnlPos   = (trade.pnl ?? 0) >= 0;
                return (
                  <div key={trade.id} className="grid grid-cols-5 text-xs py-1.5 border-b border-gray-800/60 items-center gap-1">
                    <span className={`font-bold ${isLong ? 'text-green-400' : 'text-red-400'}`}>
                      {isLong ? '▲ BUY' : '▼ SELL'}
                    </span>
                    <span className="text-gray-300">${fmt(trade.entry_price ?? trade.price, 0)}</span>
                    <span className={isClosed ? (pnlPos ? 'text-green-400' : 'text-red-400') : 'text-gray-500'}>
                      {isClosed ? `${pnlPos ? '+' : ''}$${fmt(trade.pnl)}` : '—'}
                    </span>
                    <span className={`text-xs ${isClosed ? 'text-gray-500' : 'text-yellow-400'}`}>{trade.status}</span>
                    <span className="text-gray-600 truncate" title={trade.reason}>{trade.reason?.split(':')[0]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Open positions banner */}
        {botState.open_positions > 0 && (() => {
          const open = trades.find(t => t.status === 'OPEN');
          if (!open || !open.entry_price) return null;
          const unrealized = (price - open.entry_price) * open.quantity;
          return (
            <div className={`rounded-lg p-4 border flex items-center gap-6 ${unrealized >= 0 ? 'bg-green-900/20 border-green-800' : 'bg-red-900/20 border-red-800'}`}>
              <span className="text-yellow-300 font-bold text-sm">📌 OPEN POSITION</span>
              <span className="text-gray-300 text-sm">BTC @ ${fmt(open.entry_price)} × {open.quantity}</span>
              <span className={`font-bold text-sm ${unrealized >= 0 ? 'text-green-300' : 'text-red-300'}`}>
                Unrealized: {unrealized >= 0 ? '+' : ''}${fmt(unrealized)}
              </span>
              <span className="text-gray-500 text-xs ml-auto">{fmtDateTime(open.created_at)}</span>
            </div>
          );
        })()}

        <div className="text-xs text-gray-700 text-right pb-2">
          BTC Trading Bot · Paper Mode · Kraken · Supabase realtime
        </div>
      </div>
    </div>
  );
}
