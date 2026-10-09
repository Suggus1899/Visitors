-- +goose Up
ALTER TABLE "Visits" ALTER COLUMN purpose TYPE TEXT;
ALTER TABLE "Visits" ADD COLUMN consent_policy_version TEXT;
ALTER TABLE "Visits" ADD COLUMN consent_accepted_at TIMESTAMPTZ;
ALTER TABLE "Visits" ADD COLUMN consent_recorded_by INTEGER;
ALTER TABLE "IntermittentLogs" ADD COLUMN reentered_by TEXT;
-- +goose StatementBegin
DO $$ DECLARE duplicates TEXT; BEGIN
 SELECT string_agg(visit_id::text, ',') INTO duplicates FROM (SELECT visit_id FROM "IntermittentLogs" WHERE re_entry IS NULL GROUP BY visit_id HAVING count(*)>1) d;
 IF duplicates IS NOT NULL THEN RAISE EXCEPTION 'Duplicate open intermittent logs; resolve visit IDs before migrating: %', duplicates; END IF;
END $$;
-- +goose StatementEnd
CREATE UNIQUE INDEX intermittent_one_open_per_visit ON "IntermittentLogs"(visit_id) WHERE re_entry IS NULL;

-- +goose Down
-- +goose StatementBegin
DO $$ BEGIN RAISE EXCEPTION 'Visit consent must not be discarded by rollback; retain additive schema or restore a verified backup'; END $$;
-- +goose StatementEnd
