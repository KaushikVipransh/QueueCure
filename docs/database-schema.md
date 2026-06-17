# Database Schema — Queue Cure

## Entity Relationship Diagram

```
┌──────────────────────────────┐      ┌──────────────────────────────────────────────────┐
│          patients            │      │                  consultations                   │
├──────────────────────────────┤      ├──────────────────────────────────────────────────┤
│ id           UUID  PK        │◄─────│ id                    UUID  PK                  │
│ token_number INT   UNIQUE    │ 1:1  │ patient_id            UUID  FK,UNIQUE            │
│ patient_name VARCHAR         │      │ appointment_type      ENUM                       │
│ phone_number VARCHAR?        │      │ start_time            TIMESTAMPTZ?               │
│ appointment_type ENUM        │      │ end_time              TIMESTAMPTZ?               │
│ status       ENUM            │      │ actual_duration       FLOAT?                     │
│ sms_sent     BOOLEAN         │      │ predicted_duration    FLOAT                      │
│ created_at   TIMESTAMPTZ     │      │ created_at            TIMESTAMPTZ                │
│ updated_at   TIMESTAMPTZ     │      │                                                  │
└──────────────────────────────┘      │ ── ConsultationRecord fields (ML pipeline) ───── │
                                      │ session_id            VARCHAR?                   │
                                      │ registered_at         TIMESTAMPTZ?               │
                                      │ called_at             TIMESTAMPTZ?               │
                                      │ actual_wait_minutes   FLOAT?                     │
                                      │ transition_gap_minutes FLOAT?                    │
                                      │ queue_depth_at_call   INT?                       │
                                      │ time_of_day           VARCHAR?                   │
                                      │ day_of_week           INT?                       │
                                      │ predicted_wait_at_registration FLOAT?            │
                                      │ prediction_error      FLOAT?                     │
                                      │ chief_complaint       VARCHAR?                   │
                                      │ patient_age_group     VARCHAR?                   │
                                      └──────────────────────────────────────────────────┘

┌──────────────────────────────┐      ┌─────────────────────────────────┐
│       queue_settings         │      │       prediction_metrics         │
├──────────────────────────────┤      ├─────────────────────────────────┤
│ id           UUID  PK        │      │ id              UUID  PK        │
│ current_token INT?           │      │ appointment_type ENUM  UNIQUE   │
│ clinic_name  VARCHAR         │      │ historical_average FLOAT        │
│ created_at   TIMESTAMPTZ     │      │ recent_average   FLOAT          │
│ updated_at   TIMESTAMPTZ     │      │ sample_count     INT            │
└──────────────────────────────┘      │ updated_at       TIMESTAMPTZ    │
      (singleton, 1 row)              └─────────────────────────────────┘
                                            (4 rows, one per type)

┌──────────────────────────────────────────────────────────────┐
│                   prediction_audit_logs                      │
├──────────────────────────────────────────────────────────────┤
│ id                    UUID        PK                         │
│ timestamp             TIMESTAMPTZ default now()              │
│ visit_type            VARCHAR     (appointment type)         │
│ tokens_ahead          INT         (queue position)           │
│ time_of_day           INT         (hour 0-23)                │
│ day_of_week           INT         (0-6)                      │
│ data_points_available INT         (samples at predict time)  │
│ rolling_avg           FLOAT       (input feature)            │
│ predicted_optimistic  INT         (p50-scaled output)        │
│ predicted_likely      INT         (shown to patient)         │
│ predicted_worst_case  INT         (p90-scaled output)        │
│ confidence            VARCHAR     ("low"|"medium"|"high")    │
│ actual_wait           FLOAT?      (backfilled on completion) │
└──────────────────────────────────────────────────────────────┘
  (one row per prediction — accumulates silently as ML training data)
```

---

## Enum Types

### `AppointmentType`

| Value | Display | Baseline Duration | Classification Weight |
|---|---|---|---|
| `follow_up` | Follow-up | 8 minutes | 0.6× |
| `general` | General | 15 minutes | 1.0× |
| `new_patient` | New Patient | 25 minutes | 1.3× |
| `specialist` | Specialist | 35 minutes | 1.8× |

### `PatientStatus`

| Value | Description |
|---|---|
| `waiting` | In queue, not yet called |
| `in_consultation` | Currently being seen |
| `completed` | Consultation finished |
| `cancelled` | Removed from queue |

---

## Table Descriptions

### `patients`

Primary table. One row per patient visit. Token numbers auto-increment from 101.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `token_number` | INT | Unique, auto-assigned starting at 101 |
| `patient_name` | VARCHAR | Patient's full name |
| `phone_number` | VARCHAR? | Optional, for Twilio SMS tracking link |
| `appointment_type` | ENUM | One of 4 appointment types |
| `status` | ENUM | State machine: waiting → in_consultation → completed |
| `sms_sent` | BOOLEAN | Audit flag: was SMS delivered successfully? |
| `created_at` | TIMESTAMPTZ | Queue entry time |
| `updated_at` | TIMESTAMPTZ | Last status change time |

### `consultations`

One-to-one with `patients`. Tracks timing, prediction accuracy, and the full `ConsultationRecord` schema for ML readiness.

#### Core timing fields

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `patient_id` | UUID | FK → patients.id (cascade delete) |
| `appointment_type` | ENUM | Duplicated for query efficiency |
| `start_time` | TIMESTAMPTZ? | Set when "Call Next" is clicked (≈ calledAt) |
| `end_time` | TIMESTAMPTZ? | Set when "Complete" is clicked |
| `actual_duration` | FLOAT? | Computed: (end - start) in minutes |
| `predicted_duration` | FLOAT | Per-patient estimate at queue entry (HybridEstimator) |
| `created_at` | TIMESTAMPTZ | Same as patient created_at |

#### ConsultationRecord fields (written at each lifecycle event)

| Column | Type | Written at | Notes |
|---|---|---|---|
| `session_id` | VARCHAR? | `addPatient` | Groups one clinic day: `"YYYY-MM-DD"` |
| `registered_at` | TIMESTAMPTZ? | `addPatient` | When token was issued |
| `called_at` | TIMESTAMPTZ? | `callNext` | When "Call Next" was clicked |
| `actual_wait_minutes` | FLOAT? | `callNext` | `calledAt - registeredAt` |
| `transition_gap_minutes` | FLOAT? | `completeConsultation` | `startTime - calledAt` |
| `queue_depth_at_call` | INT? | `callNext` | Waiting patients at that moment |
| `time_of_day` | VARCHAR? | `callNext` | `"morning"` \| `"afternoon"` \| `"evening"` |
| `day_of_week` | INT? | `callNext` | 0 (Sun) – 6 (Sat) |
| `predicted_wait_at_registration` | FLOAT? | `addPatient` | What we told the patient |
| `prediction_error` | FLOAT? | `completeConsultation` | `actualWait - predicted` |
| `chief_complaint` | VARCHAR? | future | Free text for NLP |
| `patient_age_group` | VARCHAR? | future | `"child"` \| `"adult"` \| `"senior"` |

### `queue_settings`

Singleton configuration table. Always exactly 1 row (ID: `00000000-0000-0000-0000-000000000001`).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Fixed UUID primary key |
| `current_token` | INT? | Token number being served right now |
| `clinic_name` | VARCHAR | Displayed on queue board |
| `updated_at` | TIMESTAMPTZ | Changes on every token change |

### `prediction_metrics`

One row per appointment type (4 rows total). Maintains the legacy EMA-based rolling average for analytics dashboards. Updated by `PredictionService.updateMetrics()` after each consultation.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `appointment_type` | ENUM | Unique — one model per type |
| `historical_average` | FLOAT | Cumulative mean of all-time durations |
| `recent_average` | FLOAT | EMA (α=0.3) of recent durations |
| `sample_count` | INT | Completed consultations of this type |
| `updated_at` | TIMESTAMPTZ | Updated after each completed consultation |

### `prediction_audit_logs`

Append-only. One row written per `HybridEstimator.compute()` call. The `actual_wait` column is nullable and backfillable after the consultation ends — giving a `features → label` training pair for future supervised ML.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `timestamp` | TIMESTAMPTZ | When the prediction was made |
| `visit_type` | VARCHAR | Patient's appointment type |
| `tokens_ahead` | INT | Queue position at prediction time |
| `time_of_day` | INT | Hour (0–23) |
| `day_of_week` | INT | Day of week (0–6) |
| `data_points_available` | INT | Historical samples used |
| `rolling_avg` | FLOAT | Rolling average used as input |
| `predicted_optimistic` | INT | p50-scaled lower bound |
| `predicted_likely` | INT | Primary estimate shown to patient |
| `predicted_worst_case` | INT | p90-scaled upper bound |
| `confidence` | VARCHAR | `"low"` \| `"medium"` \| `"high"` |
| `actual_wait` | FLOAT? | Backfilled when patient is called |

---

## Key Queries

### Get Queue State (most frequent)

```sql
-- Current patient
SELECT p.*, c.* FROM patients p
LEFT JOIN consultations c ON c.patient_id = p.id
WHERE p.status = 'in_consultation'
LIMIT 1;

-- Waiting queue (ordered)
SELECT p.*, c.* FROM patients p
LEFT JOIN consultations c ON c.patient_id = p.id
WHERE p.status = 'waiting'
ORDER BY p.token_number ASC;
```

### ML Training Data Export

```sql
-- Features + labels for supervised learning
SELECT
  p.visit_type, p.tokens_ahead, p.time_of_day, p.day_of_week,
  p.data_points_available, p.rolling_avg,
  p.predicted_likely,
  p.actual_wait  -- label
FROM prediction_audit_logs p
WHERE p.actual_wait IS NOT NULL
ORDER BY p.timestamp ASC;
```

### Prediction Accuracy by Type

```sql
SELECT
  c.appointment_type,
  AVG(ABS(c.prediction_error))        AS mean_abs_error,
  AVG(c.prediction_error)             AS mean_bias,
  STDDEV(c.prediction_error)          AS std_error,
  COUNT(*)                            AS sample_count
FROM consultations c
WHERE c.prediction_error IS NOT NULL
GROUP BY c.appointment_type;
```

### Today's Analytics

```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'completed') AS served_today,
  AVG(c.actual_duration)                       AS avg_duration
FROM patients p
LEFT JOIN consultations c ON c.patient_id = p.id
WHERE p.created_at >= CURRENT_DATE;
```

---

## Database Indexing Strategy

Critical indexes for production:

```sql
-- Fast queue status query (most common operation)
CREATE INDEX idx_patients_status ON patients(status);
CREATE INDEX idx_patients_status_token ON patients(status, token_number ASC);

-- Fast analytics date filtering
CREATE INDEX idx_patients_created_at ON patients(created_at);
CREATE INDEX idx_consultations_end_time ON consultations(end_time);

-- ML audit log time-series queries
CREATE INDEX idx_audit_logs_timestamp ON prediction_audit_logs(timestamp);
CREATE INDEX idx_audit_logs_visit_type ON prediction_audit_logs(visit_type);

-- Prediction accuracy analysis
CREATE INDEX idx_consultations_prediction_error ON consultations(appointment_type, prediction_error)
  WHERE prediction_error IS NOT NULL;
```

Prisma automatically creates indexes for `@unique` fields. The composite index on `(status, token_number)` is the most important one to add manually for production.

---

## Prisma Schema

See [backend/prisma/schema.prisma](../backend/prisma/schema.prisma) for the full Prisma schema with all field mappings and relations.
