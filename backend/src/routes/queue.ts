import { Router, Request, Response, NextFunction } from 'express';
import { Server } from 'socket.io';
import { queueService } from '../services/queueService';
import { broadcastQueueUpdate } from '../socket/socketManager';

export const queueRouter = Router();

// GET /api/v1/queue/status — Full queue state snapshot
queueRouter.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const state = await queueService.getQueueState();
    res.json(state);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/queue/call-next — Call the next waiting patient
queueRouter.post('/call-next', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const patient = await queueService.callNext();
    const io: Server = req.app.get('io');

    const state = await queueService.getQueueState();

    // Emit dedicated call-next event (board listens for animation + sound)
    io.emit('call-next', {
      patient: {
        id: patient.id,
        tokenNumber: patient.tokenNumber,
        patientName: patient.patientName,
        appointmentType: patient.appointmentType,
      },
      queueState: state,
    });

    // Also broadcast full queue update to sync all clients
    io.emit('queue-updated', state);

    res.json({ success: true, patient, queueState: state });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/queue/complete — Mark current consultation as complete
queueRouter.post('/complete', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const patient = await queueService.completeConsultation();
    const io: Server = req.app.get('io');

    const state = await queueService.getQueueState();

    // Notify patient's tracking room
    io.to(`patient-${patient.tokenNumber}`).emit('consultation-completed', {
      tokenNumber: patient.tokenNumber,
      patientId: patient.id,
    });

    // Emit consultation-completed + full state update
    io.emit('consultation-completed', {
      patient: {
        id: patient.id,
        tokenNumber: patient.tokenNumber,
        patientName: patient.patientName,
      },
      queueState: state,
    });

    io.emit('queue-updated', state);

    res.json({ success: true, patient, queueState: state });
  } catch (err) {
    next(err);
  }
});
