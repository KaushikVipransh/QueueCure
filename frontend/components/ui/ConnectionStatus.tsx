'use client';

import { useSocketContext } from '@/contexts/SocketContext';
import { Wifi, WifiOff } from 'lucide-react';
import clsx from 'clsx';

export function ConnectionStatus() {
  const { connected } = useSocketContext();

  return (
    <div
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-500',
        connected
          ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20'
          : 'bg-rose-400/10 text-rose-400 border-rose-400/20',
      )}
      title={connected ? 'Real-time connected' : 'Reconnecting...'}
    >
      {connected ? (
        <>
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
          </span>
          Live
        </>
      ) : (
        <>
          <WifiOff className="w-3 h-3" />
          Offline
        </>
      )}
    </div>
  );
}
