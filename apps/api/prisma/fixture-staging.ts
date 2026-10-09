import { PrismaClient } from "@prisma/client";
import { randomBytes, pbkdf2Sync } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

const prisma = new PrismaClient();
const fixtureSchoolCode = "AETHINA-QA-STAGING";
const fixtureEmailDomain = "aethina.invalid";

const permissions = [
  "auth.login", "users.manage", "school-config.manage", "academic-setup.manage", "students.read", "students.manage",
  "portal-credentials.reset", "audit.read", "dashboard.read", "finance.read", "finance.manage", "budget.manage",
  "approval.review", "risk.review", "academics.read", "academics.manage", "marks.entry", "marks.review",
  "results.approve", "report-cards.publish", "timetable.manage", "attendance.manage", "attendance.correction.review", "inventory.manage",
  "payroll.read", "payroll.manage", "notifications.manage", "announcements.manage", "portal.access"
] as const;

const rolePermissions: Record<string, readonly string[]> = {
  "School Administrator": ["auth.login", "users.manage", "school-config.manage", "students.read", "audit.read", "dashboard.read", "finance.read", "budget.manage", "inventory.manage", "payroll.read", "announcements.manage"],
  "Head Teacher": ["auth.login", "dashboard.read", "students.read", "audit.read", "attendance.manage", "attendance.correction.review", "approval.review", "academics.read", "marks.review", "announcements.manage"],
  "Dean of Studies": ["auth.login", "dashboard.read", "academic-setup.manage", "students.read", "academics.read", "academics.manage", "marks.review", "results.approve", "report-cards.publish", "timetable.manage"],
  "Bursar/Accountant": ["auth.login", "dashboard.read", "students.read", "finance.read", "finance.manage", "budget.manage", "payroll.read", "payroll.manage"],
  "Teacher": ["auth.login", "dashboard.read", "students.read", "attendance.manage", "academics.read", "marks.entry"],
  "Class Teacher": ["auth.login", "dashboard.read", "students.read", "academics.read", "marks.entry", "marks.review", "attendance.manage"],
  "Student/Parent Portal User": ["auth.login", "portal.access"]
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function hashSecret(secret: string): string {
  const salt = randomBytes(16).toString("base64url");
  const hash = pbkdf2Sync(secret, salt, 210_000, 32, "sha256").toString("base64url");
  return `pbkdf2$210000$${salt}$${hash}`;
}

function generatedPassword(): string {
  return `${randomBytes(24).toString("base64url")}Qa!9`;
}

function generatedPin(): string {
  return String(10_000_000 + (randomBytes(4).readUInt32BE(0) % 90_000_000));
}

function assertStagingTarget() {
  const databaseUrl = required("DATABASE_URL");
  const expectedProject = required("AETHINA_EXPECTED_NEON_PROJECT_ID");
  const actualProject = required("NEON_PROJECT_ID");
  const handoffPath = required("AETHINA_STAGING_HANDOFF_PATH");
  const resolvedHandoff = resolve(handoffPath);
  const resolvedRepository = resolve(process.cwd());
  let databaseHost = "";
  try {
    databaseHost = new URL(databaseUrl).hostname.toLowerCase();
  } catch {
    throw new Error("DATABASE_URL must be a valid staging PostgreSQL URL.");
  }

  if (
    process.env.AETHINA_STAGING_FIXTURE_APPROVED !== "true" ||
    process.env.AETHINA_STAGING_FIXTURE_RUNTIME !== "staging" ||
    process.env.AETHINA_STAGING_FIXTURE_TARGET !== "aethina-sms-staging" ||
    process.env.AETHINA_STAGING_FIXTURE_DATABASE_IDENTITY !== "aethina-sms-staging" ||
    process.env.VERCEL_ENV !== "preview" ||
    process.env.NODE_ENV === "production" ||
    actualProject !== expectedProject ||
    !databaseHost.endsWith(".neon.tech") ||
    /production/i.test(databaseUrl) ||
    !isAbsolute(handoffPath) ||
    resolvedHandoff.toLowerCase().startsWith(resolvedRepository.toLowerCase())
  ) {
    throw new Error("Staging fixture requires the exact isolated staging target, approval marker, expected Neon identity, and an external handoff path.");
  }

  return resolvedHandoff;
}

async function main() {
  const handoffPath = assertStagingTarget();
  const [schoolCount, userCount, studentCount, paymentCount] = await Promise.all([
    prisma.school.count(), prisma.user.count(), prisma.student.count(), prisma.payment.count()
  ]);
  if (schoolCount !== 0 || userCount !== 0 || studentCount !== 0 || paymentCount !== 0) {
    throw new Error("Staging fixture refuses a non-empty database. A separately approved staging reset is required.");
  }

  const credentials = {
    administrator: generatedPassword(), headTeacher: generatedPassword(), dos: generatedPassword(), bursar: generatedPassword(),
    teacher: generatedPassword(), classTeacher: generatedPassword(), kioskTeacher: generatedPassword(), portal: generatedPassword(),
    kioskPin: generatedPin()
  };

  const summary = await prisma.$transaction(async (tx) => {
    await tx.permission.createMany({ data: permissions.map((key) => ({ key, description: `QA fixture permission: ${key}` })), skipDuplicates: true });
    const permissionRows = await tx.permission.findMany({ where: { key: { in: [...permissions] } } });
    const permissionByKey = new Map(permissionRows.map((permission) => [permission.key, permission.id]));
    const school = await tx.school.create({ data: { name: "Aethina QA Secondary School", code: fixtureSchoolCode, admissionNumberPrefix: "QA", email: `office@${fixtureEmailDomain}`, address: "Fictional QA Campus" } });
    await tx.financialSetting.create({ data: { schoolId: school.id } });

    const roles = new Map<string, string>();
    for (const [name, keys] of Object.entries(rolePermissions)) {
      const role = await tx.role.create({ data: { schoolId: school.id, name, description: "Fictional staging QA role" } });
      roles.set(name, role.id);
      await tx.rolePermission.createMany({ data: keys.map((key) => ({ roleId: role.id, permissionId: permissionByKey.get(key)! })) });
    }

    const createUser = async (key: keyof typeof credentials, local: string, displayName: string, roleNames: string[]) => {
      const user = await tx.user.create({ data: { schoolId: school.id, email: `${local}@${fixtureEmailDomain}`, displayName, passwordHash: hashSecret(credentials[key]), mustChangePassword: false } });
      await tx.userRole.createMany({ data: roleNames.map((roleName) => ({ userId: user.id, roleId: roles.get(roleName)! })) });
      return user;
    };

    const administrator = await createUser("administrator", "qa-admin", "QA Administrator", ["School Administrator"]);
    const headTeacher = await createUser("headTeacher", "qa-head", "QA Head Teacher", ["Head Teacher"]);
    const dos = await createUser("dos", "qa-dos", "QA Academic Administrator", ["Dean of Studies"]);
    const bursar = await createUser("bursar", "qa-bursar", "QA Bursar", ["Bursar/Accountant"]);
    const teacherUser = await createUser("teacher", "qa-teacher", "QA Teacher", ["Teacher"]);
    const classTeacherUser = await createUser("classTeacher", "qa-class-teacher", "QA Class Teacher", ["Teacher", "Class Teacher"]);
    const kioskUser = await createUser("kioskTeacher", "qa-kiosk", "QA Attendance Kiosk", ["Teacher"]);

    const teacher = await tx.teacher.create({ data: { schoolId: school.id, userId: teacherUser.id, staffId: "QA-TEACHER-01", firstName: "Taylor", lastName: "Fiction", pinHash: hashSecret(generatedPin()) } });
    const classTeacher = await tx.teacher.create({ data: { schoolId: school.id, userId: classTeacherUser.id, staffId: "QA-CLASS-01", firstName: "Casey", lastName: "Fiction", pinHash: hashSecret(generatedPin()) } });
    const kioskTeacher = await tx.teacher.create({ data: { schoolId: school.id, userId: kioskUser.id, staffId: "QA-KIOSK-01", firstName: "Avery", lastName: "Fiction", pinHash: hashSecret(credentials.kioskPin) } });

    const academicYear = await tx.academicYear.create({ data: { schoolId: school.id, name: "QA Academic Year 2026", startsAt: new Date("2026-01-01"), endsAt: new Date("2026-12-31"), isActive: true } });
    const term = await tx.term.create({ data: { academicYearId: academicYear.id, name: "QA Term One", startsAt: new Date("2026-01-01"), endsAt: new Date("2026-04-30"), isCurrent: true } });
    const classRow = await tx.class.create({ data: { schoolId: school.id, name: "QA Form One", level: 1 } });
    const stream = await tx.stream.create({ data: { schoolId: school.id, classId: classRow.id, name: "QA East" } });
    await tx.school.update({ where: { id: school.id }, data: { currentAcademicYearId: academicYear.id, currentTermId: term.id } });
    const mathematics = await tx.subject.create({ data: { schoolId: school.id, teacherId: classTeacher.id, code: "QA-MATH", name: "QA Mathematics" } });
    const science = await tx.subject.create({ data: { schoolId: school.id, teacherId: teacher.id, code: "QA-SCI", name: "QA Science" } });
    await tx.teacherSubjectAssignment.createMany({ data: [
      { schoolId: school.id, teacherId: classTeacher.id, subjectId: mathematics.id, classId: classRow.id, streamId: stream.id },
      { schoolId: school.id, teacherId: teacher.id, subjectId: science.id, classId: classRow.id, streamId: stream.id }
    ] });
    await tx.classTeacherAssignment.create({ data: { schoolId: school.id, teacherId: classTeacher.id, classId: classRow.id, streamId: stream.id, academicYearId: academicYear.id, termId: term.id } });

    const guardian = await tx.guardian.create({ data: { schoolId: school.id, fullName: "QA Guardian One", phone: "+00000000001", email: `guardian@${fixtureEmailDomain}` } });
    const students = await Promise.all(["Amina", "Biko", "Chai"].map((firstName, index) => tx.student.create({ data: { schoolId: school.id, admissionNo: `QA-2026-${String(index + 1).padStart(3, "0")}`, firstName, lastName: "Fiction", gender: "OTHER", dateOfBirth: new Date(`201${index + 1}-01-01`), admissionDate: new Date("2026-01-01"), currentAcademicYearId: academicYear.id, currentClassId: classRow.id, currentStreamId: stream.id, createdBy: administrator.id } })));
    await tx.studentGuardian.createMany({ data: students.map((student, index) => ({ studentId: student.id, guardianId: guardian.id, relationship: index === 0 ? "Parent" : "Guardian", isPrimary: index === 0 })) });
    await tx.studentPortalCredential.create({ data: { studentId: students[0].id, username: "qa-portal-student", passwordHash: hashSecret(credentials.portal), mustReset: false } });

    const fee = await tx.feeStructure.create({ data: { schoolId: school.id, academicYearId: academicYear.id, termId: term.id, classId: classRow.id, category: "TUITION", name: "QA Tuition", amount: 100_000, dueDate: new Date("2026-02-01") } });
    const invoicePlans = [{ paid: 0, status: "ISSUED" }, { paid: 40_000, status: "PARTIALLY_PAID" }, { paid: 100_000, status: "PAID" }];
    const invoices = [] as Array<{ id: string; studentId: string }>;
    for (const [index, student] of students.entries()) {
      const plan = invoicePlans[index];
      const invoice = await tx.studentInvoice.create({ data: { schoolId: school.id, studentId: student.id, termId: term.id, feeStructureId: fee.id, invoiceNo: `QA-INV-2026-${index + 1}`, amount: 100_000, amountPaid: plan.paid, balance: 100_000 - plan.paid, status: plan.status, dueDate: new Date("2026-02-01"), createdBy: bursar.id } });
      invoices.push({ id: invoice.id, studentId: student.id });
      await tx.studentInvoiceLine.create({ data: { invoiceId: invoice.id, description: "QA Tuition", category: "TUITION", amount: 100_000 } });
      if (plan.paid > 0) {
        const payment = await tx.payment.create({ data: { schoolId: school.id, invoiceId: invoice.id, receiptNo: `QA-RCT-2026-${index + 1}`, amount: plan.paid, method: "QA_TRANSFER", reference: `QA-PAY-${index + 1}`, paidAt: new Date("2026-01-20"), receivedBy: bursar.displayName, createdBy: bursar.id } });
        await tx.receipt.create({ data: { schoolId: school.id, paymentId: payment.id, receiptNo: `QA-RCT-2026-${index + 1}`, displayNo: `QA-RCT-2026-${index + 1}` } });
      }
    }

    const budget = await tx.budget.create({ data: { schoolId: school.id, createdBy: bursar.id, name: "QA Learning Budget", academicYearId: academicYear.id, termId: term.id, category: "QA", amount: 500_000, spentAmount: 20_000, committedAmount: 30_000, year: 2026 } });
    const budgetRequest = await tx.budgetRequest.create({ data: { schoolId: school.id, budgetId: budget.id, requestedBy: teacher.id, createdBy: teacherUser.id, amount: 30_000, reason: "Fictional QA learning materials" } });
    await tx.approvalWorkflow.create({ data: { schoolId: school.id, entityType: "BUDGET_REQUEST", entityId: budgetRequest.id, requestedBy: teacherUser.id, currentApprover: administrator.id } });
    await tx.expense.create({ data: { schoolId: school.id, createdBy: bursar.id, expenseNo: "QA-EXP-2026-1", category: "QA Supplies", description: "Fictional QA expense", amount: 20_000, method: "QA_TRANSFER", payee: "Fictional QA Supplier", reference: "QA-EXP-REF-1", budgetId: budget.id, spentAt: new Date("2026-01-22"), approvalStatus: "APPROVED" } });

    const examination = await tx.examination.create({ data: { schoolId: school.id, termId: term.id, academicYearId: academicYear.id, name: "QA Midterm", examinationType: "QA", status: "PUBLISHED", startsAt: new Date("2026-02-10"), endsAt: new Date("2026-02-14"), publishedAt: new Date("2026-02-15"), approvedBy: dos.id, approvedAt: new Date("2026-02-15") } });
    const [draftAssessment, submittedAssessment, publishedAssessment] = await Promise.all([
      tx.assessment.create({ data: { schoolId: school.id, termId: term.id, examinationId: examination.id, subjectId: mathematics.id, classId: classRow.id, streamId: stream.id, teacherId: classTeacher.id, name: "QA Draft Mathematics", maxScore: 100, status: "DRAFT" } }),
      tx.assessment.create({ data: { schoolId: school.id, termId: term.id, examinationId: examination.id, subjectId: science.id, classId: classRow.id, streamId: stream.id, teacherId: teacher.id, name: "QA Submitted Science", maxScore: 100, status: "SUBMITTED", submittedBy: teacherUser.id, submittedAt: new Date("2026-02-11") } }),
      tx.assessment.create({ data: { schoolId: school.id, termId: term.id, examinationId: examination.id, subjectId: mathematics.id, classId: classRow.id, streamId: stream.id, teacherId: classTeacher.id, name: "QA Published Mathematics", maxScore: 100, status: "PUBLISHED", submittedBy: classTeacherUser.id, submittedAt: new Date("2026-02-11"), reviewedBy: dos.id, reviewedAt: new Date("2026-02-12"), publishedAt: new Date("2026-02-15") } })
    ]);
    await tx.mark.createMany({ data: [
      { schoolId: school.id, studentId: students[0].id, assessmentId: draftAssessment.id, subjectId: mathematics.id, score: 61, status: "DRAFT", createdBy: classTeacherUser.id },
      { schoolId: school.id, studentId: students[1].id, assessmentId: submittedAssessment.id, subjectId: science.id, score: 74, status: "SUBMITTED", submittedBy: teacherUser.id, submittedAt: new Date("2026-02-11"), createdBy: teacherUser.id },
      { schoolId: school.id, studentId: students[2].id, assessmentId: publishedAssessment.id, subjectId: mathematics.id, score: 88, status: "PUBLISHED", submittedBy: classTeacherUser.id, submittedAt: new Date("2026-02-11"), reviewedBy: dos.id, reviewedAt: new Date("2026-02-12"), publishedAt: new Date("2026-02-15"), createdBy: classTeacherUser.id }
    ] });
    await tx.timetableEntry.createMany({ data: [
      { schoolId: school.id, academicYearId: academicYear.id, termId: term.id, classId: classRow.id, streamId: stream.id, subjectId: mathematics.id, teacherId: classTeacher.id, dayOfWeek: 1, periodNumber: 1, startsAt: "08:00", endsAt: "08:40", createdBy: administrator.id },
      { schoolId: school.id, academicYearId: academicYear.id, termId: term.id, classId: classRow.id, streamId: stream.id, subjectId: science.id, teacherId: teacher.id, dayOfWeek: 2, periodNumber: 2, startsAt: "08:45", endsAt: "09:25", createdBy: administrator.id }
    ] });

    const attendance = await tx.teacherAttendance.create({ data: { schoolId: school.id, teacherId: kioskTeacher.id, attendanceDate: new Date("2026-02-16"), status: "CORRECTION_REQUESTED", checkInAt: new Date("2026-02-16T08:05:00Z"), createdBy: kioskUser.id } });
    await tx.teacherAttendance.update({ where: { id: attendance.id }, data: { correctionRequestedBy: kioskUser.id, correctionReason: "Fictional QA correction request", requestedCheckInAt: new Date("2026-02-16T08:00:00Z") } });
    await tx.approvalWorkflow.create({ data: { schoolId: school.id, entityType: "TEACHER_ATTENDANCE_CORRECTION", entityId: attendance.id, requestedBy: kioskUser.id, currentApprover: headTeacher.id } });

    const supplier = await tx.inventorySupplier.create({ data: { schoolId: school.id, name: "Fictional QA Supplier", email: `supplier@${fixtureEmailDomain}` } });
    const item = await tx.inventoryItem.create({ data: { schoolId: school.id, createdBy: administrator.id, sku: "QA-BOOK-01", name: "QA Exercise Book", category: "QA", quantity: 30, reorderLevel: 10, unitCost: 500 } });
    await tx.stockMovement.create({ data: { schoolId: school.id, inventoryItemId: item.id, movementType: "IN", quantity: 30, supplierId: supplier.id, unitCost: 500, reason: "Fictional QA opening stock", createdBy: administrator.id } });
    const payrollProfile = await tx.payrollProfile.create({ data: { schoolId: school.id, teacherId: classTeacher.id, employeeNo: "QA-EMP-01", department: "QA Academics", baseSalary: 75_000, paymentMethod: "QA_TRANSFER", paymentAccount: "QA-ACCOUNT-ONLY", effectiveAt: new Date("2026-01-01"), createdBy: bursar.id } });
    const payrollRun = await tx.payrollRun.create({ data: { schoolId: school.id, period: "2026-02", status: "SUBMITTED", grossTotal: 75_000, deductionTotal: 5_000, netTotal: 70_000, createdBy: bursar.id, submittedBy: bursar.id, submittedAt: new Date("2026-02-28"), notes: "Fictional QA payroll" } });
    await tx.payrollRecord.create({ data: { schoolId: school.id, teacherId: classTeacher.id, payrollProfileId: payrollProfile.id, payrollRunId: payrollRun.id, period: "2026-02", grossPay: 75_000, deductions: 5_000, netPay: 70_000, status: "SUBMITTED", createdBy: bursar.id } });
    await tx.notificationTemplate.create({ data: { schoolId: school.id, name: "QA Portal Notice", channel: "IN_APP", body: "A fictional QA notice is available.", createdBy: administrator.id } });
    await tx.announcement.create({ data: { schoolId: school.id, title: "QA Stream Notice", message: "Fictional announcement for QA East only.", audience: "PORTAL", classId: classRow.id, streamId: stream.id, academicYearId: academicYear.id, publishAt: new Date("2026-02-01"), createdBy: administrator.id } });
    await tx.notification.create({ data: { schoolId: school.id, recipientType: "STUDENT", recipientId: students[0].id, channel: "IN_APP", category: "QA", title: "QA Direct Notice", body: "Fictional direct portal notice.", status: "SENT", sentAt: new Date("2026-02-01"), createdBy: administrator.id } });

    return { schoolId: school.id, administrator, headTeacher, dos, bursar, teacherUser, classTeacherUser, kioskUser, kioskTeacher, student: students[0], classRow, stream, invoices };
  }, { maxWait: 10_000, timeout: 60_000 });

  await writeFile(handoffPath, JSON.stringify({
    fixture: "Aethina staging QA only", schoolCode: fixtureSchoolCode, schoolId: summary.schoolId,
    users: {
      administrator: { email: summary.administrator.email, password: credentials.administrator }, headTeacher: { email: summary.headTeacher.email, password: credentials.headTeacher },
      dos: { email: summary.dos.email, password: credentials.dos }, bursar: { email: summary.bursar.email, password: credentials.bursar },
      teacher: { email: summary.teacherUser.email, password: credentials.teacher }, classTeacher: { email: summary.classTeacherUser.email, password: credentials.classTeacher },
      kioskTeacher: { email: summary.kioskUser.email, password: credentials.kioskTeacher, staffId: summary.kioskTeacher.staffId, pin: credentials.kioskPin },
      portal: { username: "qa-portal-student", password: credentials.portal }
    }
  }, null, 2), { mode: 0o600 });

  console.log("Staging QA fixture completed. Credentials were written only to the configured external handoff path.");
}

main()
  .catch((error) => { console.error(error instanceof Error ? error.message : "Staging fixture failed."); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
