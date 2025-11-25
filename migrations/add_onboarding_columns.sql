-- Migration: Add onboarding columns to app_users table
-- Run this migration to add the required columns for the onboarding flow

-- Add onboarding-related columns to app_users table
ALTER TABLE app_users
ADD COLUMN IF NOT EXISTS date_of_birth DATE,
ADD COLUMN IF NOT EXISTS address_line1 TEXT,
ADD COLUMN IF NOT EXISTS address_line2 TEXT,
ADD COLUMN IF NOT EXISTS address_city TEXT,
ADD COLUMN IF NOT EXISTS address_postcode TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT,
ADD COLUMN IF NOT EXISTS emergency_contact_number TEXT,
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;

-- Update existing users to have onboarding_completed = false if they don't have the required fields
UPDATE app_users
SET onboarding_completed = false
WHERE onboarding_completed IS NULL
   OR date_of_birth IS NULL
   OR address_line1 IS NULL
   OR address_city IS NULL
   OR address_postcode IS NULL
   OR emergency_contact_name IS NULL
   OR emergency_contact_number IS NULL;

-- Create index on onboarding_completed for faster queries
CREATE INDEX IF NOT EXISTS idx_app_users_onboarding_completed ON app_users(onboarding_completed);

