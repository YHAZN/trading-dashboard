'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import dynamic from 'next/dynamic';

const TradingChart = dynamic(() => import('../components/TradingChart'), { ssr: false });

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
  const [supabase, setSupabase] = useState<any>(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    
    if (!url || !key) {
      console.warn('Supabase credentials not configured');
      return;
    }

    const client = createClient(url, key);
    setSupabase(client);

    const channel = client
      .channel('trades')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades' }, (payload) => {
        setTrades((prev) => [payload.new as Trade, ...prev].slice(0, 50));
      })
      .subscribe();

    fetchTrades(client);
    fetchMarketData(client);
    fetchOrderBook(client);
    fetchChartData(client);

    const interval = setInterval(() => {
      fetchMarketData(client);
      fetchOrderBook(client);
      fetchChartData(client);
    }, 1000);

    return () => {
      client.removeChannel(channel);
      clearInterval(interval);
    };
  }, []);

  const fetchTrades = async (client: any) => {
    const { data } = await client.from('trades').select('*').order('timestamp', { ascending: false }).limit(50);
    if (data) setTrades(data);
  };

  const fetchMarketData = async (client: any) => {
    const { data } = await client.from('market_data').select('*');
    if (data) setMarketData(data);
  };

  const fetchOrderBook = async (client: any) => {
    const { data } = await client.from('order_book').select('*').limit(1);
    if (data && data[0]) setOrderBook(data[0]);
  };

  const fetchChartData = async (client: any) => {
    const { data } = await client.from('candles').select('*').order('time', { ascending: true }).limit(500);
    if (data) setChartData(data);
  };

  useEffect(() => {
    const pnl = trades.filter(t => t.status === 'closed').reduce((sum, t) => sum + (t.pnl || 0), 0);
    setTotalPnL(pnl);
  }, [trades]);

  if (!supabase) {
    return (
      <div className="min-h-screen bg-[#0a0e27] text-gray-100 font-mono flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-blue-400 mb-4">Trading Terminal</h1>
          <p className="text-gray-400">Configure Supabase credentials to connect</p>
          <p className="text-sm text-gray-500 mt-2">Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY</p>
        </div>
      </div>
    );
  }

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
            <div className="space-y-px">
              {orderBook.asks.slice(0, 15).reverse().map((ask, i) => (
                <div key={`ask-${i}`} className="grid grid-cols-3 gap-2 px-4 py-0.5 text-xs hover:bg-red-900/10">
                  <div className="text-red-400">${ask.price.toFixed(2)}</div>
                  <div className="text-right text-gray-400">{ask.size.toFixed(4)}</div>
                  <div className="text-right text-gray-500">${(ask.price * ask.size).toFixed(2)}</div>
                </div>
              ))}
              <div className="h-px bg-gray-700 my-1" />
              {orderBook.bids.slice(0, 15).map((bid, i) => (
                <div key={`bid-${i}`} className="grid grid-cols-3 gap-2 px-4 py-0.5 text-xs hover:bg-green-900/10">
                  <div className="text-green-400">${bid.price.toFixed(2)}</div>
                  <div className="text-right text-gray-400">{bid.size.toFixed(4)}</div>
                  <div className="text-right text-gray-500">${(bid.price * bid.size).toFixed(2)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col-span-6 bg-[#0d1117] border border-gray-800 rounded overflow-hidden flex flex-col">
          <div className="px-4 py-2 border-b border-gray-800 text-xs font-semibold text-gray-400 flex items-center justify-between">
            <span>PRICE CHART</span>
            <div className="flex gap-2">
              <button className="px-2 py-0.5 bg-blue-600 text-white rounded text-xs">1m</button>
              <button className="px-2 py-0.5 bg-gray-700 text-gray-400 rounded text-xs">5m</button>
              <button className="px-2 py-0.5 bg-gray-700 text-gray-400 rounded text-xs">15m</button>
              <button className="px-2 py-0.5 bg-gray-700 text-gray-400 rounded text-xs">1h</button>
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
              <div key={m.symbol} className="px-4 py-2 border-b border-gray-800 hover:bg-gray-900/30 cursor-pointer">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold">{m.symbol}</span>
                  <span className={`text-sm ${m.change24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {m.change24h >= 0 ? '+' : ''}{m.change24h.toFixed(2)}%
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-white font-semibold">${m.price.toFixed(2)}</span>
                  <span className="text-gray-500 text-xs">Vol: ${(m.volume / 1000000).toFixed(2)}M</span>
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
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[#0d1117]">
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
