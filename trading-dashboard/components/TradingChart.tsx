'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface CandlestickData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export default function TradingChart({ data }: { data: CandlestickData[] }) {
  const chartData = data.map(d => ({
    time: new Date(d.time * 1000).toLocaleTimeString(),
    price: d.close,
  }));

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
        <XAxis dataKey="time" stroke="#6b7280" />
        <YAxis stroke="#6b7280" domain={['auto', 'auto']} />
        <Tooltip 
          contentStyle={{ backgroundColor: '#1f2937', border: 'none' }}
          labelStyle={{ color: '#9ca3af' }}
        />
        <Line type="monotone" dataKey="price" stroke="#10b981" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
