'use client';

import { useSocketContext } from '@/contexts/SocketContext';
import { WifiOff } from 'lucide-react';

export function ConnectionStatus() {
  const { connected } = useSocketContext();

  return (
    <div
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-500 w-full justify-center"
      style={
        connected
          ? { background: 'rgba(15,155,110,0.15)', color: '#34d399' }
          : { background: 'rgba(201,54,54,0.15)', color: '#fb7185' }
      }
      title={connected ? 'Real-time connected' : 'Reconnecting...'}
    >
      {connected ? (
        <>
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: '#34d399' }} />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: '#34d399' }} />
          </span>
          Live · Connected
        </>
      ) : (
        <>
          <WifiOff size={11} />
          Reconnecting...
        </>
      )}
    </div>
  );
}
