-- Down migration for 008: Recreate VisitIntervals table
CREATE TABLE IF NOT EXISTS "VisitIntervals" (
  id            SERIAL PRIMARY KEY,
  visit_id      INTEGER NOT NULL REFERENCES "Visits"(id) ON DELETE CASCADE,
  exit_time     TIMESTAMP NOT NULL,
  reentry_time  TIMESTAMP,
  notes         TEXT,
  "createdAt"   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_visit_intervals_visit_id ON "VisitIntervals"(visit_id);
