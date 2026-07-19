-- ============================================================
-- Al-Yousef ERP — SQLite schema
-- Mirrors the existing in-memory `db` object shape field-for-field.
-- Parent-child item tables (BOQ rows, assignment items, extract
-- items, etc.) use ON DELETE CASCADE so removing a parent record
-- can never leave orphaned child rows.
-- Two cross-links (contracts.guarantee_assign_id / guarantee_extract_id)
-- are deliberately left as plain columns with no FK constraint: adding
-- one would create a circular dependency between contracts and
-- assignments at table-creation time. The app's own cleanup logic
-- (cleanupDanglingRefs) already handles these two safely.
-- ============================================================

PRAGMA foreign_keys = ON;

-- ---------- Clients ----------
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  contact TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT
);

-- ---------- Contracts ----------
CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY,
  num TEXT NOT NULL,
  client_id TEXT REFERENCES clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL,               -- 'itemized' | 'fixed'
  contract_value REAL,
  start TEXT,
  end TEXT,
  status TEXT,
  vat REAL DEFAULT 0,
  retention REAL DEFAULT 0,
  guarantee_type TEXT,
  guarantee_method TEXT,
  guarantee_ref TEXT,
  guarantee_bank TEXT,
  guarantee_status TEXT,
  guarantee_assign_id TEXT,          -- soft link, see note above (no FK)
  guarantee_extract_id TEXT,         -- soft link, see note above (no FK)
  desc TEXT
);
CREATE INDEX IF NOT EXISTS idx_contracts_client ON contracts(client_id);

CREATE TABLE IF NOT EXISTS contract_boq_items (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  wbs TEXT,
  desc TEXT,
  unit TEXT,
  qty REAL DEFAULT 0,
  price REAL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_boq_contract ON contract_boq_items(contract_id);

-- ---------- Annexes ----------
CREATE TABLE IF NOT EXISTS annexes (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  num TEXT,
  type TEXT,                        -- 'value' | 'duration' | 'price' | 'addbod'
  date TEXT,
  value REAL,
  newdate TEXT,
  status TEXT,
  desc TEXT
);
CREATE INDEX IF NOT EXISTS idx_annexes_contract ON annexes(contract_id);

-- ---------- Assignments (أوامر الإسناد) ----------
CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  num TEXT NOT NULL,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  desc TEXT,
  start TEXT,
  end TEXT,
  status TEXT,
  notes TEXT,
  retention REAL DEFAULT 0,
  retention_final REAL DEFAULT 50,
  warranty_months INTEGER DEFAULT 12,
  vat REAL DEFAULT 0,
  retention_method TEXT,             -- 'advance' | 'deduct_first'
  retention_instrument TEXT,         -- 'cash' | 'check' | 'lg'
  retention_ref TEXT,
  retention_due_days INTEGER DEFAULT 15,
  retention_paid_status TEXT
);
CREATE INDEX IF NOT EXISTS idx_assignments_contract ON assignments(contract_id);

CREATE TABLE IF NOT EXISTS assignment_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  wbs TEXT,
  desc TEXT,
  unit TEXT,
  assign_qty REAL DEFAULT 0,
  price REAL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_assign_items_assignment ON assignment_items(assignment_id);

-- ---------- Extracts (مستخلصات) ----------
CREATE TABLE IF NOT EXISTS extracts (
  id TEXT PRIMARY KEY,
  num TEXT NOT NULL,
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  type TEXT,                        -- 'مرحلي' | 'ختامي' | 'مقدمة'
  date TEXT,
  status TEXT,
  deduction REAL DEFAULT 0,
  social_ins REAL DEFAULT 0,
  irregular REAL DEFAULT 0,
  stamps REAL DEFAULT 0,
  tax REAL DEFAULT 0,
  einvoice TEXT,
  notes TEXT,
  value REAL,                       -- backup total, same as original JS field
  completion REAL
);
CREATE INDEX IF NOT EXISTS idx_extracts_assignment ON extracts(assignment_id);

CREATE TABLE IF NOT EXISTS extract_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  extract_id TEXT NOT NULL REFERENCES extracts(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  wbs TEXT,
  desc TEXT,
  unit TEXT,
  price REAL DEFAULT 0,
  assign_qty REAL DEFAULT 0,
  prev_qty REAL DEFAULT 0,
  period_qty REAL DEFAULT 0,
  current_qty REAL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_extract_items_extract ON extract_items(extract_id);

-- ---------- Subcontractors (مقاولو الباطن) ----------
CREATE TABLE IF NOT EXISTS subcontractors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  spec TEXT,
  contact TEXT,
  phone TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS sub_contracts (
  id TEXT PRIMARY KEY,
  num TEXT,
  sub_id TEXT NOT NULL REFERENCES subcontractors(id) ON DELETE CASCADE,
  assignment_id TEXT REFERENCES assignments(id) ON DELETE SET NULL,
  type TEXT,                        -- 'boq' | 'lump'
  value REAL DEFAULT 0,
  start TEXT,
  end TEXT,
  status TEXT,
  desc TEXT
);
CREATE INDEX IF NOT EXISTS idx_subcontracts_sub ON sub_contracts(sub_id);
CREATE INDEX IF NOT EXISTS idx_subcontracts_assignment ON sub_contracts(assignment_id);

CREATE TABLE IF NOT EXISTS sub_contract_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sub_contract_id TEXT NOT NULL REFERENCES sub_contracts(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  wbs_ref TEXT,
  desc TEXT,
  unit TEXT,
  qty REAL DEFAULT 0,
  price REAL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sc_items_contract ON sub_contract_items(sub_contract_id);

-- The "payments" schedule embedded in a lump-sum sub-contract — a plan,
-- not the actual recorded payments (those are in sub_payments below).
CREATE TABLE IF NOT EXISTS sub_contract_payment_schedule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sub_contract_id TEXT NOT NULL REFERENCES sub_contracts(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  assign_ref TEXT,
  amount REAL DEFAULT 0,
  date TEXT,
  status TEXT,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_sc_schedule_contract ON sub_contract_payment_schedule(sub_contract_id);

-- Actual recorded payments made to a subcontractor
CREATE TABLE IF NOT EXISTS sub_payments (
  id TEXT PRIMARY KEY,
  sub_id TEXT NOT NULL REFERENCES subcontractors(id) ON DELETE CASCADE,
  contract_id TEXT REFERENCES sub_contracts(id) ON DELETE SET NULL,
  date TEXT,
  amount REAL DEFAULT 0,
  method TEXT,
  ref TEXT,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_subpayments_sub ON sub_payments(sub_id);

-- ---------- Suppliers ----------
CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT,
  contact TEXT,
  phone TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  type TEXT,                        -- 'شراء' | 'إيجار' | 'خدمات'
  desc TEXT,
  unit TEXT,
  qty REAL,
  unit_price REAL,
  amount REAL,
  date TEXT,
  charge_type TEXT,                 -- '' | 'assignment' | 'contract' (polymorphic, no FK)
  charge_ref TEXT,                  -- id into assignments or contracts depending on charge_type
  invoice TEXT,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id);

CREATE TABLE IF NOT EXISTS supplier_payments (
  id TEXT PRIMARY KEY,
  supplier_id TEXT NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  date TEXT,
  amount REAL DEFAULT 0,
  method TEXT,
  ref TEXT,
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_suppayments_supplier ON supplier_payments(supplier_id);

-- ---------- Settings ----------
CREATE TABLE IF NOT EXISTS wbs_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  desc TEXT,
  cat TEXT
);

-- Single-row table (id is always 1)
CREATE TABLE IF NOT EXISTS company_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT,
  reg TEXT,
  phone TEXT,
  address TEXT
);

-- Small key/value table for app bookkeeping (e.g. "has the one-time
-- migration from the old data.json already run?")
CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
