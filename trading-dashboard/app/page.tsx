'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Trade {
  id: string;
  timestamp: string;
  side: 'LONG' | 'SHORT';
  entry_price: number;
  exit_price: number | null;
  pnl: number | null;
  status: 'OPEN' | 'CLOSED';
  reason: string;
}

interface BotLog {
  id: string;
  timestamp: string;
  message: string;
  data: any;
}

interface PricePoint {
  time: string;
  price: number;
}

export default function Dashboard() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [logs, setLogs] = useState<BotLog[]>([]);
  const [priceData, setPriceData] = useState<PricePoint[]>([]);
  const [stats, setStats] = useState({ total: 0, wins: 0, losses: 0, pnl: 0 });
  const [currentPrice, setCurrentPrice] = useState<number>(0);

  useEffect(() => {
    loadTrades();
    loadLogs();

    const tradesChannel = supabase
      .channel('trades')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trades' }, loadTrades)
      .subscribe();

    const logsChannel = supabase
      .channel('bot_logs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bot_logs' }, (payload) => {
        const log = payload.new as BotLog;
        setLogs(prev => [log, ...prev].slice(0, 100));
        
        // Extract price from log data
        if (log.data?.price) {
          const price = log.data.price;
          setCurrentPrice(price);
          setPriceData(prev => {
            const newData = [...prev, {
              time: new Date(log.timestamp).toLocaleTimeString(),
              price: price
            }];
            return newData.slice(-50); // Keep last 50 points
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(tradesChannel);
      supabase.removeChannel(logsChannel);
    };
  }, []);

  async function loadTrades() {
    const { data } = await supabase
      .from('trades')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(50);
    
    if (data) {
      setTrades(data);
      
      const total = data.length;
      const closed = data.filter(t => t.status === 'CLOSED');
      const wins = closed.filter(t => (t.pnl || 0) > 0).length;
      const losses = closed.filter(t => (t.pnl || 0) < 0).length;
      const pnl = closed.reduce((sum, t) => sum + (t.pnl || 0), 0);
      
      setStats({ total, wins, losses, pnl });
    }
  }

  async function loadLogs() {
    const { data } = await supabase
      .from('bot_logs')
      .select('*')
      .order('timestamp', { ascending: false })
      .limit(100);
    
    if (data) {
      setLogs(data);
      
      // Build initial price chart
      const prices: PricePoint[] = [];
      data.reverse().forEach(log => {
        if (log.data?.price) {
          prices.push({
            time: new Date(log.timestamp).toLocaleTimeString(),
            price: log.data.price
          });
        }
      });
      setPriceData(prices.slice(-50));
      if (prices.length > 0) {
        setCurrentPrice(prices[prices.length - 1].price);
      }
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">Trading Bot Dashboard</h1>
        
        {/* Stats */}
        <div className="grid grid-cols-5 gap-4 mb-8">
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="text-gray-400 text-sm mb-2">Current Price</div>
            <div className="text-3xl font-bold text-blue-400">
              ${currentPrice.toLocaleString()}
            </div>
          </div>
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="text-gray-400 text-sm mb-2">Total Trades</div>
            <div className="text-3xl font-bold">{stats.total}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="text-gray-400 text-sm mb-2">Wins</div>
            <div className="text-3xl font-bold text-green-400">{stats.wins}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="text-gray-400 text-sm mb-2">Losses</div>
            <div className="text-3xl font-bold text-red-400">{stats.losses}</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-6">
            <div className="text-gray-400 text-sm mb-2">P&L</div>
            <div className={`text-3xl font-bold ${stats.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ${stats.pnl.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Live Price Chart */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8">
          <h2 className="text-2xl font-bold mb-4">Live BTC Price</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={priceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="time" stroke="#9CA3AF" />
              <YAxis 
                stroke="#9CA3AF"
                domain={['auto', 'auto']}
                tickFormatter={(value) => `$${value.toLocaleString()}`}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1F2937', border: 'none', borderRadius: '8px' }}
                labelStyle={{ color: '#9CA3AF' }}
                formatter={(value: number) => [`$${value.toLocaleString()}`, 'Price']}
              />
              <Line 
                type="monotone" 
                dataKey="price" 
                stroke="#3B82F6" 
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="grid grid-cols-2 gap-8">
          {/* Live Logs */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-2xl font-bold mb-4">Live Bot Activity</h2>
            <div className="h-96 overflow-y-auto font-mono text-sm space-y-2">
              {logs.length === 0 && (
                <div className="text-gray-500">Waiting for bot activity...</div>
              )}
              {logs.map(log => (
                <div key={log.id} className="text-gray-300">
                  <span className="text-gray-500">[{new Date(log.timestamp).toLocaleTimeString()}]</span>{' '}
                  {log.message}
                </div>
              ))}
            </div>
          </div>

          {/* Recent Trades */}
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-2xl font-bold mb-4">Recent Trades</h2>
            <div className="h-96 overflow-y-auto">
              {trades.length === 0 && (
                <div className="text-gray-500 text-center py-8">No trades yet</div>
              )}
              {trades.map(trade => (
                <div key={trade.id} className="border-b border-gray-700 py-3">
                  <div className="flex justify-between items-start mb-1">
                    <span className={`font-bold ${trade.side === 'LONG' ? 'text-green-400' : 'text-red-400'}`}>
                      {trade.side}
                    </span>
                    <span className="text-gray-400 text-sm">
                      {new Date(trade.timestamp).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-sm text-gray-400">
                    Entry: ${trade.entry_price.toFixed(2)}
                    {trade.exit_price && ` → Exit: $${trade.exit_price.toFixed(2)}`}
                  </div>
                  {trade.pnl !== null && (
                    <div className={`text-sm font-bold ${trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      P&L: ${trade.pnl.toFixed(2)}
                    </div>
                  )}
                  <div className="text-xs text-gray-500 mt-1">{trade.reason}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
