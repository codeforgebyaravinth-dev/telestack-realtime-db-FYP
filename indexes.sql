-- Phase 3: Query Optimization (B-Tree Indexes)
-- Add indexes for fast path lookups (O(log n) instead of O(n))

-- 1. Path Index (Most Critical)
CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(workspace_id, path);

-- 2. Collection Index
CREATE INDEX IF NOT EXISTS idx_documents_collection ON documents(workspace_id, collection_name);

-- 3. Parent Path Index (for hierarchical queries)
CREATE INDEX IF NOT EXISTS idx_documents_parent ON documents(workspace_id, parent_path);

-- 4. Composite Index for LIST queries
CREATE INDEX IF NOT EXISTS idx_documents_list ON documents(workspace_id, collection_name, deleted_at);

-- 5. User Index (for user-specific queries)
CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(workspace_id, user_id);

-- 6. Version Index (for sync queries)
CREATE INDEX IF NOT EXISTS idx_documents_version ON documents(workspace_id, version);

-- Verify indexes
SELECT name, tbl_name, sql FROM sqlite_master WHERE type='index' AND tbl_name='documents';
