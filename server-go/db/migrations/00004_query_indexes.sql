-- +goose Up
CREATE INDEX visits_status_time_id ON "Visits"(status,check_in_time DESC,id DESC);
CREATE INDEX visits_open_status_time ON "Visits"(status,check_in_time,id) WHERE check_out_time IS NULL;

-- +goose Down
DROP INDEX visits_open_status_time;
DROP INDEX visits_status_time_id;
