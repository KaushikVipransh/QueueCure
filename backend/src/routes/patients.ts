import { Router, Request, Response, NextFunction } from 'express';
import { Server } from 'socket.io';
import { AppointmentType } from '@prisma/client';
import { queueService } from '../services/queueService';
import { broadcastQueueUpdate } from '../socket/socketManager';

export const patientsRouter = Router();

// POST /api/v1/patients — Add a new patient
patientsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { patientName, appointmentType } = req.body as {
      patientName: string;
      appointmentType: AppointmentType;
    };

    if (!patientName?.trim()) {
      res.status(400).json({ error: 'patientName is required.' });
      return;
    }

    const validTypes: AppointmentType[] = ['follow_up', 'general', 'new_patient', 'specialist'];
    if (!validTypes.includes(appointmentType)) {
      res.status(400).json({
        error: 'Invalid appointmentType.',
        validValues: validTypes,
      });
      return;
    }

    const patient = await queueService.addPatient(patientName, appointmentType);
    const io: Server = req.app.get('io');

    // Emit patient-added event + broadcast full state update
    const state = await queueService.getQueueState();
    io.emit('patient-added', { patient, queueState: state });
    io.emit('queue-updated', state);

    res.status(201).json({ success: true, patient });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/patients — Get all patients (optionally filtered by status)
patientsRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { status } = req.query as { status?: string };
    const patients = await queueService.getAllPatients(status as any);
    res.json({ patients });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/patients/token/:tokenNumber — Get patient by token
patientsRouter.get('/token/:tokenNumber', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const tokenNumber = parseInt(req.params['tokenNumber'] as string, 10);
    if (isNaN(tokenNumber)) {
      res.status(400).json({ error: 'Invalid token number.' });
      return;
    }

    const patient = await queueService.getPatientByToken(tokenNumber);
    if (!patient) {
      res.status(404).json({ error: 'Patient not found.' });
      return;
    }

    // Get their wait time
    const state = await queueService.getQueueState();
    const waitingPatient = state.waitingPatients.find((p) => p.tokenNumber === tokenNumber);
    const estimatedWaitMinutes = waitingPatient?.estimatedWaitMinutes ?? 0;

    res.json({ patient, estimatedWaitMinutes, queueState: state });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/patients/:id — Remove patient from queue
patientsRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params['id'] as string;
    const patient = await queueService.removePatient(id);
    const io: Server = req.app.get('io');
    await broadcastQueueUpdate(io);

    res.json({ success: true, patient });
  } catch (err) {
    next(err);
  }
});
