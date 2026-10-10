-- +goose Up
CREATE TABLE "VisitorSearchTokens" (
 visitor_id INTEGER NOT NULL REFERENCES "Visitors"(id) ON DELETE CASCADE,
 token BYTEA NOT NULL CHECK(octet_length(token)=32),
 PRIMARY KEY(visitor_id,token)
);
CREATE INDEX visitor_search_token_lookup ON "VisitorSearchTokens"(token,visitor_id);
CREATE TABLE "SearchIndexState" (
 id BOOLEAN PRIMARY KEY DEFAULT true CHECK(id),
 fingerprint TEXT NOT NULL DEFAULT '',
 cursor INTEGER NOT NULL DEFAULT 0,
 ready BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "SearchIndexState"(id) VALUES(true);
CREATE INDEX visits_time_id ON "Visits"(check_in_time DESC,id DESC);
-- +goose Down
-- +goose StatementBegin
DO $$ BEGIN RAISE EXCEPTION 'Retain additive schema or restore a verified backup'; END $$;
-- +goose StatementEnd
