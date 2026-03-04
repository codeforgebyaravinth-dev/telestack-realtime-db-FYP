-- Telestack Real-time DB Enhanced Schema

-- Platform Identity & Projects (v3.0)
CREATE TABLE IF NOT EXISTS platform_users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    d1_database_id TEXT, -- UUID of the isolated D1 database for this project
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(owner_id) REFERENCES platform_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    key_secret TEXT UNIQUE NOT NULL,
    key_type TEXT CHECK(key_type IN ('admin', 'public')) DEFAULT 'public',
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Indexes for Platform Lookups
CREATE INDEX IF NOT EXISTS idx_projects_owner ON projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_secret ON api_keys(key_secret);


CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    collection_name TEXT NOT NULL,
    path TEXT NOT NULL,
    user_id TEXT NOT NULL,
    data TEXT NOT NULL, -- JSON
    version INTEGER DEFAULT 1,
    deleted_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_workspace_collection ON documents(workspace_id, collection_name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_path_prefix ON documents(path) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_user ON documents(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_updated_at ON documents(updated_at);

-- Trigger to auto-update updated_at
CREATE TRIGGER IF NOT EXISTS update_doc_timestamp 
AFTER UPDATE ON documents
FOR EACH ROW
BEGIN
    UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;

-- Event Sourcing Table (Immutable transaction log)
CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    doc_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    event_type TEXT NOT NULL, -- 'INSERT', 'UPDATE', 'DELETE'
    payload TEXT NOT NULL, -- JSON diff or snapshot
    version INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (doc_id) REFERENCES documents(id)
);

-- Advanced Indexing for JSON lookups (Simulated JSONB path indexes)
CREATE INDEX IF NOT EXISTS idx_events_doc ON events(doc_id);
CREATE INDEX IF NOT EXISTS idx_events_workspace_version ON events(workspace_id, version);

-- Note: In D1, we can't do functional indexes like documents(data->>'type'), 
-- but we can optimize the path/collection lookups.
