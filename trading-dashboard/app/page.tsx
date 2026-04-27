'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import dynamic from 'next/dynamic';

const TradingChart = dynamic(() => import('../components/TradingChart'), { ssr: false });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
);

interface Trade {
  id: string;
  timestamp: string;
  symbol: string;
  side: 'buy' | 'sell';
  price: number;
  quantity: number;
  pnl?: number;
  status: 'open' | 'closed';
}

interface MarketData {
  symbol: string;
  price: number;
  change24h: number;
  volume: number;
  high24h: number;
  low24h: number;
}

interface OrderBookLevel {
  price: number;
  size: number;
}

interface CandlestickData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export default function Dashboard() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [marketData, setMarketData] = useState<MarketData[]>([]);
  const [orderBook, setOrderBook] = useState<{ bids: OrderBookLevel[]; asks: OrderBookLevel[] }>({ bids: [], asks: [] });
  const [chartData, setChartData] = useState<CandlestickData[]>([]);
  const [totalPnL, setTotalPnL] = useState(0);

  useEffect(() => {
    const channel = supabase
      .channel('trades')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades' }, (payload) => {
        setTrades((prev) => [payload.new as Trade, ...prev].slice(0, 50));
      })
      .subscribe();

    fetchTrades();
    fetchMarketData();
    fetchOrderBook();
    fetchChartData();

    const interval = setInterval(() => {
      fetchMarketData();
      fetchOrderBook();
      fetchChartData();
    }, 1000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  const fetchTrades = async () => {
    const { data } = await supabase.from('trades').select('*').order('timestamp', { ascending: false }).limit(50);
    if (data) setTrades(data);
  };

  const fetchMarketData = async () => {
    const { data } = await supabase.from('market_data').select('*');
    if (data) setMarketData(data);
  };

  const fetchOrderBook = async () => {
    const { data } = await supabase.from('order_book').select('*').single();
    if (data) setOrderBook(data);
  };

  const fetchChartData = async () => {
    const { data } = await supabase.from('candles').select('*').order('time', { ascending: true }).limit(500);
    if (data) setChartData(data);
  };

  useEffect(() => {
    const pnl = trades.filter(t => t.status === 'closed').reduce((sum, t) => sum + (t.pnl || 0), 0);
    setTotalPnL(pnl);
  }, [trades]);

  return (
    <div className="min-h-screen bg-[#0a0e27] text-gray-100 font-mono">
      <div className="border-b border-gray-800 bg-[#0d1117] px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-bold text-blue-400">TRADING TERMINAL</h1>
          <div className="flex gap-4 text-sm">
            {marketData.slice(0, 3).map((m) => (
              <div key={m.symbol} className="flex items-center gap-2">
                <span className="text-gray-400">{m.symbol}</span>
                <span className="text-white font-semibold">${m.price.toFixed(2)}</span>
                <span className={m.change24h >= 0 ? 'text-green-400' : 'text-red-400'}>
                  {m.change24h >= 0 ? '+' : ''}{m.change24h.toFixed(2)}%
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs text-gray-500">Total P&L</div>
            <div className={`text-lg font-bold ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {totalPnL >= 0 ? '+' : ''}${totalPnL.toFixed(2)}
            </div>
          </div>
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
        </div>
      </div>

      <div className="grid grid-cols-12 gap-4 p-4 h-[calc(100vh-64px)]">
        <div className="col-span-3 bg-[#0d1117] border border-gray-800 rounded overflow-hidden flex flex-col">
          <div className="px-4 py-2 border-b border-gray-800 text-xs font-semibold text-gray-400">ORDER BOOK</div>
          <div className="flex-1 overflow-auto">
            <div className="grid grid-cols-3 gap-2 px-4 py-1 text-xs text-gray-500 border-b border-gray-800">
              <div>Price</div>
              <div className="text-right">Size</div>
              <div className="text-right">Total</div>
            </div>
            {orderBook.asks.slice(0, 15).reverse().map((ask, i) => (
              <div key={`ask-${i}`} className="grid grid-cols-3 gap-2 px-4 py-1 text-xs hover:bg-red-950/20 relative">
                <div className="absolute inset-0 bg-red-900/10" style={{ width: `${(ask.size / Math.max(...orderBook.asks.map(a => a.size))) * 100}%` }} />
                <div className="text-red-400 relative z-10">{ask.price.toFixed(2)}</div>
                <div className="text-right text-gray-300 relative z-10">{ask.size.toFixed(4)}</div>
                <div className="text-right text-gray-500 relative z-10">{(ask.price * ask.size).toFixed(2)}</div>
              </div>
            ))}
            <div className="px-4 py-2 text-center text-xs font-semibold text-yellow-400 border-y border-gray-800">
              {orderBook.asks[0] && orderBook.bids[0] ? `Spread: $${(orderBook.asks[0].price - orderBook.bids[0].price).toFixed(2)}` : 'Loading...'}
            </div>
            {orderBook.bids.slice(0, 15).map((bid, i) => (
              <div key={`bid-${i}`} className="grid grid-cols-3 gap-2 px-4 py-1 text-xs hover:bg-green-950/20 relative">
                <div className="absolute inset-0 bg-green-900/10" style={{ width: `${(bid.size / Math.max(...orderBook.bids.map(b => b.size))) * 100}%` }} />
                <div className="text-green-400 relative z-10">{bid.price.toFixed(2)}</div>
                <div className="text-right text-gray-300 relative z-10">{bid.size.toFixed(4)}</div>
                <div className="text-right text-gray-500 relative z-10">{(bid.price * bid.size).toFixed(2)}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-6 bg-[#0d1117] border border-gray-800 rounded overflow-hidden flex flex-col">
          <div className="px-4 py-2 border-b border-gray-800 flex items-center justify-between">
            <div className="text-xs font-semibold text-gray-400">PRICE CHART</div>
            <div className="flex gap-2 text-xs">
              {['1m', '5m', '15m', '1h', '4h', '1d'].map((tf) => (
                <button key={tf} className="px-2 py-1 hover:bg-gray-800 rounded text-gray-400 hover:text-white">
                  {tf}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1">
            <TradingChart data={chartData} />
          </div>
        </div>

        <div className="col-span-3 bg-[#0d1117] border border-gray-800 rounded overflow-hidden flex flex-col">
          <div className="px-4 py-2 border-b border-gray-800 text-xs font-semibold text-gray-400">MARKET WATCH</div>
          <div className="flex-1 overflow-auto">
            {marketData.map((m) => (
              <div key={m.symbol} className="px-4 py-3 border-b border-gray-800 hover:bg-gray-900/50 cursor-pointer">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold">{m.symbol}</span>
                  <span className={`text-xs px-2 py-0.5 rounded ${m.change24h >= 0 ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                    {m.change24h >= 0 ? '+' : ''}{m.change24h.toFixed(2)}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>${m.price.toFixed(2)}</span>
                  <span>Vol: ${(m.volume / 1e6).toFixed(1)}M</span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500 mt-1">
                  <span>H: ${m.high24h.toFixed(2)}</span>
                  <span>L: ${m.low24h.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="col-span-12 bg-[#0d1117] border border-gray-800 rounded overflow-hidden flex flex-col">
          <div className="px-4 py-2 border-b border-gray-800 text-xs font-semibold text-gray-400">TRADE HISTORY</div>
          <div className="overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-900/50 sticky top-0">
                <tr className="text-gray-500">
                  <th className="px-4 py-2 text-left">Time</th>
                  <th className="px-4 py-2 text-left">Symbol</th>
                  <th className="px-4 py-2 text-left">Side</th>
                  <th className="px-4 py-2 text-right">Price</th>
                  <th className="px-4 py-2 text-right">Quantity</th>
                  <th className="px-4 py-2 text-right">Total</th>
                  <th className="px-4 py-2 text-right">P&L</th>
                  <th className="px-4 py-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <tr key={trade.id} className="border-b border-gray-800 hover:bg-gray-900/30">
                    <td className="px-4 py-2 text-gray-400">{new Date(trade.timestamp).toLocaleTimeString()}</td>
                    <td className="px-4 py-2 font-semibold">{trade.symbol}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs ${trade.side === 'buy' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                        {trade.side.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">${trade.price.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right">{trade.quantity.toFixed(4)}</td>
                    <td className="px-4 py-2 text-right">${(trade.price * trade.quantity).toFixed(2)}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${trade.pnl && trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {trade.pnl ? `${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-4 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded text-xs ${trade.status === 'open' ? 'bg-blue-900/30 text-blue-400' : 'bg-gray-700 text-gray-400'}`}>
                        {trade.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
