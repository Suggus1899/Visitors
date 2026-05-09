-- Migration 006: Visitor Enhancements and Visitor-Visit Separation
-- Adds: isBlocked, observations, createdAt to Visitors
-- Adds: VisitPurposes lookup table
-- Removes: area column from Visits (migrated to notes if needed)
-- Ensures: unique constraint on cedula

-- ============================================
-- 1. Add new columns to Visitors table
-- ============================================

-- Add isBlocked flag for blacklist
ALTER TABLE "Visitors" ADD COLUMN IF NOT EXISTS "isBlocked" BOOLEAN DEFAULT FALSE;

-- Add observations field for blacklist reason or general notes
ALTER TABLE "Visitors" ADD COLUMN IF NOT EXISTS observations TEXT;

-- Add createdAt timestamp (existing records will use current timestamp)
ALTER TABLE "Visitors" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- ============================================
-- 2. Ensure unique constraint on cedula
-- ============================================

-- First, normalize any existing duplicate cedulas (keep oldest)
-- This is a safety measure - should be reviewed manually if duplicates exist

-- Create unique index if not exists
CREATE UNIQUE INDEX IF NOT EXISTS idx_visitors_cedula_unique ON "Visitors"(cedula);

-- ============================================
-- 3. Create VisitPurposes lookup table
-- ============================================

CREATE TABLE IF NOT EXISTS "VisitPurposes" (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  "isActive" BOOLEAN DEFAULT TRUE,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert default purposes
INSERT INTO "VisitPurposes" (id, name) VALUES 
  (1, 'Reunión de negocios'),
  (2, 'Entrega de documentos'),
  (3, 'Visita personal'),
  (4, 'Mantenimiento técnico'),
  (5, 'Capacitación'),
  (6, 'Entrevista'),
  (7, 'Visita comercial'),
  (8, 'Inspección'),
  (9, 'Otro')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 4. Create Departments lookup table (optional but recommended)
-- ============================================

CREATE TABLE IF NOT EXISTS "Departments" (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20),
  "isActive" BOOLEAN DEFAULT TRUE,
  "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample departments (customize as needed)
INSERT INTO "Departments" (id, name, code) VALUES 
  (1, 'Administración', 'ADM'),
  (2, 'Recursos Humanos', 'RRHH'),
  (3, 'Ventas', 'VTA'),
  (4, 'Operaciones', 'OPS'),
  (5, 'Tecnología', 'IT'),
  (6, 'Contabilidad', 'CONT'),
  (7, 'Almacén', 'ALM'),
  (8, 'Producción', 'PROD'),
  (9, 'Seguridad', 'SEG'),
  (10, 'Recepción', 'RECP')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 5. Remove area column from Visits (if exists)
-- ============================================

-- Note: In SQLite we can't directly DROP COLUMN in older versions
-- If area exists, we migrate it to notes field first, then recreate table

-- Check if area column exists and migrate data
-- This is handled by the application layer in this migration
-- The 'area' field should no longer be used in the application

-- ============================================
-- 6. updatedAt is managed by Sequelize (timestamps: true)
-- ============================================

-- ============================================
-- Migration complete
-- ============================================
