import { PrismaClient } from "@prisma/client";

const expectedDatabase = "aethina_ui_b";
const prisma = new PrismaClient();

function assertDisposableUiDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (process.env.AETHINA_UI_B_FIXTURE_APPROVED !== "true" || process.env.NODE_ENV !== "development" || !databaseUrl) {
    throw new Error("The UI-B fixture requires explicit local-development approval.");
  }
  const parsed = new URL(databaseUrl);
  const isLocalhost = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  if (!isLocalhost || parsed.port !== "55432" || parsed.pathname !== `/${expectedDatabase}`) {
    throw new Error("The UI-B fixture may only target the disposable local aethina_ui_b database.");
  }
}

async function assessment(input: {
  schoolId: string;
  termId: string;
  examinationId: string;
  subjectId: string;
  classId: string;
  streamId: string;
  teacherId: string;
  name: string;
  status: string;
  submittedBy?: string;
  submittedAt?: Date;
}) {
  const existing = await prisma.assessment.findFirst({ where: { schoolId: input.schoolId, name: input.name } });
  if (existing) return prisma.assessment.update({ where: { id: existing.id }, data: input });
  return prisma.assessment.create({ data: { ...input, maxScore: 100, weight: 20, passMark: 50 } });
}

async function main() {
  assertDisposableUiDatabase();
  const school = await prisma.school.findUniqueOrThrow({ where: { code: "AETHINA-DEMO" } });
  const [term, academicYear, standardOne, standardTwo, mathematics, teacher, dos] = await Promise.all([
    prisma.term.findFirstOrThrow({ where: { academicYear: { schoolId: school.id }, isCurrent: true } }),
    prisma.academicYear.findFirstOrThrow({ where: { schoolId: school.id, isActive: true } }),
    prisma.class.findFirstOrThrow({ where: { schoolId: school.id, name: "Senior One" } }),
    prisma.class.findFirstOrThrow({ where: { schoolId: school.id, name: "Senior Two" } }),
    prisma.subject.findFirstOrThrow({ where: { schoolId: school.id, code: "MATH" } }),
    prisma.teacher.findUniqueOrThrow({ where: { staffId: "TCH-001" } }),
    prisma.user.findUniqueOrThrow({ where: { email: "dos@satelitesecondary.test" } })
  ]);
  const primaryStream = await prisma.stream.findFirstOrThrow({ where: { classId: standardOne.id, name: "East" } });
  await prisma.stream.upsert({
    where: { classId_name: { classId: standardTwo.id, name: "West" } },
    update: {},
    create: { schoolId: school.id, classId: standardTwo.id, name: "West" }
  });
  const examination = await prisma.examination.upsert({
    where: { id: "00000000-0000-4000-8000-00000000b001" },
    update: { status: "DRAFT", name: "Term 1 Academic Practice", startsAt: new Date("2026-03-02"), endsAt: new Date("2026-03-06") },
    create: {
      id: "00000000-0000-4000-8000-00000000b001",
      schoolId: school.id,
      termId: term.id,
      academicYearId: academicYear.id,
      name: "Term 1 Academic Practice",
      examinationType: "Continuous Assessment",
      status: "DRAFT",
      description: "Fictional local-only UI-B assessment workflow.",
      startsAt: new Date("2026-03-02"),
      endsAt: new Date("2026-03-06")
    }
  });
  const base = { schoolId: school.id, termId: term.id, examinationId: examination.id, subjectId: mathematics.id, classId: standardOne.id, streamId: primaryStream.id, teacherId: teacher.id };
  const [notStarted, partialDraft, submitted] = await Promise.all([
    assessment({ ...base, name: "Mathematics skills check", status: "DRAFT" }),
    assessment({ ...base, name: "Mathematics practice draft", status: "DRAFT" }),
    assessment({ ...base, name: "Mathematics review sample", status: "SUBMITTED", submittedBy: teacher.userId ?? undefined, submittedAt: new Date("2026-03-05T10:00:00Z") })
  ]);
  const students = await prisma.student.findMany({ where: { schoolId: school.id, currentClassId: standardOne.id, currentStreamId: primaryStream.id, status: "ACTIVE", deletedAt: null }, orderBy: { admissionNo: "asc" } });
  await prisma.mark.deleteMany({ where: { assessmentId: notStarted.id } });
  const partialStudents = students.slice(0, 5);
  const submittedStudents = students.slice(0, 12);
  for (const [index, student] of partialStudents.entries()) {
    await prisma.mark.upsert({
      where: { studentId_assessmentId: { studentId: student.id, assessmentId: partialDraft.id } },
      update: { score: 54 + index * 6, status: "DRAFT", submittedAt: null, reviewedAt: null, publishedAt: null },
      create: { schoolId: school.id, studentId: student.id, assessmentId: partialDraft.id, subjectId: mathematics.id, score: 54 + index * 6, status: "DRAFT", createdBy: teacher.userId ?? undefined }
    });
  }
  for (const [index, student] of submittedStudents.entries()) {
    await prisma.mark.upsert({
      where: { studentId_assessmentId: { studentId: student.id, assessmentId: submitted.id } },
      update: { score: 52 + (index % 7) * 6, status: "SUBMITTED", submittedBy: teacher.userId ?? undefined, submittedAt: new Date("2026-03-05T10:00:00Z"), reviewedAt: null, publishedAt: null },
      create: { schoolId: school.id, studentId: student.id, assessmentId: submitted.id, subjectId: mathematics.id, score: 52 + (index % 7) * 6, status: "SUBMITTED", createdBy: teacher.userId ?? undefined, submittedBy: teacher.userId ?? undefined, submittedAt: new Date("2026-03-05T10:00:00Z") }
    });
  }
  await prisma.approvalWorkflow.upsert({
    where: { entityId: submitted.id },
    update: { status: "SUBMITTED", currentApprover: dos.id },
    create: { schoolId: school.id, entityType: "ASSESSMENT_RESULTS", entityId: submitted.id, requestedBy: teacher.userId ?? dos.id, currentApprover: dos.id, status: "SUBMITTED" }
  });
  console.log("Prepared isolated UI-B academic fixture: draft, partial, submitted, published, and timetable states.");
}

main()
  .catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; })
  .finally(async () => prisma.$disconnect());
