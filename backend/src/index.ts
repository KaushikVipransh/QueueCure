import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

import { patientsRouter } from './routes/patients';
import { queueRouter } from './routes/queue';
import { analyticsRouter } from './routes/analytics';
import { initSocketManager } from './socket/socketManager';
import { errorHandler } from './middleware/errorHandler';

// ─── App Setup ────────────────────────────────────────────────────────────────

const app = express();
const httpServer = createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';
const PORT = process.env.PORT ?? 3001;

// ─── Socket.IO ────────────────────────────────────────────────────────────────

const io = new Server(httpServer, {
  cors: {
    origin: [FRONTEND_URL, 'http://localhost:3000', 'http://localhost:3001'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
});

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(
  cors({
    origin: [FRONTEND_URL, 'http://localhost:3000'],
    credentials: true,
  }),
);
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));

// Make io accessible to route handlers via req.app.get('io')
app.set('io', io);

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'Queue Cure API' });
});

app.use('/api/v1/patients', patientsRouter);
app.use('/api/v1/queue', queueRouter);
app.use('/api/v1/analytics', analyticsRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Error Handler ────────────────────────────────────────────────────────────

app.use(errorHandler);

// ─── Socket Manager ───────────────────────────────────────────────────────────

initSocketManager(io);

// ─── Start ────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`\n🏥 Queue Cure Backend`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🚀 API:     http://localhost:${PORT}`);
  console.log(`❤️  Health:  http://localhost:${PORT}/health`);
  console.log(`🔌 Socket:  ws://localhost:${PORT}`);
  console.log(`📊 Studio:  npx prisma studio`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});

export { io };
