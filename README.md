# QueueCure — Real-Time Smart Clinic Queue Management

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-404040?logo=express&logoColor=white)](https://expressjs.com/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-010101?logo=socket.io&logoColor=white)](https://socket.io/)
[![Prisma](https://img.shields.io/badge/Prisma-5.22-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com/)

> Replace paper tokens and waiting uncertainty with real-time queue management, a 7-layer adaptive wait-time estimator, and live per-patient tracking — all designed to collect ML training data from day one.

---

## What It Does

Clinics running on paper tokens have two unsolved problems:

1. **Patients don't know when they'll be seen.** "Your turn is coming" is not an answer.
2. **Receptionists have no data.** They can't improve what they don't measure.

QueueCure solves both. The receptionist dashboard manages the queue in real time. Every patient gets a shareable tracking link showing their estimated wait as a **range** (`12–17 min`) — not a false-precision single number. And every consultation silently writes a training record for a future ML model.

---

## Features

| Feature | Description |
|---|---|
| **Real-Time Sync** | Every queue change is instantly pushed to all connected clients via Socket.IO — zero polling, zero page refresh |
| **HybridEstimator** | 7-layer adaptive engine outputs a wait range with confidence level — improves every consultation |
| **Wait Range Display** | Patients see `optimistic – likely min` + worst case, not a single misleading number |
| **Confidence Signal** | `●●●` High / `●●○` Building / `●○○` Seed — patients know how much to trust the estimate |
| **Live Countdown** | Per-patient real-time countdown synced to queue state via WebSocket |
| **Queue Board** | Full-screen TV display with animated token changes and chime |
| **Patient Tracking** | Shareable `/track/:token` link — patients track their own position from their phone |
| **SMS Notifications** | Automatic Twilio SMS delivery with tracking link upon registration (graceful fallback if Twilio is unconfigured) |
| **ML Audit Log** | Every prediction logged with full feature context. `actualWait` backfilled on completion — silent training data accumulation |
| **Analytics Dashboard** | Hourly charts, type distribution, prediction accuracy, duration trends |
| **Concurrency Safe** | Prisma transactions prevent race conditions on simultaneous "Call Next" clicks |

---

## The Prediction Engine

The estimator is a **single pure function** (`HybridEstimator.compute()`) built in decoupled layers. Missing inputs degrade gracefully — they never crash the system.

```
Data Layer          Estimation Layer         Presentation Layer
──────────          ────────────────         ──────────────────
Every event    →    Hybrid estimator    →    Range shown to patient
stored raw          (rolling + %ile
with metadata       + classification)   →    Confidence shown
                         ↓
                    Raw logs ready
                    for ML later
```

### 7 Layers — Each Independently Removable

| # | Layer | What it does |
|---|---|---|
| 1 | **Seed time** | Day-0 fallback. No data required. |
| 2 | **Rolling avg + cold-start blend** | Adapts per visit type within a session |
| 3 | **Percentile range (p50/p75/p90)** | Honest uncertainty bounds, not false precision |
| 4 | **Visit-type classification weights** | Per-patient accuracy — not uniform averaging |
| 5 | **Elapsed correction** | Real-time accuracy as current consultation progresses |
| 6 | **Psychological buffer (1.08×)** | Patient trust via underpromise → overdeliver |
| 7 | **Full audit log** | ML training signal, accumulating silently on every call |

### Visit-Type Baselines & Weights

| Type | Baseline | Weight | Meaning |
|---|---|---|---|
| Follow-up | 8 min | 0.6× | Typically short — mostly review |
| General | 15 min | 1.0× | Reference unit |
| New Patient | 25 min | 1.3× | History + examination |
| Specialist | 35 min | 1.8× | Complex, multi-system |

### ML Upgrade Path — Zero Migration

The schema was designed before the estimator. Every field the future model needs is already being written:

```typescript
// Today
const base = await estimator.getRollingAverage(visitType);

// 6 months later, after collecting data
const base = await mlModel.predict({ visitType, timeOfDay, dayOfWeek, queueDepth, ... });

// Everything downstream stays identical
```

`logPrediction()` has been silently building the training dataset the whole time. At 2,000+ consultations across clinics, that's a real supervised learning dataset.

---

## Architecture

```
queuehack/
├── frontend/              # Next.js 15 App Router
│   ├── app/
│   │   ├── dashboard/     # Receptionist dashboard
│   │   ├── board/         # Public queue display (TV/monitor)
│   │   └── track/[token]/ # Patient self-tracking
│   ├── components/
│   │   ├── dashboard/     # AddPatientForm, QueueList, CurrentPatient, ...
│   │   └── tracking/      # TrackingClient (range + confidence display)
│   ├── contexts/          # Socket.IO context provider
│   ├── hooks/             # useCountdown
│   └── lib/               # API client, shared types
│
├── backend/               # Express.js + Socket.IO
│   ├── src/
│   │   ├── routes/        # patients.ts, queue.ts, analytics.ts
│   │   ├── services/
│   │   │   ├── hybridEstimator.ts   ← 7-layer estimation engine
│   │   │   ├── predictionService.ts ← thin orchestration layer
│   │   │   ├── queueService.ts      ← queue state + ConsultationRecord writes
│   │   │   └── analyticsService.ts
│   │   ├── socket/        # Socket.IO event manager
│   │   └── types/         # Shared interfaces
│   └── prisma/
│       └── schema.prisma  # 5 models incl. PredictionAuditLog
│
└── docs/
    ├── thought-process.md    # Architecture decisions + estimator design
    ├── database-schema.md    # Full ERD + ConsultationRecord fields
    └── socket-event-flow.md  # Sequence diagrams + payload shapes
```

### Data Flow

```
Receptionist                 Backend                          Clients
     │                          │                                │
     │── POST /patients ────────►│ addPatient()                  │
     │                          │  ├─ getPredictedDuration()     │
     │                          │  ├─ write registeredAt         │
     │                          │  └─ write predictedWaitAtReg   │
     │                          │── (async) send Twilio SMS      │
     │                          │── emit: patient-added ────────►│
     │                          │── emit: queue-updated ─────────►│
     │◄── 201 Created ──────────│                                │
     │                          │                                │
     │── POST /call-next ───────►│ callNext()                    │
     │                          │  ├─ write calledAt             │
     │                          │  ├─ write queueDepthAtCall     │
     │                          │  └─ write timeOfDay/dayOfWeek  │
     │                          │── emit: call-next ─────────────►│
     │                          │── emit: queue-updated ─────────►│
     │◄── 200 OK ───────────────│                                │
     │                          │                                │
     │── POST /complete ────────►│ completeConsultation()        │
     │                          │  ├─ write predictionError      │
     │                          │  ├─ write transitionGap        │
     │                          │  └─ updateMetrics()            │
     │                          │── emit: consultation-completed ►│
     │                          │── emit: queue-updated ─────────►│
     │◄── 200 OK ───────────────│                                │
```

---

## Database Schema

Five models — designed before the estimator so the ML upgrade path requires zero migration:

```
patients              → consultations (1:1)
                           ├── core timing (start/end/actual/predicted)
                           └── ConsultationRecord fields (12 ML-ready columns)
queue_settings        → singleton (clinic config)
prediction_metrics    → 4 rows, one per appointment type (analytics)
prediction_audit_logs → append-only ML training log (features + label)
```

See [docs/database-schema.md](./docs/database-schema.md) for the full ERD and field descriptions.

---

## Quick Start

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier works)

### 1. Clone & Install

```bash
git clone https://github.com/KaushikVipransh/QueueCure.git
cd QueueCure
npm install          # installs root workspace + concurrently
npm run setup        # installs backend + frontend dependencies
```

### 2. Configure Environment

**Backend** — copy `backend/.env.example` to `backend/.env` and fill in:

```env
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Supabase connection strings
DATABASE_URL="postgresql://postgres.[project-ref]:[password]@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.[project-ref]:[password]@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres"

# Twilio SMS setup (Optional)
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890
```

**Frontend** — `frontend/.env.local` is pre-configured for local dev:

```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

### 3. Setup Database

```bash
npm run db:push      # push schema to Supabase (creates all 5 tables)
npm run db:seed      # seed queue settings + prediction baselines
```

### 4. Run

```bash
npm run dev
```

Starts both servers concurrently:

| Server | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:3001 |
| Health check | http://localhost:3001/health |

---

## Interface Routes

| Route | Who uses it | Description |
|---|---|---|
| `/dashboard` | Receptionist | Add patients, call next, complete consultation, analytics |
| `/board` | Waiting room TV | Full-screen animated queue display with audio chime |
| `/track/:token` | Patient (phone) | Real-time wait range, position, confidence indicator |

---

## API Reference

### Queue

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/queue/status` | Full queue state snapshot |
| `POST` | `/api/v1/queue/call-next` | Call next waiting patient |
| `POST` | `/api/v1/queue/complete` | Complete current consultation |
| `GET` | `/api/v1/queue/estimation/:patientId` | Full EstimationResult for a patient |

### Patients

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/patients` | Add patient to queue |
| `GET` | `/api/v1/patients` | List all patients (optional `?status=` filter) |
| `GET` | `/api/v1/patients/token/:token` | Get patient by token number |
| `DELETE` | `/api/v1/patients/:id` | Remove patient from queue |

### Analytics

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/analytics` | Today's analytics (hourly, type distribution, trends) |
| `GET` | `/api/v1/analytics/prediction-metrics` | Per-type EMA model state |

---

## Socket.IO Events

All mutations happen through REST. Sockets only carry data **server → clients**.

| Event | Direction | Description |
|---|---|---|
| `queue-updated` | Server → All | Full `QueueState` after any change (includes `estimationResult` per patient) |
| `patient-added` | Server → All | New patient registered |
| `call-next` | Server → All | Token called — triggers board animation + chime |
| `consultation-completed` | Server → All | Consultation marked done |
| `join-patient-room` | Client → Server | Subscribe to personal tracking room |

---

## Deployment

### Backend → Railway

1. Connect repo on Railway → set root directory to `backend/`
2. Add environment variables: `DATABASE_URL`, `DIRECT_URL`, `FRONTEND_URL`, `NODE_ENV=production`
3. Railway auto-detects Node.js and deploys

### Frontend → Vercel

1. Import repo on Vercel → set root directory to `frontend/`
2. Add environment variables:
   - `NEXT_PUBLIC_API_URL` = your Railway backend URL
   - `NEXT_PUBLIC_SOCKET_URL` = your Railway backend URL
3. Deploy

---

## Development Commands

```bash
# Root (run both servers)
npm run dev
npm run setup         # install all dependencies

# Backend
cd backend
npm run dev           # start with nodemon hot reload
npm run build         # compile TypeScript
npm run db:push       # sync schema to database
npm run db:seed       # seed initial data
npm run db:studio     # open Prisma Studio GUI

# Frontend
cd frontend
npm run dev           # start Next.js dev server
npm run build         # production build
npm run type-check    # TypeScript check without emit
```

---

## Documentation

| Doc | Contents |
|---|---|
| [Thought Process](./docs/thought-process.md) | Architecture decisions, estimator layer design, ML rationale |
| [Database Schema](./docs/database-schema.md) | Full ERD, ConsultationRecord fields, ML training queries |
| [Socket Event Flow](./docs/socket-event-flow.md) | Sequence diagrams, payload shapes, reconnection strategy |

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | Next.js 15 (App Router) | Server components + fast page loads |
| Styling | Tailwind CSS + custom design system | Dark glassmorphism aesthetic |
| Real-time | Socket.IO | Push over pull — instant state sync |
| Backend | Express.js + TypeScript | Lightweight, typed, well-understood |
| ORM | Prisma 5 | Type-safe queries + transactional safety |
| Database | PostgreSQL via Supabase | Managed, connection-pooled, free tier |
| Prediction | HybridEstimator (custom) | 7-layer in-process engine, ML-ready |
