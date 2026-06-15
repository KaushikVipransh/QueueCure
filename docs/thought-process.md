# Thought Process — Queue Cure Architecture

## 1. Real-Time Synchronization Architecture

### Why Socket.IO over Polling

Traditional clinic queue systems use polling (refresh every N seconds) which creates:
- Stale data between polls
- Wasted bandwidth on unchanged state
- Poor user experience with "flickering" updates

Socket.IO maintains a persistent WebSocket connection (falling back to long-polling) that allows the server to push updates the instant they happen. With a queue system, the critical moments — token changes, new patient added, consultation complete — happen at irregular intervals. Push > Pull.

### Why REST + Socket hybrid (not socket-only)

All *mutations* happen via REST API, not through socket emissions from clients. Socket events only carry data downward (server → clients). This architecture choice has several benefits:

1. **Security**: Clients cannot directly trigger state changes by emitting fake events
2. **HTTP semantics**: REST gives us proper status codes, request validation, idempotency
3. **No double-state**: The server is the single source of truth. Clients receive computed state

### Full State Broadcast (not partial patches)

After every mutation, the server computes the complete `QueueState` and broadcasts it. This is simpler than sending patches/diffs and avoids the complexity of client-side state reconciliation. With a clinic queue (max ~30 patients), the payload is small (<5KB) and this is the right trade-off.

---

## 2. HybridEstimator — 7-Layer Wait-Time Prediction Engine

The estimator is a **single pure function** (`HybridEstimator.compute()`) composed of independent, removable layers. Missing inputs degrade gracefully — they never crash the system.

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

### The Schema Was Designed First

Before building the estimator, the `ConsultationRecord` schema was designed. This is intentional: the ML upgrade path requires **zero data migration** because every field the future model needs is already being written.

### Layer 1: Seed Time (receptionist input)

Before any data is collected, the system falls back to clinically reasonable defaults:

| Type | Baseline | Classification Weight |
|---|---|---|
| Follow-up | 8 min | 0.6× |
| General | 15 min | 1.0× |
| New Patient | 25 min | 1.3× |
| Specialist | 35 min | 1.8× |

Handles Day 0 with zero data. Independently removable.

### Layer 2: Rolling Average with Cold-Start Blend

```
blended = (seedWeight × seed) + ((1 - seedWeight) × rollingAvg)
seedWeight = max(0, 1 - samples / WINDOW)  // WINDOW = 10
```

- **Starts 100% seed**, transitions to 100% real data by 10 samples per type
- If fewer than 3 same-type samples exist, falls back to broader pool (cold-start)
- Per-type isolation: follow-up averages don't pollute specialist estimates

### Layer 3: Percentile Range (p50 / p75 / p90)

Rather than a single point estimate, the engine computes an **honest range** over the last 20 samples:

```
scale.low  = p50 / p75   (optimistic bound)
scale.high = p90 / p75   (worst-case bound)
```

Falls back to a symmetric `[0.8×, 1.4×]` range when fewer than 5 samples exist.

### Layer 4: Patient Classification Weights

Each patient ahead in the queue contributes a **per-patient estimate** scaled by their individual visit type:

```
queueTime = Σ (rollingAvg(type) × weight(type) + TRANSITION_GAP)
```

This is the key upgrade over uniform multiplication. A queue of [followup, followup, specialist] is estimated very differently from [specialist, specialist, specialist].

### Layer 5: Elapsed Correction for Current Patient

Rather than using the full predicted duration for the patient currently being seen:

```
remaining = max(0, expected - elapsed_minutes)
```

This is critical. If the current consultation has 2 minutes left (not 15), every waiting patient's estimate is 13 minutes shorter. Recalculated on every `queue-updated` broadcast.

### Layer 6: Psychological Buffer

```
likely    = ceil(midEstimate × 1.08)
worstCase = ceil(highEstimate × 1.08)
```

A slight upward bias (1.08×) builds patient trust. Patients are more satisfied when they're called before the displayed estimate than when they wait longer than shown.

### Layer 7: Full Audit Log → ML Training Data

Every `compute()` call writes a row to `prediction_audit_logs` with:
- All input features: `visitType`, `tokensAhead`, `timeOfDay`, `dayOfWeek`, `dataPointsAvailable`, `rollingAvg`
- All outputs: `predictedOptimistic`, `predictedLikely`, `predictedWorstCase`, `confidence`
- `actualWait` nullable — backfilled when the patient is called (the training label)

This accumulates silently. At 2,000+ consultations across clinics, this is a real ML training dataset.

### ML Upgrade Path

You don't rewrite anything. You replace one method:

```typescript
// Today (hackathon)
const base = await estimator.getRollingAverage(visitType);

// 6 months later, after collecting data
const base = await mlModel.predict({ visitType, timeOfDay, dayOfWeek, queueDepth, ... });

// Everything downstream stays identical
```

### What Each Layer Contributes

```
Seed time (receptionist input)
  └── handles Day 0, zero data

  + Rolling average with cold-start blend
      └── adapts within a session, per visit type

    + Percentile range instead of point estimate
        └── honest about uncertainty, catches fat-tail cases

      + Patient classification weights
          └── per-patient accuracy, not uniform averaging

        + Elapsed correction for current patient
            └── real-time accuracy as session progresses

          + Psychological buffer
              └── patient trust, perceived reliability

            + Full audit log of features + predictions
                └── ML training data, free, accumulating silently
```

Each layer is independently removable. If classification data isn't collected, weights default to 1.0 and the rest still works.

### Confidence Signal

| Samples | Confidence | Display |
|---|---|---|
| 0–2 | `low` | ●○○ Seed estimate |
| 3–9 | `medium` | ●●○ Building accuracy |
| 10+ | `high` | ●●● High accuracy |

### Winsorization

Before storing any actual duration, the estimator caps outliers:

```
capped = min(actual, p50 × 3)
```

One 45-minute complex case doesn't poison the rolling average for the next 10 patients.

---

## 3. Data Storage Strategy

### You Never Throw Data Away

Every completed consultation writes a full `ConsultationRecord` with:
- **Identity**: `sessionId`, `tokenNumber`, `visitType`
- **Timing**: `registeredAt`, `calledAt`, `startTime`, `endTime` — all four timestamps
- **Derived**: `actualWaitMinutes`, `actualConsultMinutes`, `transitionGapMinutes` — computed and stored, never recomputed
- **Queue context**: `queueDepthAtCall`, `timeOfDay`, `dayOfWeek`
- **Prediction audit**: `predictedWaitAtRegistration`, `predictionError`

### You Never Compute on the Client

All estimation logic runs server-side in `HybridEstimator`. The client receives pre-computed `EstimationResult` objects:

```typescript
interface EstimationResult {
  optimistic: number;    // lower bound shown to patient
  likely: number;        // primary estimate (with psych buffer)
  worstCase: number;     // upper bound
  confidence: 'low' | 'medium' | 'high';
  basedOnSamples: number;
}
```

### The Estimator is One Pure Function

`HybridEstimator.compute()` is stateless across restarts. All history is read from DB. No in-memory state to lose on process restart.

---

## 4. Queue Management Logic

### Token Number Generation

Tokens start at 101. Inside a Prisma transaction:
```
next_token = MAX(existing tokens) + 1  (or 101 if table empty)
```

Unique constraint on `token_number` acts as a final safety net for any concurrent token conflicts.

### Call Next — Concurrency Safety

The most critical operation. If two receptionists click "Call Next" simultaneously:

1. Both send `POST /queue/call-next`
2. Both enter Prisma's interactive transaction
3. Transaction A acquires the lock first:
   - Checks `in_consultation` count = 0 ✓
   - Finds next waiting patient
   - Updates to `in_consultation`, writes `calledAt` + `queueDepthAtCall`
   - Commits
4. Transaction B runs:
   - Checks `in_consultation` count = 1 → **throws 409 error**
   - Rolls back

Only one transition happens. The second receptionist sees a clear error message.

### Status State Machine

```
[waiting] → [in_consultation] → [completed]
    ↓
[cancelled]  (only from waiting, not from in_consultation)
```

### Lifecycle Metadata Writes

| Event | What gets written |
|---|---|
| `addPatient` | `registeredAt`, `sessionId`, `predictedWaitAtRegistration` |
| `callNext` | `calledAt`, `actualWaitMinutes`, `queueDepthAtCall`, `timeOfDay`, `dayOfWeek` |
| `completeConsultation` | `endTime`, `actualDuration`, `transitionGapMinutes`, `predictionError` |

---

## 5. Edge Cases Handled

| Edge Case | Handling |
|---|---|
| Receptionist calls next while consultation active | 409 error: "Complete current consultation first" |
| Two simultaneous "Call Next" clicks | Transaction ensures only one wins |
| Empty queue when calling next | 404 error: "Queue is empty" |
| Patient not found by token | 404 + `notFound()` in Next.js |
| Socket disconnect/reconnect | Client auto-reconnects; server sends fresh state on connect |
| Backend restart | Clients reconnect; fresh state fetched from DB; estimator stateless |
| Zero historical data | Falls back to seed baselines (Layer 1) |
| Fewer than 3 per-type samples | Cold-start blend uses broader pool |
| Consultation running over predicted time | Remaining = 0 (floor at 0, never negative) |
| Outlier consultation (45+ min) | Winsorized at p50 × 3 before storage |
| `logPrediction` DB write fails | Fire-and-forget, wrapped in try/catch — never crashes estimation |

---

## 6. Scalability Considerations

### Current Architecture Limits

The current architecture is optimized for single-clinic use (1 doctor, 1 queue, ~50 patients/day):
- Single backend process
- In-memory Socket.IO (no pub/sub adapter)
- Supabase connection pooler handles concurrency

### Scaling Path

For multi-clinic or high-throughput scenarios:

1. **Horizontal scaling**: Add Redis pub/sub adapter for Socket.IO (`@socket.io/redis-adapter`). Multiple backend instances can broadcast events to all clients regardless of which server they're connected to.

2. **Multi-queue support**: Add `clinic_id` / `doctor_id` foreign keys to all tables. Socket.IO rooms become `clinic-{id}`. `sessionId` already prefixes with date — extend to `"{clinicId}_{date}"`.

3. **Read replicas**: Analytics queries (dashboard charts) can hit a Supabase read replica, freeing the primary for queue mutations.

4. **Prediction service isolation**: `HybridEstimator` can be extracted to a separate service. The `prediction_audit_logs` table provides a clean async event stream — compute offline and push results back.

5. **ML model integration**: Replace `getRollingAverage()` with a model API call. Zero changes required to schema, queue service, or frontend.

6. **Rate limiting**: Add `express-rate-limit` middleware to prevent abuse of the add-patient endpoint.
