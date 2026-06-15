import { Router, Request, Response, NextFunction } from 'express';
import { Server } from 'socket.io';
import { AppointmentType } from '@prisma/client';
import { queueService } from '../services/queueService';
import { predictionService } from '../services/predictionService';
import { broadcastQueueUpdate } from '../socket/socketManager';
import { prisma } from '../lib/prisma';

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
// GET /api/v1/queue/estimation/:patientId — Full estimation result for a waiting patient
queueRouter.get('/estimation/:patientId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { patientId } = req.params as { patientId: string };

    // Find the patient and all waiting patients (to build queue context)
    const [patient, waitingPatients, currentPatient] = await Promise.all([
      prisma.patient.findUnique({ where: { id: patientId } }),
      prisma.patient.findMany({
        where:   { status: 'waiting' },
        orderBy: { tokenNumber: 'asc' },
      }),
      prisma.patient.findFirst({
        where:   { status: 'in_consultation' },
        include: { consultation: true },
      }),
    ]);

    if (!patient) {
      res.status(404).json({ error: 'Patient not found.' });
      return;
    }

    const patientIndex  = waitingPatients.findIndex((p) => p.id === patientId);
    const patientsAhead = patientIndex > 0
      ? waitingPatients.slice(0, patientIndex).map((p) => p.appointmentType as AppointmentType)
      : [];

    const estimationResult = await predictionService.getEstimationResult(
      patient.appointmentType as AppointmentType,
      Math.max(0, patientIndex),
      patientsAhead,
      currentPatient?.appointmentType as AppointmentType ?? null,
      currentPatient?.consultation?.startTime
        ? new Date(currentPatient.consultation.startTime)
        : null,
    );

    res.json({ patientId, estimationResult });
  } catch (err) {
    next(err);
  }
});
