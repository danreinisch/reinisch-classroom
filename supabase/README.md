# Supabase Database Schema

This folder contains the **authoritative database schema** for the Reinisch Classroom platform.

## 📌 Files

### `schema_full_dump.sql`
This is the **official, full export of the live Supabase database**.

- Generated directly from the Production Supabase instance  
- Includes:
  - Tables
  - Extensions
  - Functions
  - Constraints
  - Indexes
  - Enum types
- Should be treated as the **source of truth** for all work involving:
  - GitHub Copilot
  - Local development
  - Migrations
  - Future schema rewrites

## 🔐 pgcrypto Extension Requirement

The database requires the **pgcrypto extension** for password hashing functionality.

### Schema Qualification
All password-related functions use **qualified** references to pgcrypto functions:
- `extensions.crypt()` instead of `crypt()`
- `extensions.gen_salt()` instead of `gen_salt()`

**Why?** Supabase's default `search_path` at runtime may not include the `extensions` schema where pgcrypto functions are installed. Using qualified names (e.g., `extensions.crypt()`) ensures the functions are always found, preventing runtime errors like:
```
ERROR: function crypt(text, text) does not exist
SQLSTATE: 42883
```

### Setup
The migration `20251213_ensure_pgcrypto_extensions_schema.sql` ensures:
1. The `extensions` schema exists
2. The `pgcrypto` extension is installed in that schema
3. Proper permissions are granted

This migration is idempotent and safe to run multiple times.

## 🧩 How to Use This File

### With GitHub Copilot
Copilot can read this schema to:
- Generate correct SQL queries  
- Build Supabase RPCs  
- Create safe TypeScript types  
- Avoid referencing tables that no longer exist  
- Maintain consistency with Production

### With Local Development
If you want to recreate the schema locally:

```bash
psql -h localhost -U postgres -f supabase/schema_full_dump.sql
