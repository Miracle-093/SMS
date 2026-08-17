CREATE TABLE IF NOT EXISTS fee_structures (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  academic_year_id TEXT,
  term_id TEXT,
  class_id TEXT NOT NULL,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  amount REAL NOT NULL,
  is_mandatory INTEGER NOT NULL DEFAULT 1,
  due_date TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  sync_status TEXT NOT NULL DEFAULT 'SYNCED'
);

CREATE TABLE IF NOT EXISTS student_invoices (
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
  student_id TEXT NOT NULL,
  term_id TEXT NOT NULL,
  fee_structure_id TEXT NOT NULL,
  invoice_no TEXT NOT NULL,
  invoice_date TEXT NOT NULL,
  status TEXT NOT NULL,
  amount REAL NOT NULL,
  amount_paid REAL NOT NULL DEFAULT 0,
  adjustment_total REAL NOT NULL DEFAULT 0,
  balance REAL NOT NULL,
  due_date TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  device_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1,
  sync_status TEXT NOT NULL DEFAULT 'PENDING',
  last_synced_at TEXT,
  approval_status TEXT NOT NULL DEFAULT 'APPROVED',
  deleted_at TEXT,
  invoice_id TEXT NOT NULL,
  receipt_no TEXT NOT NULL,
  amount REAL NOT NULL,
  method TEXT NOT NULL,
  reference TEXT,
  notes TEXT,
  received_by TEXT,
  paid_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS receipts (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  payment_id TEXT NOT NULL,
  receipt_no TEXT NOT NULL,
  display_no TEXT NOT NULL,
  amount_words TEXT,
  printed_at TEXT,
  reprint_count INTEGER NOT NULL DEFAULT 0,
  sync_status TEXT NOT NULL DEFAULT 'PENDING'
);

CREATE TABLE IF NOT EXISTS budgets (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  name TEXT NOT NULL,
  academic_year_id TEXT,
  term_id TEXT,
  department TEXT NOT NULL,
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  committed_amount REAL NOT NULL DEFAULT 0,
  spent_amount REAL NOT NULL DEFAULT 0,
  warning_threshold INTEGER NOT NULL DEFAULT 80,
  hard_cap INTEGER NOT NULL DEFAULT 1,
  period TEXT,
  year INTEGER NOT NULL,
  approval_status TEXT NOT NULL DEFAULT 'APPROVED',
  sync_status TEXT NOT NULL DEFAULT 'SYNCED'
);

CREATE TABLE IF NOT EXISTS budget_requests (
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
  budget_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  amount REAL NOT NULL,
  reason TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
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
  expense_no TEXT NOT NULL,
  category TEXT NOT NULL,
  department TEXT,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  method TEXT,
  payee TEXT,
  reference TEXT,
  requested_by TEXT,
  supporting_document TEXT,
  budget_id TEXT,
  notes TEXT,
  spent_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS risk_alerts (
  id TEXT PRIMARY KEY,
  school_id TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  amount REAL,
  user_id TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEW',
  notes TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payments_pending ON payments(sync_status, paid_at);
CREATE INDEX IF NOT EXISTS idx_expenses_pending ON expenses(sync_status, spent_at);
CREATE INDEX IF NOT EXISTS idx_invoices_student ON student_invoices(student_id, term_id);
CREATE INDEX IF NOT EXISTS idx_risk_alert_status ON risk_alerts(school_id, status);
