-- Migration: Add d1_database_id to projects table
ALTER TABLE projects ADD COLUMN d1_database_id TEXT;
