'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

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

export default function Dashboard() {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [logs, setLogs] = useState<BotLog[]>([]);
  const [stats, setStats] = useState({ total: 0, wins: 0, losses: 0, pnl: 0 });

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
        setLogs(prev => [payload.new as BotLog, ...prev].slice(0, 100));
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
    
    if (data) setLogs(data);
  }

  return (
    <div className="min-h-screen bg-black text-green-400 font-mono p-4">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl mb-6 border-b border-green-400 pb-2">TRADING BOT TERMINAL</h1>
        
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="border border-green-400 p-4">
            <div className="text-sm opacity-70">TOTAL TRADES</div>
            <div className="text-2xl">{stats.total}</div>
          </div>
          <div className="border border-green-400 p-4">
            <div className="text-sm opacity-70">WINS</div>
            <div className="text-2xl text-green-500">{stats.wins}</div>
          </div>
          <div className="border border-green-400 p-4">
            <div className="text-sm opacity-70">LOSSES</div>
            <div className="text-2xl text-red-500">{stats.losses}</div>
          </div>
          <div className="border border-green-400 p-4">
            <div className="text-sm opacity-70">P&L</div>
            <div className={`text-2xl ${stats.pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              ${stats.pnl.toFixed(2)}
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h2 className="text-xl mb-3 border-b border-green-400 pb-1">LIVE BOT ACTIVITY</h2>
          <div className="border border-green-400 p-4 h-96 overflow-y-auto bg-black">
            {logs.length === 0 && (
              <div className="opacity-50">Waiting for bot activity...</div>
            )}
            {logs.map(log => (
              <div key={log.id} className="mb-2 text-sm">
                <span className="opacity-50">[{new Date(log.timestamp).toLocaleTimeString()}]</span>{' '}
                <span>{log.message}</span>
                {log.data && (
                  <div className="ml-4 opacity-70 text-xs">
                    {JSON.stringify(log.data, null, 2)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-xl mb-3 border-b border-green-400 pb-1">RECENT TRADES</h2>
          <div className="border border-green-400">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-green-400">
                  <th className="p-2 text-left">TIME</th>
                  <th className="p-2 text-left">SIDE</th>
                  <th className="p-2 text-right">ENTRY</th>
                  <th className="p-2 text-right">EXIT</th>
                  <th className="p-2 text-right">P&L</th>
                  <th className="p-2 text-left">STATUS</th>
                  <th className="p-2 text-left">REASON</th>
                </tr>
              </thead>
              <tbody>
                {trades.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-4 text-center opacity-50">
                      No trades yet
                    </td>
                  </tr>
                )}
                {trades.map(trade => (
                  <tr key={trade.id} className="border-b border-green-400/30">
                    <td className="p-2">{new Date(trade.timestamp).toLocaleString()}</td>
                    <td className={`p-2 ${trade.side === 'LONG' ? 'text-green-500' : 'text-red-500'}`}>
                      {trade.side}
                    </td>
                    <td className="p-2 text-right">${trade.entry_price.toFixed(2)}</td>
                    <td className="p-2 text-right">
                      {trade.exit_price ? `$${trade.exit_price.toFixed(2)}` : '-'}
                    </td>
                    <td className={`p-2 text-right ${(trade.pnl || 0) >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {trade.pnl ? `$${trade.pnl.toFixed(2)}` : '-'}
                    </td>
                    <td className="p-2">{trade.status}</td>
                    <td className="p-2 text-xs opacity-70">{trade.reason}</td>
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
