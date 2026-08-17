CREATE TABLE IF NOT EXISTS assessments (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  term_id TEXT NOT NULL,
  examination_id TEXT,
  subject_id TEXT NOT NULL,
  class_id TEXT,
  stream_id TEXT,
  teacher_id TEXT,
  name TEXT NOT NULL,
  max_score REAL NOT NULL,
  weight REAL NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  updated_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'SYNCED'
);

CREATE TABLE IF NOT EXISTS marks (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  device_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'PENDING',
  last_synced_at TEXT,
  approval_status TEXT NOT NULL DEFAULT 'PENDING',
  deleted_at TEXT,
  student_id TEXT NOT NULL,
  assessment_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  score REAL NOT NULL,
  weighted_score REAL,
  grade TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  teacher_comment TEXT
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  device_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'SYNCED',
  last_synced_at TEXT,
  approval_status TEXT NOT NULL DEFAULT 'APPROVED',
  deleted_at TEXT,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  description TEXT,
  unit TEXT NOT NULL DEFAULT 'unit',
  quantity INTEGER NOT NULL DEFAULT 0,
  reorder_level INTEGER NOT NULL DEFAULT 0,
  unit_cost REAL NOT NULL DEFAULT 0,
  storage_location TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  device_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'PENDING',
  last_synced_at TEXT,
  approval_status TEXT NOT NULL DEFAULT 'PENDING',
  deleted_at TEXT,
  inventory_item_id TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_cost REAL,
  supplier_id TEXT,
  department_or_person TEXT,
  reference TEXT,
  occurred_at TEXT NOT NULL,
  reason TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payroll_records (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  device_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'PENDING',
  last_synced_at TEXT,
  approval_status TEXT NOT NULL DEFAULT 'PENDING',
  deleted_at TEXT,
  teacher_id TEXT NOT NULL,
  payroll_run_id TEXT,
  payroll_profile_id TEXT,
  period TEXT NOT NULL,
  gross_pay REAL NOT NULL,
  deductions REAL NOT NULL,
  net_pay REAL NOT NULL,
  payment_method TEXT,
  payment_account TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT'
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  device_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'SYNCED',
  last_synced_at TEXT,
  approval_status TEXT NOT NULL DEFAULT 'APPROVED',
  deleted_at TEXT,
  recipient_type TEXT NOT NULL,
  recipient_id TEXT,
  channel TEXT NOT NULL DEFAULT 'IN_APP',
  category TEXT NOT NULL DEFAULT 'GENERAL',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  read_at TEXT,
  sent_at TEXT
);

CREATE TABLE IF NOT EXISTS announcements (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  audience TEXT NOT NULL,
  class_id TEXT,
  stream_id TEXT,
  academic_year_id TEXT,
  priority TEXT NOT NULL DEFAULT 'NORMAL',
  publish_at TEXT NOT NULL,
  expires_at TEXT,
  updated_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'SYNCED'
);

CREATE INDEX IF NOT EXISTS idx_marks_pending ON marks(sync_status, updated_at);
CREATE INDEX IF NOT EXISTS idx_stock_movements_pending ON stock_movements(sync_status, occurred_at);
CREATE INDEX IF NOT EXISTS idx_payroll_records_pending ON payroll_records(sync_status, period);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(school_id, recipient_type, recipient_id, status);
