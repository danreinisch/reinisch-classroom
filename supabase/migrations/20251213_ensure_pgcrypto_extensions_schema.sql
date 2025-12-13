-- Migration: Ensure pgcrypto Extension in extensions Schema
-- Date: 2025-12-13
-- Description: Ensures the extensions schema exists and pgcrypto extension is installed
--              in that schema to fix runtime "function crypt(text, text) does not exist" errors.
--              This migration is idempotent and safe to run multiple times.

-- Create extensions schema if it doesn't exist
create schema if not exists extensions;

-- Install pgcrypto extension in the extensions schema
-- This ensures crypt() and gen_salt() functions are available as extensions.crypt() and extensions.gen_salt()
create extension if not exists pgcrypto with schema extensions;

-- Grant usage on the extensions schema to necessary roles
-- This allows functions to call extensions.crypt() and extensions.gen_salt()
grant usage on schema extensions to anon, authenticated, service_role;

-- Migration complete
-- Note: This migration only ensures the schema and extension are in place.
-- Function updates to use qualified extensions.crypt() and extensions.gen_salt() 
-- are handled in the respective migration files where those functions are defined.
