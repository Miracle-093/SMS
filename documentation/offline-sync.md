# Offline Synchronization

The desktop application stores Phase 1 offline records in SQLite and queues local changes in `pending_changes`.

## Flow

1. Local creates, updates, or deletes write to SQLite and enqueue a pending change with the record version.
2. The desktop app calls `POST /sync/push` when the API is reachable.
3. The API records every push in `SynchronizationRecord`.
4. If the server version differs from the local base version, the API creates `SynchronizationConflict`.
5. Finance, payroll, budgets, and inventory conflicts are marked `SENSITIVE` for administrator review.
6. The desktop app calls `POST /sync/pull` with the last successful sync timestamp.
7. Failed pushes can be retried through `POST /sync/retry`.

## Duplicate Protection

Each pending change has a stable UUID. Replaying the same pending change hits the API `SynchronizationRecord.id` uniqueness constraint rather than creating a second sync event.

## Offline Finance

Phase 1 supports offline payment capture, expense capture, and budget-request drafting from the desktop app. These records are saved in SQLite and queued in `pending_changes`.

Payments and expenses are not applied on the server through blind model updates. During sync, the API routes payment and expense creates through the finance service so invoice balances, receipts, budget caps, risk alerts, and audit logs are recalculated authoritatively in PostgreSQL transactions.

Offline payment receipts use provisional device/UUID-backed numbers (`OFF-...`) for local printing and duplicate avoidance. After sync, PostgreSQL assigns the authoritative `RCT-YYYY-#####` receipt number. Reprints reuse the same receipt row and do not create a second payment.

Financial, payroll, budget, and inventory version conflicts are marked `SENSITIVE`; they stay out of last-write-wins logic and go to Sync Review for administrator resolution.

## Student Attendance

Student attendance is not part of Phase 1. Future hardware integration can reuse `devices`, sync metadata fields, pending changes, and conflict review without enabling an active student attendance module now.
