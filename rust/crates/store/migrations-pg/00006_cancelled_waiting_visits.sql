-- +goose Up
ALTER TYPE public."enum_Visits_status" ADD VALUE IF NOT EXISTS 'cancelled';
ALTER TABLE public."Visits" ADD COLUMN cancellation_reason TEXT;

-- +goose Down
-- +goose StatementBegin
DO $$ BEGIN RAISE EXCEPTION 'Retain cancellation events or restore a verified backup'; END $$;
-- +goose StatementEnd
