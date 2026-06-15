# Socket.IO Event Flow — Queue Cure

## Overview

All queue state mutations happen through the REST API. The backend then emits Socket.IO events to synchronize ALL connected clients simultaneously. Clients never directly mutate queue state via sockets — they only receive updates.

---

## Event Flow Diagrams

### Patient Added

```
Receptionist        Backend             All Clients
    │                  │                    │
    │─POST /patients──►│                    │
    │                  │─(DB: create)──────►│
    │                  │─emit: patient-added─►│
    │                  │─emit: queue-updated──►│
    │◄─201 Created─────│                    │
```

### Call Next Patient

```
Receptionist        Backend             Board      All Clients
    │                  │                  │             │
    │─POST /call-next──►│                  │             │
    │                  │─(TX: update)──────│             │
    │                  │─emit: call-next───►│ ←animation + 🔔
    │                  │─emit: queue-updated─────────────►│
    │◄─200 OK──────────│                  │             │
```

### Consultation Complete

```
Receptionist        Backend         Prediction      All Clients
    │                  │              Engine             │
    │─POST /complete───►│                │               │
    │                  │─(TX: update)──►│               │
    │                  │─updateMetrics──►│               │
    │                  │◄─updated EMA───│               │
    │                  │─emit: consultation-completed──────►│
    │                  │─emit: queue-updated───────────────►│
    │◄─200 OK──────────│                │               │
```

### Patient Joins Tracking Room

```
Patient Browser     Backend
    │                  │
    │─connect socket──►│
    │◄─queue-updated───│ (initial state sent on connect)
    │                  │
    │─join-patient-room(101)──►│
    │                  │─socket.join("patient-101")
```

---

## Payload Shapes

### `queue-updated`

```typescript
interface QueueState {
  currentPatient: PatientWithPrediction | null;
  waitingPatients: PatientWithPrediction[];
  stats: {
    currentToken: number | null;
    totalWaiting: number;
    avgConsultationDuration: number;
    patientsServedToday: number;
    queueEfficiency: number;
    currentConsultationElapsed: number;  // minutes
    currentConsultationPredicted: number; // minutes
  };
  clinicName: string;
  updatedAt: string; // ISO timestamp
}
```

### `patient-added`

```typescript
{
  patient: Patient;
  queueState: QueueState;
}
```

### `call-next`

```typescript
{
  patient: {
    id: string;
    tokenNumber: number;
    patientName: string;
    appointmentType: string;
  };
  queueState: QueueState;
}
```

### `consultation-completed`

```typescript
{
  patient: {
    id: string;
    tokenNumber: number;
    patientName: string;
  };
  queueState: QueueState;
}
```

---

## Connection Lifecycle

```
Client Connect
    │
    ▼
Server sends queue-updated (current state snapshot)
    │
    ▼
Client renders real-time UI
    │
    ├──(if patient tracking page)──► emit join-patient-room(token)
    │
    ▼
Receive queue-updated on every mutation
    │
    ▼
Client Disconnect → automatic reconnection with exponential backoff
```

---

## Reconnection Strategy

- Client: `reconnectionAttempts: Infinity`
- Client: `reconnectionDelay: 1000ms`, `reconnectionDelayMax: 5000ms`
- Server: `pingTimeout: 60000ms`, `pingInterval: 25000ms`
- On reconnect: server sends fresh `queue-updated` immediately
