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

## 2. Smart Wait-Time Prediction Engine

The engine has six stages that compose to produce an accurate, adaptive estimate:

### Stage 1: Baselines

Before any data is collected, the system falls back to clinically reasonable defaults:
- Follow-up: 8 minutes
- General: 15 minutes
- New Patient: 25 minutes
- Specialist: 35 minutes

These are configurable in `predictionService.ts`.

### Stage 2: Actual Duration Tracking

Every consultation records:
- `start_time`: set when "Call Next" is clicked
- `end_time`: set when "Mark Complete" is clicked
- `actual_duration`: computed as `(end - start) / 60000` minutes

This creates the training data for the model.

### Stage 3: Per-Type Averages

The `prediction_metrics` table stores per-appointment-type statistics separately. A follow-up average is not polluted by specialist consultation durations. This type isolation significantly improves prediction accuracy.

### Stage 4: Weighted Blend (70/30)

```
predicted = 0.7 × recent_average + 0.3 × historical_average
```

- **Recent average** uses Exponential Moving Average (EMA, α=0.3): `EMA = 0.3 × actual + 0.7 × prev_EMA`
  - Responds quickly to behavioral changes (doctor running fast today)
  - Doesn't overreact to single outliers
- **Historical average** uses cumulative mean over all-time samples
  - Provides stability / prevents wild swings from a single unusual consultation

The 70/30 split means: trust today's pattern more, but anchor to historical baseline.

### Stage 5: Context Modifiers

Applied multiplicatively after the weighted blend:

| Condition | Modifier | Rationale |
|---|---|---|
| Peak hours (9-11 AM, 4-6 PM) | +10% | More complex cases tend to arrive during peak hours |
| Long queue (>8 patients) | +5% | Doctor cognitive load increases, slight slowdown |
| Doctor running fast (ratio < 0.9) | -10% | Actual data shows consistently faster pace |
| Doctor running slow (ratio > 1.15) | +10% | Actual data shows consistently slower pace |

The doctor speed factor is computed from the last 5 completed consultations: `avg(actual / predicted)`. If the ratio is consistently below 0.9, the doctor is outpacing predictions.

### Stage 6: Current Consultation Remaining

Rather than using the full predicted duration for the current patient:

```
remaining = max(0, predicted_duration - elapsed_minutes)
```

This is critical. If the current consultation has 2 minutes left (not 15), every waiting patient's wait time is 13 minutes shorter. Recalculated every time the queue changes.

### Final Formula

```
wait(patient at position i) =
  remaining_current_consultation +
  Σ predicted_duration(patients at positions 0 to i-1)
```

Recalculated on every `queue-updated` broadcast.

---

## 3. Historical Learning Mechanism

The learning is continuous and online — no batch retraining needed:

```
After each completed consultation:
  1. Calculate actual_duration
  2. Update prediction_metrics for that appointment type:
     - historical_average = (old_avg × old_count + actual) / new_count
     - recent_average = 0.3 × actual + 0.7 × old_recent_avg
     - sample_count += 1
```

Convergence: After 3 samples, the system switches from baseline to learned values. After ~10 samples, the prediction typically converges within ±15% of actual durations.

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
   - Updates to `in_consultation`
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

The `cancelled` state is used when a patient is removed from the queue before being called.

---

## 5. Edge Cases Handled

| Edge Case | Handling |
|---|---|
| Receptionist calls next while consultation active | 409 error: "Complete current consultation first" |
| Two simultaneous "Call Next" clicks | Transaction ensures only one wins |
| Empty queue when calling next | 404 error: "Queue is empty" |
| Patient not found by token | 404 + `notFound()` in Next.js |
| Socket disconnect/reconnect | Client auto-reconnects; server sends fresh state on connect |
| Backend restart | Clients reconnect; fresh state fetched from DB |
| Zero historical data | Falls back to baseline predictions |
| Consultation running over predicted time | Remaining = 0 (floor at 0, never negative) |
| Very long queue (>30) | +5% modifier applied automatically |

---

## 6. Scalability Considerations

### Current Architecture Limits

The current architecture is optimized for single-clinic use (1 doctor, 1 queue, ~50 patients/day):
- Single backend process
- In-memory Socket.IO (no pub/sub adapter)
- Supabase connection pooler handles concurrency

### Scaling Path

For multi-clinic or high-throughput scenarios:

1. **Horizontal scaling**: Add Redis pub/sub adapter for Socket.IO (`@socket.io/redis-adapter`). This allows multiple backend instances to broadcast events to all clients regardless of which server they're connected to.

2. **Multi-queue support**: Add `clinic_id` foreign key to all tables. Socket.IO rooms become `clinic-{id}` — clients only receive updates for their clinic.

3. **Read replicas**: Analytics queries (dashboard charts) can hit a Supabase read replica, freeing the primary for queue mutations.

4. **Prediction service isolation**: The prediction engine can be extracted to a separate microservice with its own compute resources. Queue events trigger async prediction updates via a message queue (e.g., Redis Streams).

5. **Rate limiting**: Add `express-rate-limit` middleware to prevent abuse of the add-patient endpoint.

---

## 7. Database Indexing Strategy

Critical indexes for production:

```sql
-- Fast queue status query (most common operation)
CREATE INDEX idx_patients_status ON patients(status);
CREATE INDEX idx_patients_status_token ON patients(status, token_number ASC);

-- Fast analytics date filtering
CREATE INDEX idx_patients_created_at ON patients(created_at);
CREATE INDEX idx_consultations_end_time ON consultations(end_time);

-- Prediction metrics lookup (small table, already indexed by appointmentType unique)
```

Prisma automatically creates indexes for `@unique` fields. The composite index on `(status, token_number)` is the most important one to add manually for production.
