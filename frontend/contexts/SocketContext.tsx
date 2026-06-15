'use client';

import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { QueueState } from '@/lib/types';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3001';

interface SocketContextValue {
  socket: Socket | null;
  connected: boolean;
  queueState: QueueState | null;
  lastEvent: string | null;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  connected: false,
  queueState: null,
  lastEvent: null,
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [queueState, setQueueState] = useState<QueueState | null>(null);
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      console.log('[Socket] Connected:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      setConnected(false);
      console.log('[Socket] Disconnected:', reason);
    });

    socket.on('queue-updated', (state: QueueState) => {
      setQueueState(state);
      setLastEvent('queue-updated');
    });

    socket.on('patient-added', ({ queueState: state }: { queueState: QueueState }) => {
      setQueueState(state);
      setLastEvent('patient-added');
    });

    socket.on('call-next', ({ queueState: state }: { queueState: QueueState }) => {
      setQueueState(state);
      setLastEvent('call-next');
    });

    socket.on('consultation-completed', ({ queueState: state }: { queueState: QueueState }) => {
      setQueueState(state);
      setLastEvent('consultation-completed');
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const value: SocketContextValue = {
    socket: socketRef.current,
    connected,
    queueState,
    lastEvent,
  };

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocketContext() {
  return useContext(SocketContext);
}

export function useJoinPatientRoom(tokenNumber: number | undefined) {
  const { socket } = useSocketContext();

  useEffect(() => {
    if (!socket || !tokenNumber) return;

    socket.emit('join-patient-room', tokenNumber);
    return () => {
      socket.emit('leave-patient-room', tokenNumber);
    };
  }, [socket, tokenNumber]);
}
