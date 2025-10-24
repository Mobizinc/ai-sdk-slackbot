-- Migration: Add service_offering and application_service columns
-- Created: 2025-10-16
-- Purpose: Support Service Portfolio Classification in case classification results

-- Add service_offering column
ALTER TABLE case_classifications
ADD COLUMN IF NOT EXISTS service_offering TEXT;

-- Add application_service column
ALTER TABLE case_classifications
ADD COLUMN IF NOT EXISTS application_service TEXT;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_service_offering
ON case_classifications(service_offering);

CREATE INDEX IF NOT EXISTS idx_application_service
ON case_classifications(application_service);

-- Verify columns were added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'case_classifications'
  AND column_name IN ('service_offering', 'application_service');
