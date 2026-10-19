-- +goose Up
CREATE TABLE "IdentityIndexState" (
 id BOOLEAN PRIMARY KEY DEFAULT true CHECK(id),
 fingerprint TEXT NOT NULL DEFAULT '',
 ready BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "IdentityIndexState"(id) VALUES(true);
-- +goose Down
-- +goose StatementBegin
DO $$ BEGIN RAISE EXCEPTION 'Retain additive schema or restore a verified backup'; END $$;
-- +goose StatementEnd
