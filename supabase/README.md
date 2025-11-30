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
