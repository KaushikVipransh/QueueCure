# Database Schema — Queue Cure

## Entity Relationship Diagram

```
┌──────────────────────────────┐      ┌─────────────────────────────────┐
│          patients            │      │          consultations           │
├──────────────────────────────┤      ├─────────────────────────────────┤
│ id           UUID  PK        │◄─────│ id              UUID  PK        │
│ token_number INT   UNIQUE    │ 1:1  │ patient_id      UUID  FK,UNIQUE │
│ patient_name VARCHAR         │      │ appointment_type ENUM           │
│ appointment_type ENUM        │      │ start_time      TIMESTAMPTZ?    │
│ status       ENUM            │      │ end_time        TIMESTAMPTZ?    │
│ created_at   TIMESTAMPTZ     │      │ actual_duration  FLOAT?         │
│ updated_at   TIMESTAMPTZ     │      │ predicted_duration FLOAT        │
└──────────────────────────────┘      │ created_at      TIMESTAMPTZ     │
                                      └─────────────────────────────────┘

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
```

---

## Enum Types

### `AppointmentType`

| Value | Display | Baseline Duration |
|---|---|---|
| `follow_up` | Follow-up | 8 minutes |
| `general` | General | 15 minutes |
| `new_patient` | New Patient | 25 minutes |
| `specialist` | Specialist | 35 minutes |

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
| `appointment_type` | ENUM | One of 4 appointment types |
| `status` | ENUM | State machine: waiting → in_consultation → completed |
| `created_at` | TIMESTAMPTZ | Queue entry time |
| `updated_at` | TIMESTAMPTZ | Last status change time |

### `consultations`

One-to-one with `patients`. Tracks timing and prediction accuracy.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `patient_id` | UUID | FK → patients.id (cascade delete) |
| `appointment_type` | ENUM | Duplicated for query efficiency |
| `start_time` | TIMESTAMPTZ? | Set when "Call Next" is clicked |
| `end_time` | TIMESTAMPTZ? | Set when "Complete" is clicked |
| `actual_duration` | FLOAT? | Computed: (end - start) in minutes |
| `predicted_duration` | FLOAT | Estimate at time of queue entry |
| `created_at` | TIMESTAMPTZ | Same as patient created_at |

### `queue_settings`

Singleton configuration table. Always exactly 1 row (ID: `00000000-0000-0000-0000-000000000001`).

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Fixed UUID primary key |
| `current_token` | INT? | Token number being served right now |
| `clinic_name` | VARCHAR | Displayed on queue board |
| `updated_at` | TIMESTAMPTZ | Changes on every token change |

### `prediction_metrics`

One row per appointment type (4 rows total). Stores the adaptive model state.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `appointment_type` | ENUM | Unique — one model per type |
| `historical_average` | FLOAT | Cumulative mean of all historical durations |
| `recent_average` | FLOAT | EMA (α=0.3) of recent durations |
| `sample_count` | INT | Number of completed consultations of this type |
| `updated_at` | TIMESTAMPTZ | Updated after each completed consultation |

---

## Key Queries

### Get Queue State (most frequent)

```sql
-- Current patient
SELECT p.*, c.* FROM patients p
LEFT JOIN consultations c ON c.patient_id = p.id
WHERE p.status = 'in_consultation'
LIMIT 1;

-- Waiting queue
SELECT p.*, c.* FROM patients p
LEFT JOIN consultations c ON c.patient_id = p.id
WHERE p.status = 'waiting'
ORDER BY p.token_number ASC;
```

### Today's Analytics

```sql
SELECT
  COUNT(*) FILTER (WHERE status = 'completed') AS served_today,
  AVG(c.actual_duration) AS avg_duration
FROM patients p
LEFT JOIN consultations c ON c.patient_id = p.id
WHERE p.created_at >= CURRENT_DATE;
```

### Prediction Model Update

```sql
UPDATE prediction_metrics
SET
  historical_average = (historical_average * sample_count + :actual) / (sample_count + 1),
  recent_average = 0.3 * :actual + 0.7 * recent_average,
  sample_count = sample_count + 1,
  updated_at = NOW()
WHERE appointment_type = :type;
```

---

## Prisma Schema

See [backend/prisma/schema.prisma](../backend/prisma/schema.prisma) for the full Prisma schema with all field mappings and relations.
