import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Mock data for now - you'll need to set up a real data source
export async function GET() {
  const mockLogs = [
    '[17:08:30] 📊 BTC: $76,899.00 | Z: -1.22 | RSI: 29.2 | ADX: 0.0',
    '[17:08:30] 🧠 No setup: Z=-1.22, RSI=29.2, Regime=RANGING',
    '[17:08:30] 📈 Stats: 23 trades | Win rate: 0.0% | P&L: $-75.78',
  ];
  
  return NextResponse.json({ 
    logs: mockLogs,
    note: 'Connect to a real-time data source (Supabase, Firebase, or webhook)'
  });
}
