import { Server, Socket } from 'socket.io';
import { queueService } from '../services/queueService';

export function initSocketManager(io: Server): void {
  io.on('connection', (socket: Socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Send current queue state to newly connected client
    queueService.getQueueState().then((state) => {
      socket.emit('queue-updated', state);
    });

    // Client can join a patient-specific room for targeted updates
    socket.on('join-patient-room', (tokenNumber: number) => {
      const room = `patient-${tokenNumber}`;
      socket.join(room);
      console.log(`[Socket] ${socket.id} joined room: ${room}`);
    });

    socket.on('leave-patient-room', (tokenNumber: number) => {
      socket.leave(`patient-${tokenNumber}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket] Client disconnected: ${socket.id}`);
    });

    socket.on('error', (err) => {
      console.error(`[Socket] Error from ${socket.id}:`, err);
    });
  });

  console.log('[Socket] Socket manager initialized');
}

/**
 * Broadcast the full queue state to every connected client.
 * Called after every queue mutation.
 */
export async function broadcastQueueUpdate(io: Server): Promise<void> {
  try {
    const state = await queueService.getQueueState();
    io.emit('queue-updated', state);
  } catch (err) {
    console.error('[Socket] Failed to broadcast queue update:', err);
  }
}
