# Queue Cure '26 — Real-Time Smart Clinic Queue Management System

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-green?logo=socket.io)](https://socket.io/)
[![Prisma](https://img.shields.io/badge/Prisma-5.22-2D3748?logo=prisma)](https://www.prisma.io/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E?logo=supabase)](https://supabase.com/)

> Eliminate paper tokens and waiting uncertainty with real-time queue management, adaptive wait-time predictions, and live patient tracking.

---

## 🎯 Features

| Feature | Description |
|---|---|
| **Real-Time Sync** | All changes instantly pushed via Socket.IO — zero page refresh |
| **Smart Predictions** | 6-step adaptive engine learns from every consultation |
| **Live Countdown** | Per-patient countdown that syncs with queue updates |
| **Queue Board** | Full-screen TV display with animated token changes + chime |
| **Patient Tracking** | Shareable tracking link per token |
| **Concurrency Safe** | Prisma transactions prevent race conditions |
| **Analytics** | Hourly charts, type distribution, duration trends |

---

## 🏗️ Architecture

```
queuehack/
├── frontend/         # Next.js 15 App Router
│   ├── app/
│   │   ├── dashboard/    # Receptionist Dashboard
│   │   ├── board/        # Public Queue Display
│   │   └── track/[token] # Patient Tracking
│   ├── components/
│   ├── contexts/         # Socket.IO context
│   ├── hooks/            # useCountdown, etc.
│   └── lib/              # API client, types
│
├── backend/          # Express.js + Socket.IO
│   ├── src/
│   │   ├── routes/       # REST API endpoints
│   │   ├── services/     # Queue, Prediction, Analytics
│   │   └── socket/       # Socket.IO event manager
│   └── prisma/           # Schema + seed
│
└── docs/             # Architecture & thought process
```

---

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier works)

### 1. Clone & Install

```bash
git clone <repo-url>
cd queuehack
npm install          # installs root concurrently
npm run setup        # installs backend + frontend dependencies
```

### 2. Configure Environment

**Backend** — edit `backend/.env`:
```env
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Replace [YOUR-PASSWORD] with your Supabase database password
DATABASE_URL="postgresql://postgres.mqxwabelzsjnalclddwv:[YOUR-PASSWORD]@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://postgres.mqxwabelzsjnalclddwv:[YOUR-PASSWORD]@aws-1-ap-northeast-2.pooler.supabase.com:5432/postgres"
```

**Frontend** — `frontend/.env.local` is pre-configured for local dev:
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_SOCKET_URL=http://localhost:3001
```

### 3. Setup Database

```bash
npm run db:push      # push schema to Supabase
npm run db:seed      # seed initial data (queue settings + prediction baselines)
```

### 4. Start Development

```bash
npm run dev
```

This starts both servers concurrently:
- **Backend**: `http://localhost:3001`
- **Frontend**: `http://localhost:3000`

---

## 🌐 Interface Routes

| Route | Description |
|---|---|
| `/dashboard` | Receptionist dashboard |
| `/board` | Full-screen public queue display (for TV/monitor) |
| `/track/:tokenNumber` | Patient tracking page (shareable link) |

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `POST` | `/api/v1/patients` | Add patient to queue |
| `GET` | `/api/v1/patients` | List all patients |
| `GET` | `/api/v1/patients/token/:token` | Get patient by token |
| `DELETE` | `/api/v1/patients/:id` | Remove patient |
| `GET` | `/api/v1/queue/status` | Full queue state snapshot |
| `POST` | `/api/v1/queue/call-next` | Call next patient |
| `POST` | `/api/v1/queue/complete` | Complete current consultation |
| `GET` | `/api/v1/analytics` | Analytics data |
| `GET` | `/api/v1/analytics/prediction-metrics` | ML model metrics |

---

## 🔌 Socket.IO Events

| Event | Direction | Description |
|---|---|---|
| `queue-updated` | Server → All | Full queue state after any change |
| `patient-added` | Server → All | New patient added |
| `call-next` | Server → All | Next patient called |
| `consultation-completed` | Server → All | Consultation marked done |
| `join-patient-room` | Client → Server | Join personal tracking room |

---

## 🧠 Prediction Engine

The adaptive 6-step engine:

1. **Baselines**: Follow-up=8m, General=15m, New Patient=25m, Specialist=35m
2. **Track actuals**: Start/end times stored in `consultations` table
3. **Rolling averages**: Per-type historical mean + EMA (α=0.3) recent average
4. **Weighted blend**: `0.7 × recent_avg + 0.3 × historical_avg`
5. **Context modifiers**: Peak hours +10%, Long queue +5%, Fast doctor -10%
6. **Current remaining**: `max(0, predicted - elapsed)` for live consultation

---

## 🗄️ Database Schema

```
patients         → consultations (1:1)
queue_settings   → singleton row (clinic config)
prediction_metrics → one row per appointment type
```

See [docs/database-schema.md](./docs/database-schema.md) for full ERD.

---

## 🚢 Deployment

### Backend → Railway

1. Push code to GitHub
2. Create Railway project → connect repo → select `backend/` as root
3. Add environment variables (DATABASE_URL, DIRECT_URL, FRONTEND_URL, NODE_ENV=production)
4. Railway auto-detects Node.js → deploys

### Frontend → Vercel

1. Import repo on Vercel → set root to `frontend/`
2. Add environment variables:
   - `NEXT_PUBLIC_API_URL` = your Railway backend URL
   - `NEXT_PUBLIC_SOCKET_URL` = your Railway backend URL
3. Deploy

---

## 📚 Documentation

- [Thought Process](./docs/thought-process.md) — Architecture decisions explained
- [Socket Event Flow](./docs/socket-event-flow.md) — Sequence diagrams
- [Database Schema](./docs/database-schema.md) — ERD and data model

---

## 🛠️ Development Commands

```bash
# Root
npm run dev           # run both servers
npm run setup         # install all dependencies

# Backend only
cd backend
npm run dev           # start with hot reload
npm run db:push       # sync schema to DB
npm run db:seed       # seed initial data
npm run db:studio     # open Prisma Studio
npm run build         # compile TypeScript

# Frontend only
cd frontend
npm run dev           # start Next.js dev server
npm run build         # build for production
npm run type-check    # TypeScript check
```
