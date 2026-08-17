import Database from "@tauri-apps/plugin-sql";

const dbUrl = "sqlite:aethina-offline.db";
const pendingKey = "aethina.pendingChanges";
const draftStudentKey = "aethina.localStudents";
const draftPaymentKey = "aethina.localPayments";
const draftExpenseKey = "aethina.localExpenses";
const lastSyncKey = "aethina.lastSync";

export type PendingChange = {
  id: string;
  entityType: string;
  entityId: string;
  operation: string;
  payload: unknown;
  baseVersion: number | null;
  createdAt: string;
  retryCount: number;
};

export type OfflineStudent = {
  id: string;
  schoolId?: string;
  deviceId?: string;
  createdBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
  syncStatus?: string;
  lastSyncedAt?: string | null;
  approvalStatus?: string;
  deletedAt?: string | null;
  admissionNo: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  gender: string;
  dateOfBirth: string;
  admissionDate: string;
  previousSchool?: string | null;
  status: string;
  currentAcademicYearId?: string;
  currentClassId?: string;
  currentStreamId?: string;
  emergencyContact?: string;
  medicalNotes?: string | null;
  photoUrl?: string | null;
  supportingDocuments?: string[];
  notes?: string | null;
  guardians?: Array<{ relationship: string; guardian: { fullName: string; phone: string; email?: string; address?: string } }>;
};

export type OfflinePayment = {
  id: string;
  schoolId: string;
  deviceId: string;
  invoiceId: string;
  receiptNo: string;
  amount: number;
  method: string;
  reference?: string | null;
  notes?: string | null;
  receivedBy?: string | null;
  paidAt: string;
  createdBy?: string | null;
  syncStatus: string;
};

export type OfflineExpense = {
  id: string;
  schoolId: string;
  deviceId: string;
  expenseNo: string;
  category: string;
  department?: string | null;
  description: string;
  amount: number;
  method?: string | null;
  payee?: string | null;
  reference?: string | null;
  requestedBy?: string | null;
  budgetId?: string | null;
  spentAt: string;
  approvalStatus: string;
  syncStatus: string;
};

let dbPromise: Promise<Database | null> | null = null;

export async function initializeOfflineStore() {
  await getDatabase();
}

export async function readPendingChanges(): Promise<PendingChange[]> {
  const db = await getDatabase();
  if (!db) return readJson<PendingChange[]>(pendingKey, []);

  const rows = await db.select<Array<{
    id: string;
    entity_type: string;
    entity_id: string;
    operation: string;
    payload_json: string;
    base_version: number | null;
    created_at: string;
    retry_count: number;
  }>>("SELECT id, entity_type, entity_id, operation, payload_json, base_version, created_at, retry_count FROM pending_changes ORDER BY created_at ASC");

  return rows.map((row) => ({
    id: row.id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    operation: row.operation,
    payload: JSON.parse(row.payload_json),
    baseVersion: row.base_version,
    createdAt: row.created_at,
    retryCount: row.retry_count
  }));
}

export async function writePendingChanges(changes: PendingChange[]) {
  const db = await getDatabase();
  if (!db) {
    localStorage.setItem(pendingKey, JSON.stringify(changes));
    return;
  }

  await db.execute("DELETE FROM pending_changes");
  for (const change of changes) {
    await insertPendingChange(db, change);
  }
}

export async function addPendingChange(change: PendingChange, schoolId: string, deviceId: string) {
  const db = await getDatabase();
  if (!db) {
    const current = readJson<PendingChange[]>(pendingKey, []);
    localStorage.setItem(pendingKey, JSON.stringify([...current.filter((item) => item.id !== change.id), change]));
    return;
  }

  await insertPendingChange(db, change, schoolId, deviceId);
}

export async function readLocalStudents(): Promise<OfflineStudent[]> {
  const db = await getDatabase();
  if (!db) return readJson<OfflineStudent[]>(draftStudentKey, []);

  const rows = await db.select<Array<Record<string, unknown>>>("SELECT * FROM students WHERE sync_status = 'PENDING' AND deleted_at IS NULL ORDER BY created_at DESC");
  const students: OfflineStudent[] = [];
  for (const row of rows) {
    const guardians = await db.select<Array<{ relationship: string; full_name: string; phone: string; email: string | null; address: string | null }>>(
      "SELECT sg.relationship, g.full_name, g.phone, g.email, g.address FROM student_guardians sg INNER JOIN guardians g ON g.id = sg.guardian_id WHERE sg.student_id = $1 ORDER BY sg.is_primary DESC",
      [row.id]
    );
    students.push(toStudent(row, guardians));
  }
  return students;
}

export async function upsertLocalStudent(student: OfflineStudent, registration: Record<string, unknown>) {
  const db = await getDatabase();
  if (!db) {
    const current = readJson<OfflineStudent[]>(draftStudentKey, []);
    localStorage.setItem(draftStudentKey, JSON.stringify([student, ...current.filter((item) => item.id !== student.id)]));
    return;
  }

  await db.execute(
    `INSERT INTO students (
      id, school_id, device_id, created_by, created_at, updated_at, version, sync_status, last_synced_at, approval_status, deleted_at,
      admission_no, first_name, middle_name, last_name, gender, date_of_birth, admission_date, previous_school, status,
      current_academic_year_id, current_class_id, current_stream_id, emergency_contact, medical_notes, photo_url, supporting_documents_json, notes
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
    ON CONFLICT(id) DO UPDATE SET
      updated_at = excluded.updated_at,
      sync_status = excluded.sync_status,
      admission_no = excluded.admission_no,
      first_name = excluded.first_name,
      middle_name = excluded.middle_name,
      last_name = excluded.last_name,
      gender = excluded.gender,
      date_of_birth = excluded.date_of_birth,
      admission_date = excluded.admission_date,
      previous_school = excluded.previous_school,
      status = excluded.status,
      current_academic_year_id = excluded.current_academic_year_id,
      current_class_id = excluded.current_class_id,
      current_stream_id = excluded.current_stream_id,
      emergency_contact = excluded.emergency_contact,
      medical_notes = excluded.medical_notes,
      photo_url = excluded.photo_url,
      supporting_documents_json = excluded.supporting_documents_json,
      notes = excluded.notes`,
    [
      student.id,
      student.schoolId,
      student.deviceId,
      student.createdBy,
      student.createdAt,
      student.updatedAt,
      student.version ?? 1,
      student.syncStatus ?? "PENDING",
      student.lastSyncedAt ?? null,
      student.approvalStatus ?? "APPROVED",
      student.deletedAt ?? null,
      student.admissionNo,
      student.firstName,
      student.middleName ?? null,
      student.lastName,
      student.gender,
      student.dateOfBirth,
      student.admissionDate,
      registration.previousSchool ?? null,
      student.status,
      student.currentAcademicYearId ?? null,
      student.currentClassId ?? null,
      student.currentStreamId ?? null,
      student.emergencyContact ?? null,
      student.medicalNotes ?? null,
      registration.photoUrl ?? null,
      JSON.stringify(registration.supportingDocuments ?? []),
      student.notes ?? null
    ]
  );

  const guardian = student.guardians?.[0];
  if (guardian) {
    const guardianId = `${student.id}-guardian`;
    await db.execute(
      `INSERT INTO guardians (id, school_id, device_id, created_by, created_at, updated_at, sync_status, full_name, phone, email, address)
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, $8, $9, $10)
       ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, full_name = excluded.full_name, phone = excluded.phone, email = excluded.email, address = excluded.address`,
      [
        guardianId,
        student.schoolId,
        student.deviceId,
        student.createdBy,
        student.createdAt,
        student.updatedAt,
        guardian.guardian.fullName,
        guardian.guardian.phone,
        guardian.guardian.email ?? null,
        guardian.guardian.address ?? null
      ]
    );
    await db.execute(
      "INSERT OR REPLACE INTO student_guardians (student_id, guardian_id, relationship, is_primary) VALUES ($1, $2, $3, 1)",
      [student.id, guardianId, guardian.relationship]
    );
  }
}

export async function clearLocalStudents() {
  const db = await getDatabase();
  if (!db) {
    localStorage.setItem(draftStudentKey, "[]");
    return;
  }
  await db.execute("DELETE FROM student_guardians WHERE student_id IN (SELECT id FROM students WHERE sync_status = 'PENDING')");
  await db.execute("DELETE FROM guardians WHERE sync_status = 'PENDING'");
  await db.execute("DELETE FROM students WHERE sync_status = 'PENDING'");
}

export async function readLocalPayments(): Promise<OfflinePayment[]> {
  const db = await getDatabase();
  if (!db) return readJson<OfflinePayment[]>(draftPaymentKey, []);
  return db.select<OfflinePayment[]>("SELECT id, school_id as schoolId, device_id as deviceId, invoice_id as invoiceId, receipt_no as receiptNo, amount, method, reference, notes, received_by as receivedBy, paid_at as paidAt, created_by as createdBy, sync_status as syncStatus FROM payments WHERE sync_status = 'PENDING' ORDER BY paid_at DESC");
}

export async function upsertLocalPayment(payment: OfflinePayment) {
  const db = await getDatabase();
  if (!db) {
    const current = readJson<OfflinePayment[]>(draftPaymentKey, []);
    localStorage.setItem(draftPaymentKey, JSON.stringify([payment, ...current.filter((item) => item.id !== payment.id)]));
    return;
  }
  await db.execute(
    `INSERT OR REPLACE INTO payments (id, school_id, device_id, invoice_id, receipt_no, amount, method, reference, notes, received_by, paid_at, created_by, sync_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'PENDING')`,
    [payment.id, payment.schoolId, payment.deviceId, payment.invoiceId, payment.receiptNo, payment.amount, payment.method, payment.reference ?? null, payment.notes ?? null, payment.receivedBy ?? null, payment.paidAt, payment.createdBy ?? null]
  );
}

export async function readLocalExpenses(): Promise<OfflineExpense[]> {
  const db = await getDatabase();
  if (!db) return readJson<OfflineExpense[]>(draftExpenseKey, []);
  return db.select<OfflineExpense[]>("SELECT id, school_id as schoolId, device_id as deviceId, expense_no as expenseNo, category, department, description, amount, method, payee, reference, requested_by as requestedBy, budget_id as budgetId, spent_at as spentAt, approval_status as approvalStatus, sync_status as syncStatus FROM expenses WHERE sync_status = 'PENDING' ORDER BY spent_at DESC");
}

export async function upsertLocalExpense(expense: OfflineExpense) {
  const db = await getDatabase();
  if (!db) {
    const current = readJson<OfflineExpense[]>(draftExpenseKey, []);
    localStorage.setItem(draftExpenseKey, JSON.stringify([expense, ...current.filter((item) => item.id !== expense.id)]));
    return;
  }
  await db.execute(
    `INSERT OR REPLACE INTO expenses (id, school_id, device_id, expense_no, category, department, description, amount, method, payee, reference, requested_by, budget_id, spent_at, approval_status, sync_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 'PENDING')`,
    [expense.id, expense.schoolId, expense.deviceId, expense.expenseNo, expense.category, expense.department ?? null, expense.description, expense.amount, expense.method ?? null, expense.payee ?? null, expense.reference ?? null, expense.requestedBy ?? null, expense.budgetId ?? null, expense.spentAt, expense.approvalStatus]
  );
}

export async function getLastSync() {
  const db = await getDatabase();
  if (!db) return localStorage.getItem(lastSyncKey) ?? "Never";
  const rows = await db.select<Array<{ value: string }>>("SELECT value FROM local_metadata WHERE key = 'lastSync'");
  return rows[0]?.value ?? "Never";
}

export async function setLastSync(value: string) {
  const db = await getDatabase();
  if (!db) {
    localStorage.setItem(lastSyncKey, value);
    return;
  }
  await db.execute("INSERT OR REPLACE INTO local_metadata (key, value) VALUES ('lastSync', $1)", [value]);
}

async function getDatabase() {
  if (!("__TAURI_INTERNALS__" in window)) return null;
  dbPromise ??= Database.load(dbUrl).catch(() => null);
  return dbPromise;
}

async function insertPendingChange(db: Database, change: PendingChange, schoolId = "", deviceId = "") {
  await db.execute(
    `INSERT OR REPLACE INTO pending_changes
     (id, school_id, device_id, entity_type, entity_id, operation, payload_json, base_version, created_at, retry_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [change.id, schoolId, deviceId, change.entityType, change.entityId, change.operation, JSON.stringify(change.payload), change.baseVersion, change.createdAt, change.retryCount]
  );
}

function toStudent(row: Record<string, unknown>, guardians: Array<{ relationship: string; full_name: string; phone: string; email: string | null; address: string | null }>): OfflineStudent {
  return {
    id: String(row.id),
    schoolId: String(row.school_id),
    deviceId: row.device_id ? String(row.device_id) : undefined,
    createdBy: row.created_by ? String(row.created_by) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    version: Number(row.version),
    syncStatus: String(row.sync_status),
    lastSyncedAt: row.last_synced_at ? String(row.last_synced_at) : null,
    approvalStatus: String(row.approval_status),
    deletedAt: row.deleted_at ? String(row.deleted_at) : null,
    admissionNo: String(row.admission_no),
    firstName: String(row.first_name),
    middleName: row.middle_name ? String(row.middle_name) : null,
    lastName: String(row.last_name),
    gender: String(row.gender),
    dateOfBirth: String(row.date_of_birth),
    admissionDate: String(row.admission_date),
    previousSchool: row.previous_school ? String(row.previous_school) : null,
    status: String(row.status),
    currentAcademicYearId: row.current_academic_year_id ? String(row.current_academic_year_id) : undefined,
    currentClassId: row.current_class_id ? String(row.current_class_id) : undefined,
    currentStreamId: row.current_stream_id ? String(row.current_stream_id) : undefined,
    emergencyContact: row.emergency_contact ? String(row.emergency_contact) : undefined,
    medicalNotes: row.medical_notes ? String(row.medical_notes) : null,
    photoUrl: row.photo_url ? String(row.photo_url) : null,
    supportingDocuments: JSON.parse(String(row.supporting_documents_json ?? "[]")),
    notes: row.notes ? String(row.notes) : null,
    guardians: guardians.map((guardian) => ({
      relationship: guardian.relationship,
      guardian: {
        fullName: guardian.full_name,
        phone: guardian.phone,
        email: guardian.email ?? undefined,
        address: guardian.address ?? undefined
      }
    }))
  };
}

function readJson<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "") as T;
  } catch {
    return fallback;
  }
}
