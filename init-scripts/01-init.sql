-- Initialization script for LogMaster PostgreSQL database
-- This runs automatically when the container is first created

-- Ensure proper encoding
SET client_encoding = 'UTF8';

-- Extension for UUID generation (useful for photo filenames)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Log initialization
DO $$
BEGIN
    RAISE NOTICE 'LogMaster database initialized successfully';
END
$$;
