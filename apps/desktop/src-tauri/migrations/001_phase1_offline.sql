CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  name TEXT NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE,
  last_seen_at TEXT,
  is_trusted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pending_changes (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('CREATE', 'UPDATE', 'DELETE')),
  payload_json TEXT NOT NULL,
  base_version INTEGER,
  created_at TEXT NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS sync_conflicts (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  local_version INTEGER NOT NULL,
  server_version INTEGER NOT NULL,
  local_payload_json TEXT NOT NULL,
  server_payload_json TEXT NOT NULL,
  sensitivity TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS local_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teachers (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  device_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'SYNCED',
  last_synced_at TEXT,
  approval_status TEXT NOT NULL DEFAULT 'APPROVED',
  deleted_at TEXT,
  staff_id TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  pin_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teacher_attendance (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  device_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'PENDING',
  last_synced_at TEXT,
  approval_status TEXT NOT NULL DEFAULT 'APPROVED',
  deleted_at TEXT,
  teacher_id TEXT NOT NULL,
  attendance_date TEXT NOT NULL,
  check_in_at TEXT,
  check_out_at TEXT,
  status TEXT NOT NULL,
  correction_requested_by TEXT,
  correction_reason TEXT,
  requested_check_in_at TEXT,
  requested_check_out_at TEXT,
  approved_by TEXT,
  approved_at TEXT,
  UNIQUE (teacher_id, attendance_date)
);

CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  device_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'PENDING',
  last_synced_at TEXT,
  approval_status TEXT NOT NULL DEFAULT 'APPROVED',
  deleted_at TEXT,
  admission_no TEXT NOT NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT,
  last_name TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT 'OTHER',
  date_of_birth TEXT,
  admission_date TEXT,
  previous_school TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  current_academic_year_id TEXT,
  current_class_id TEXT,
  current_stream_id TEXT,
  emergency_contact TEXT,
  medical_notes TEXT,
  photo_url TEXT,
  supporting_documents_json TEXT,
  notes TEXT,
  UNIQUE (school_id, admission_no)
);

CREATE TABLE IF NOT EXISTS guardians (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  device_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'PENDING',
  last_synced_at TEXT,
  approval_status TEXT NOT NULL DEFAULT 'APPROVED',
  deleted_at TEXT,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT
);

CREATE TABLE IF NOT EXISTS student_guardians (
  student_id TEXT NOT NULL,
  guardian_id TEXT NOT NULL,
  relationship TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (student_id, guardian_id)
);

CREATE TABLE IF NOT EXISTS student_portal_credentials (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  must_reset INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS student_promotions (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  device_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'PENDING',
  last_synced_at TEXT,
  approval_status TEXT NOT NULL DEFAULT 'APPROVED',
  deleted_at TEXT,
  student_id TEXT NOT NULL,
  previous_academic_year_id TEXT NOT NULL,
  previous_class_id TEXT NOT NULL,
  new_academic_year_id TEXT NOT NULL,
  new_class_id TEXT NOT NULL,
  promotion_date TEXT NOT NULL,
  promoted_by TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS marks (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  device_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'PENDING',
  last_synced_at TEXT,
  approval_status TEXT NOT NULL DEFAULT 'APPROVED',
  deleted_at TEXT,
  student_id TEXT NOT NULL,
  assessment_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  score REAL NOT NULL,
  UNIQUE (student_id, assessment_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  device_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'PENDING',
  last_synced_at TEXT,
  approval_status TEXT NOT NULL DEFAULT 'APPROVED',
  deleted_at TEXT,
  invoice_id TEXT NOT NULL,
  receipt_no TEXT NOT NULL,
  amount REAL NOT NULL,
  method TEXT NOT NULL,
  paid_at TEXT NOT NULL,
  UNIQUE (school_id, receipt_no)
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  device_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'PENDING',
  last_synced_at TEXT,
  approval_status TEXT NOT NULL DEFAULT 'APPROVED',
  deleted_at TEXT,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  reorder_level INTEGER NOT NULL DEFAULT 0,
  UNIQUE (school_id, sku)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  device_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'PENDING',
  last_synced_at TEXT,
  approval_status TEXT NOT NULL DEFAULT 'APPROVED',
  deleted_at TEXT,
  inventory_item_id TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  reason TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS budget_requests (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  device_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'PENDING',
  last_synced_at TEXT,
  approval_status TEXT NOT NULL DEFAULT 'PENDING',
  deleted_at TEXT,
  budget_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  amount REAL NOT NULL,
  reason TEXT NOT NULL
);
