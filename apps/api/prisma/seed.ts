import { PrismaClient } from "@prisma/client";
import { randomBytes, pbkdf2Sync } from "node:crypto";
import { loadRootEnv } from "../scripts/env.js";

loadRootEnv();

const prisma = new PrismaClient();

function hashSecret(secret: string): string {
  const salt = randomBytes(16).toString("base64url");
  const hash = pbkdf2Sync(secret, salt, 210_000, 32, "sha256").toString("base64url");
  return `pbkdf2$210000$${salt}$${hash}`;
}

function ugandaGrade(score: number): string {
  if (score >= 80) return "D1";
  if (score >= 75) return "D2";
  if (score >= 70) return "C3";
  if (score >= 65) return "C4";
  if (score >= 60) return "C5";
  if (score >= 50) return "C6";
  if (score >= 45) return "P7";
  if (score >= 35) return "P8";
  return "F9";
}

async function upsertFee(data: {
  schoolId: string;
  academicYearId: string;
  termId: string;
  classId: string;
  category: string;
  name: string;
  description: string;
  amount: number;
  isMandatory: boolean;
  dueDate: Date;
  isActive: boolean;
}) {
  const existing = await prisma.feeStructure.findFirst({
    where: {
      schoolId: data.schoolId,
      academicYearId: data.academicYearId,
      termId: data.termId,
      classId: data.classId,
      category: data.category,
      name: data.name
    }
  });
  if (existing) {
    return prisma.feeStructure.update({ where: { id: existing.id }, data });
  }
  return prisma.feeStructure.create({ data });
}

async function main() {
  const isLocalDevelopment = process.env.NODE_ENV === "development";
  const isExplicitNeonDemoSeed = process.env.AETHINA_DEMO_SEED === "true" && (process.env.DATABASE_URL ?? "").includes("neon.tech");
  if (!isLocalDevelopment && !isExplicitNeonDemoSeed) {
    throw new Error("Seed data can only be loaded for local development or an explicitly flagged Neon demo database.");
  }

  const school = await prisma.school.upsert({
    where: { code: "AETHINA-DEMO" },
    update: { name: "Satelite Secondary School", admissionNumberPrefix: "SAT", phone: "+256 700 100 100", email: "office@satelitesecondary.test", address: "Plot 14, Kira Road, Kampala, Uganda" },
    create: { name: "Satelite Secondary School", code: "AETHINA-DEMO", admissionNumberPrefix: "SAT", phone: "+256 700 100 100", email: "office@satelitesecondary.test", address: "Plot 14, Kira Road, Kampala, Uganda" }
  });

  const permissions = await Promise.all(
    [
      "auth.login",
      "users.manage",
      "school-config.manage",
      "admissions.manage",
      "academic-setup.manage",
      "teacher-subjects.manage",
      "class-teachers.manage",
      "students.read",
      "students.manage",
      "students.promote",
      "portal-credentials.reset",
      "audit.read",
      "dashboard.read",
      "finance.read",
      "finance.manage",
      "budget.manage",
      "approval.review",
      "risk.review",
      "academics.read",
      "academics.manage",
      "marks.entry",
      "marks.review",
      "results.approve",
      "report-cards.prepare",
      "report-cards.publish",
      "timetable.manage",
      "attendance.manage",
      "sync.review",
      "inventory.manage",
      "payroll.read",
      "payroll.manage",
      "notifications.manage",
      "announcements.manage",
      "portal.access"
    ].map((key) =>
      prisma.permission.upsert({ where: { key }, update: {}, create: { key, description: `Allows ${key}` } })
    )
  );
  const permissionByKey = new Map(permissions.map((permission) => [permission.key, permission]));

  const rolePermissionMap: Record<string, string[]> = {
    "Super Administrator": Array.from(permissionByKey.keys()),
    "School Administrator": ["auth.login", "users.manage", "dashboard.read", "school-config.manage", "students.read", "audit.read", "approval.review", "risk.review", "finance.read", "budget.manage", "inventory.manage", "payroll.read", "announcements.manage", "sync.review"],
    "Head Teacher": ["auth.login", "dashboard.read", "students.read", "audit.read", "attendance.manage", "approval.review", "academics.read", "marks.review", "announcements.manage"],
    "Dean of Studies": ["auth.login", "dashboard.read", "admissions.manage", "academic-setup.manage", "teacher-subjects.manage", "class-teachers.manage", "students.read", "students.manage", "students.promote", "portal-credentials.reset", "academics.read", "academics.manage", "marks.review", "results.approve", "report-cards.publish", "timetable.manage", "announcements.manage"],
    "Lower School Dean of Studies": ["auth.login", "dashboard.read", "admissions.manage", "academic-setup.manage", "teacher-subjects.manage", "class-teachers.manage", "students.read", "students.manage", "students.promote", "portal-credentials.reset", "academics.read", "academics.manage", "marks.review", "results.approve", "report-cards.publish", "timetable.manage", "announcements.manage"],
    "Middle School Dean of Studies": ["auth.login", "dashboard.read", "admissions.manage", "academic-setup.manage", "teacher-subjects.manage", "class-teachers.manage", "students.read", "students.manage", "students.promote", "portal-credentials.reset", "academics.read", "academics.manage", "marks.review", "results.approve", "report-cards.publish", "timetable.manage", "announcements.manage"],
    "Upper School Dean of Studies": ["auth.login", "dashboard.read", "admissions.manage", "academic-setup.manage", "teacher-subjects.manage", "class-teachers.manage", "students.read", "students.manage", "students.promote", "portal-credentials.reset", "academics.read", "academics.manage", "marks.review", "results.approve", "report-cards.publish", "timetable.manage", "announcements.manage"],
    "Class Teacher": ["auth.login", "students.read", "academics.read", "marks.review", "report-cards.prepare", "attendance.manage"],
    "Teacher": ["auth.login", "students.read", "attendance.manage", "academics.read", "marks.entry"],
    "Bursar/Accountant": ["auth.login", "dashboard.read", "students.read", "finance.read", "finance.manage", "budget.manage", "payroll.read", "payroll.manage"],
    "Receptionist": ["auth.login", "students.read", "students.manage", "portal-credentials.reset"],
    "Student/Parent Portal User": ["auth.login", "portal.access"]
  };

  for (const [roleName, permissionKeys] of Object.entries(rolePermissionMap)) {
    const role = await prisma.role.upsert({
      where: { schoolId_name: { schoolId: school.id, name: roleName } },
      update: {},
      create: { schoolId: school.id, name: roleName, description: `${roleName} role` }
    });
    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id, permission: { key: { notIn: permissionKeys } } }
    });
    await Promise.all(permissionKeys.map((key) => {
      const permission = permissionByKey.get(key);
      if (!permission) return Promise.resolve();
      return prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id }
      });
    }));
  }

  const adminRole = await prisma.role.upsert({
    where: { schoolId_name: { schoolId: school.id, name: "School Administrator" } },
    update: {},
    create: { schoolId: school.id, name: "School Administrator", description: "Full development administrator" }
  });

  const admin = await prisma.user.upsert({
    where: { email: "admin@aethina.test" },
    update: { displayName: "Agnes Namatovu", passwordHash: hashSecret("AdminPass123"), mustChangePassword: false, isActive: true },
    create: {
      schoolId: school.id,
      email: "admin@aethina.test",
      displayName: "Agnes Namatovu",
      passwordHash: hashSecret("AdminPass123")
    }
  });

  const dosRole = await prisma.role.upsert({
    where: { schoolId_name: { schoolId: school.id, name: "Dean of Studies" } },
    update: {},
    create: { schoolId: school.id, name: "Dean of Studies", description: "Academic operations and final report-card approval" }
  });
  const dos = await prisma.user.upsert({
    where: { email: "dos@satelitesecondary.test" },
    update: { displayName: "Michael Ssemakula", passwordHash: hashSecret("DosPass123"), mustChangePassword: false, isActive: true },
    create: {
      schoolId: school.id,
      email: "dos@satelitesecondary.test",
      displayName: "Michael Ssemakula",
      passwordHash: hashSecret("DosPass123"),
      mustChangePassword: false
    }
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: dos.id, roleId: dosRole.id } },
    update: {},
    create: { userId: dos.id, roleId: dosRole.id }
  });

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id }
  });

  const bursarRole = await prisma.role.upsert({
    where: { schoolId_name: { schoolId: school.id, name: "Bursar/Accountant" } },
    update: {},
    create: { schoolId: school.id, name: "Bursar/Accountant", description: "Finance and payroll demo role" }
  });
  const bursar = await prisma.user.upsert({
    where: { email: "bursar@aethina.test" },
    update: { displayName: "Peter Kato", passwordHash: hashSecret("BursarPass123"), mustChangePassword: false, isActive: true },
    create: {
      schoolId: school.id,
      email: "bursar@aethina.test",
      displayName: "Peter Kato",
      passwordHash: hashSecret("BursarPass123"),
      mustChangePassword: false
    }
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: bursar.id, roleId: bursarRole.id } },
    update: {},
    create: { userId: bursar.id, roleId: bursarRole.id }
  });

  const teacherRole = await prisma.role.upsert({
    where: { schoolId_name: { schoolId: school.id, name: "Teacher" } },
    update: {},
    create: { schoolId: school.id, name: "Teacher", description: "Teaching staff" }
  });
  const classTeacherRole = await prisma.role.upsert({
    where: { schoolId_name: { schoolId: school.id, name: "Class Teacher" } },
    update: {},
    create: { schoolId: school.id, name: "Class Teacher", description: "Class teacher report preparation role" }
  });

  const teacherUsers = await Promise.all([
    prisma.user.upsert({
      where: { email: "grace.otieno@aethina.test" },
      update: { displayName: "Sarah Namutebi", passwordHash: hashSecret("TeacherPass123"), isActive: true },
      create: { schoolId: school.id, email: "grace.otieno@aethina.test", displayName: "Sarah Namutebi", passwordHash: hashSecret("TeacherPass123"), mustChangePassword: true }
    }),
    prisma.user.upsert({
      where: { email: "samuel.kiprotich@aethina.test" },
      update: { displayName: "Moses Okello", passwordHash: hashSecret("TeacherPass123"), isActive: true },
      create: { schoolId: school.id, email: "samuel.kiprotich@aethina.test", displayName: "Moses Okello", passwordHash: hashSecret("TeacherPass123"), mustChangePassword: true }
    }),
    prisma.user.upsert({
      where: { email: "biology@satelitesecondary.test" },
      update: { displayName: "Rebecca Achen", passwordHash: hashSecret("TeacherPass123"), isActive: true },
      create: { schoolId: school.id, email: "biology@satelitesecondary.test", displayName: "Rebecca Achen", passwordHash: hashSecret("TeacherPass123"), mustChangePassword: true }
    }),
    prisma.user.upsert({
      where: { email: "history@satelitesecondary.test" },
      update: { displayName: "David Sserwadda", passwordHash: hashSecret("TeacherPass123"), isActive: true },
      create: { schoolId: school.id, email: "history@satelitesecondary.test", displayName: "David Sserwadda", passwordHash: hashSecret("TeacherPass123"), mustChangePassword: true }
    }),
    prisma.user.upsert({
      where: { email: "geography@satelitesecondary.test" },
      update: { displayName: "Joyce Aber", passwordHash: hashSecret("TeacherPass123"), isActive: true },
      create: { schoolId: school.id, email: "geography@satelitesecondary.test", displayName: "Joyce Aber", passwordHash: hashSecret("TeacherPass123"), mustChangePassword: true }
    }),
    prisma.user.upsert({
      where: { email: "entrepreneurship@satelitesecondary.test" },
      update: { displayName: "Henry Mugisha", passwordHash: hashSecret("TeacherPass123"), isActive: true },
      create: { schoolId: school.id, email: "entrepreneurship@satelitesecondary.test", displayName: "Henry Mugisha", passwordHash: hashSecret("TeacherPass123"), mustChangePassword: true }
    })
  ]);

  await Promise.all(teacherUsers.map((user) =>
    prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: teacherRole.id } },
      update: {},
      create: { userId: user.id, roleId: teacherRole.id }
    })
  ));
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: teacherUsers[0].id, roleId: classTeacherRole.id } },
    update: {},
    create: { userId: teacherUsers[0].id, roleId: classTeacherRole.id }
  });

  const [teacherOne, teacherTwo, teacherThree, teacherFour, teacherFive, teacherSix] = await Promise.all([
    prisma.teacher.upsert({
      where: { staffId: "TCH-001" },
      update: { firstName: "Sarah", lastName: "Namutebi", pinHash: hashSecret("1234") },
      create: { schoolId: school.id, userId: teacherUsers[0].id, staffId: "TCH-001", firstName: "Sarah", lastName: "Namutebi", pinHash: hashSecret("1234") }
    }),
    prisma.teacher.upsert({
      where: { staffId: "TCH-002" },
      update: { firstName: "Moses", lastName: "Okello", pinHash: hashSecret("2345") },
      create: { schoolId: school.id, userId: teacherUsers[1].id, staffId: "TCH-002", firstName: "Moses", lastName: "Okello", pinHash: hashSecret("2345") }
    }),
    prisma.teacher.upsert({
      where: { staffId: "TCH-003" },
      update: { firstName: "Rebecca", lastName: "Achen", pinHash: hashSecret("3456") },
      create: { schoolId: school.id, userId: teacherUsers[2].id, staffId: "TCH-003", firstName: "Rebecca", lastName: "Achen", pinHash: hashSecret("3456") }
    }),
    prisma.teacher.upsert({
      where: { staffId: "TCH-004" },
      update: { firstName: "David", lastName: "Sserwadda", pinHash: hashSecret("4567") },
      create: { schoolId: school.id, userId: teacherUsers[3].id, staffId: "TCH-004", firstName: "David", lastName: "Sserwadda", pinHash: hashSecret("4567") }
    }),
    prisma.teacher.upsert({
      where: { staffId: "TCH-005" },
      update: { firstName: "Joyce", lastName: "Aber", pinHash: hashSecret("5678") },
      create: { schoolId: school.id, userId: teacherUsers[4].id, staffId: "TCH-005", firstName: "Joyce", lastName: "Aber", pinHash: hashSecret("5678") }
    }),
    prisma.teacher.upsert({
      where: { staffId: "TCH-006" },
      update: { firstName: "Henry", lastName: "Mugisha", pinHash: hashSecret("6789") },
      create: { schoolId: school.id, userId: teacherUsers[5].id, staffId: "TCH-006", firstName: "Henry", lastName: "Mugisha", pinHash: hashSecret("6789") }
    })
  ]);

  const standardOne = await prisma.class.upsert({
    where: { schoolId_name: { schoolId: school.id, name: "Senior One" } },
    update: {},
    create: { schoolId: school.id, name: "Senior One", level: 1 }
  });
  const standardTwo = await prisma.class.upsert({
    where: { schoolId_name: { schoolId: school.id, name: "Senior Two" } },
    update: {},
    create: { schoolId: school.id, name: "Senior Two", level: 2 }
  });

  const stream = await prisma.stream.upsert({
    where: { classId_name: { classId: standardOne.id, name: "East" } },
    update: {},
    create: { schoolId: school.id, classId: standardOne.id, name: "East" }
  });

  const academicYear = await prisma.academicYear.create({
    data: { schoolId: school.id, name: "2026", startsAt: new Date("2026-01-05"), endsAt: new Date("2026-11-20"), isActive: true }
  });
  const term = await prisma.term.create({
    data: { academicYearId: academicYear.id, name: "Term 1", startsAt: new Date("2026-01-05"), endsAt: new Date("2026-04-10"), isCurrent: true }
  });
  await prisma.school.update({ where: { id: school.id }, data: { currentAcademicYearId: academicYear.id, currentTermId: term.id, nextAdmissionSequence: 11 } });

  const [math, english, biology, history, geography, entrepreneurship] = await Promise.all([
    prisma.subject.upsert({ where: { schoolId_code: { schoolId: school.id, code: "MATH" } }, update: {}, create: { schoolId: school.id, teacherId: teacherOne.id, code: "MATH", name: "Mathematics" } }),
    prisma.subject.upsert({ where: { schoolId_code: { schoolId: school.id, code: "ENG" } }, update: {}, create: { schoolId: school.id, teacherId: teacherTwo.id, code: "ENG", name: "English Language" } }),
    prisma.subject.upsert({ where: { schoolId_code: { schoolId: school.id, code: "BIO" } }, update: {}, create: { schoolId: school.id, teacherId: teacherThree.id, code: "BIO", name: "Biology" } }),
    prisma.subject.upsert({ where: { schoolId_code: { schoolId: school.id, code: "HIST" } }, update: {}, create: { schoolId: school.id, teacherId: teacherFour.id, code: "HIST", name: "History" } }),
    prisma.subject.upsert({ where: { schoolId_code: { schoolId: school.id, code: "GEO" } }, update: {}, create: { schoolId: school.id, teacherId: teacherFive.id, code: "GEO", name: "Geography" } }),
    prisma.subject.upsert({ where: { schoolId_code: { schoolId: school.id, code: "ENT" } }, update: {}, create: { schoolId: school.id, teacherId: teacherSix.id, code: "ENT", name: "Entrepreneurship" } })
  ]);

  const names = [
    "Aisha Namugga", "Brian Kiggundu", "Charity Akello", "Daniel Ssemanda", "Esther Nanyonjo",
    "Faridah Nabukeera", "Godfrey Okurut", "Hadijah Nakato", "Isaac Tumusiime", "Janet Auma",
    "Kevin Kato", "Lydia Nansubuga", "Martin Ocen", "Norah Atim", "Oscar Mugerwa",
    "Patience Alupo", "Queen Nakitende", "Raymond Owino", "Stella Namusoke", "Timothy Lubega",
    "Uma Kansiime", "Viola Aber", "Walter Ssentongo", "Xavier Mutebi", "Yvonne Nakibuuka",
    "Zahara Nambooze", "Andrew Lwanga", "Brenda Apio", "Caleb Mwesigwa", "Doreen Kirabo"
  ];
  const students = [];
  for (const [index, name] of names.entries()) {
    const [firstName, lastName] = name.split(" ");
    const student = await prisma.student.upsert({
      where: { schoolId_admissionNo: { schoolId: school.id, admissionNo: `SAT-S1-${String(index + 1).padStart(3, "0")}` } },
      update: {},
      create: {
        schoolId: school.id,
        createdBy: dos.id,
        admissionNo: `SAT-S1-${String(index + 1).padStart(3, "0")}`,
        firstName,
        middleName: null,
        lastName,
        gender: index % 2 === 0 ? "FEMALE" : "MALE",
        dateOfBirth: new Date(`2010-0${(index % 8) + 1}-15`),
        admissionDate: new Date("2026-01-06"),
        currentAcademicYearId: academicYear.id,
        currentClassId: standardOne.id,
        currentStreamId: stream.id,
        emergencyContact: `+2567710000${index}`,
        medicalNotes: index === 2 ? "Mild dust allergy" : null,
        notes: "Fictional Satellite Secondary Senior One learner"
      }
    });
    const guardian = await prisma.guardian.create({
      data: { schoolId: school.id, createdBy: admin.id, fullName: `${lastName} Guardian`, phone: `+2567000000${index}`, email: `guardian${index + 1}@satelitesecondary.test`, address: `${index + 1} Satelite Estate, Kampala` }
    });
    await prisma.studentGuardian.create({ data: { studentId: student.id, guardianId: guardian.id, relationship: "Guardian", isPrimary: true } });
    await prisma.studentPortalCredential.upsert({
      where: { studentId: student.id },
      update: { passwordHash: hashSecret("StudentPass123"), mustReset: true, isActive: true },
      create: { studentId: student.id, username: student.admissionNo.toLowerCase(), passwordHash: hashSecret("StudentPass123"), mustReset: true }
    });
    students.push(student);
  }

  await prisma.financialSetting.upsert({
    where: { schoolId: school.id },
    update: {
      maximumDepartmentBudget: 50000000,
      maximumSingleExpense: 2000000,
      maximumTransactionNoApproval: 1000000,
      dailySpendingThreshold: 6000000,
      feeWaiverApprovalThreshold: 500000,
      paymentReversalApprovalThreshold: 250000,
      inventoryAdjustmentThreshold: 1000000,
      budgetUtilizationWarningPercentage: 80
    },
    create: {
      schoolId: school.id,
      maximumDepartmentBudget: 50000000,
      maximumSingleExpense: 2000000,
      maximumTransactionNoApproval: 1000000,
      dailySpendingThreshold: 6000000,
      feeWaiverApprovalThreshold: 500000,
      paymentReversalApprovalThreshold: 250000,
      inventoryAdjustmentThreshold: 1000000,
      budgetUtilizationWarningPercentage: 80
    }
  });

  const tuitionFee = await upsertFee({
    schoolId: school.id,
    academicYearId: academicYear.id,
    termId: term.id,
    classId: standardOne.id,
    category: "Tuition",
    name: "Senior One Term 1 Tuition",
    description: "Core tuition for Term 1",
    amount: 950_000,
    isMandatory: true,
    dueDate: new Date("2026-02-01"),
    isActive: true
  });
  const mealsFee = await upsertFee({
    schoolId: school.id,
    academicYearId: academicYear.id,
    termId: term.id,
    classId: standardOne.id,
    category: "Meals",
    name: "Senior One Meals",
    description: "Lunch and break tea for Term 1",
    amount: 600_000,
    isMandatory: true,
    dueDate: new Date("2026-02-01"),
    isActive: true
  });
  await upsertFee({
    schoolId: school.id,
    academicYearId: academicYear.id,
    termId: term.id,
    classId: standardTwo.id,
    category: "Tuition",
    name: "Senior Two Term 1 Tuition",
    description: "Core tuition for Term 1",
    amount: 1_050_000,
    isMandatory: true,
    dueDate: new Date("2026-02-01"),
    isActive: true
  });

  const examination = await prisma.examination.create({ data: { schoolId: school.id, termId: term.id, academicYearId: academicYear.id, name: "Term 1 Beginning Test", examinationType: "Beginning of Term", status: "PUBLISHED", startsAt: new Date("2026-02-16"), endsAt: new Date("2026-02-20"), approvedBy: dos.id, approvedAt: new Date("2026-02-23"), publishedAt: new Date("2026-02-24") } });
  const assessment = await prisma.assessment.create({ data: { schoolId: school.id, termId: term.id, examinationId: examination.id, subjectId: math.id, classId: standardOne.id, streamId: stream.id, teacherId: teacherOne.id, name: "S1 Mathematics Beginning Test", maxScore: 100, passMark: 50, status: "PUBLISHED", submittedBy: teacherUsers[0].id, submittedAt: new Date("2026-02-21"), reviewedBy: dos.id, reviewedAt: new Date("2026-02-23"), publishedAt: new Date("2026-02-24") } });

  const hasUgandaGrades = await prisma.gradeBoundary.count({ where: { schoolId: school.id, grade: "D1" } });
  if (hasUgandaGrades === 0) {
    await prisma.gradeBoundary.createMany({
      data: [
      { schoolId: school.id, grade: "D1", minScore: 80, maxScore: 100, remark: "Excellent distinction", points: 1, isPass: true },
      { schoolId: school.id, grade: "D2", minScore: 75, maxScore: 79, remark: "Very good distinction", points: 2, isPass: true },
      { schoolId: school.id, grade: "C3", minScore: 70, maxScore: 74, remark: "Good credit", points: 3, isPass: true },
      { schoolId: school.id, grade: "C4", minScore: 65, maxScore: 69, remark: "Credit", points: 4, isPass: true },
      { schoolId: school.id, grade: "C5", minScore: 60, maxScore: 64, remark: "Credit", points: 5, isPass: true },
      { schoolId: school.id, grade: "C6", minScore: 50, maxScore: 59, remark: "Credit pass", points: 6, isPass: true },
      { schoolId: school.id, grade: "P7", minScore: 45, maxScore: 49, remark: "Pass", points: 7, isPass: true },
      { schoolId: school.id, grade: "P8", minScore: 35, maxScore: 44, remark: "Pass", points: 8, isPass: true },
      { schoolId: school.id, grade: "F9", minScore: 0, maxScore: 34, remark: "Fail", points: 9, isPass: false }
      ]
    });
  }

  for (const [index, student] of students.entries()) {
    const score = 48 + ((index * 7) % 45);
    await prisma.mark.upsert({
      where: { studentId_assessmentId: { studentId: student.id, assessmentId: assessment.id } },
      update: { score, grade: ugandaGrade(score), status: "PUBLISHED", publishedAt: new Date("2026-02-24") },
      create: { schoolId: school.id, studentId: student.id, assessmentId: assessment.id, subjectId: math.id, score, grade: ugandaGrade(score), status: "PUBLISHED", submittedBy: teacherUsers[0].id, submittedAt: new Date("2026-02-21"), reviewedBy: dos.id, reviewedAt: new Date("2026-02-23"), publishedAt: new Date("2026-02-24") }
    });
  }

  const invoicePlans = [
    { student: students[0], paid: 1_550_000, method: "MOBILE_MONEY", reference: "MM-2026-0001" },
    { student: students[1], paid: 700_000, method: "CASH", reference: "CASH-2026-0002" },
    { student: students[2], paid: 0, method: "BANK_DEPOSIT", reference: "BANK-2026-0003" },
    { student: students[3], paid: 1_000_000, method: "BANK_TRANSFER", reference: "BANK-2026-0004" }
  ];
  for (const [index, plan] of invoicePlans.entries()) {
    const invoiceNo = `INV-2026-${String(index + 1).padStart(3, "0")}`;
    const total = 1_550_000;
    const invoice = await prisma.studentInvoice.upsert({
      where: { schoolId_invoiceNo: { schoolId: school.id, invoiceNo } },
      update: {
        studentId: plan.student.id,
        termId: term.id,
        feeStructureId: tuitionFee.id,
        amount: total,
        amountPaid: plan.paid,
        balance: total - plan.paid,
        status: plan.paid === total ? "PAID" : plan.paid > 0 ? "PARTIALLY_PAID" : "ISSUED",
        dueDate: new Date("2026-02-01")
      },
      create: {
        schoolId: school.id,
        createdBy: admin.id,
        studentId: plan.student.id,
        termId: term.id,
        feeStructureId: tuitionFee.id,
        invoiceNo,
        invoiceDate: new Date("2026-01-08"),
        amount: total,
        amountPaid: plan.paid,
        balance: total - plan.paid,
        status: plan.paid === total ? "PAID" : plan.paid > 0 ? "PARTIALLY_PAID" : "ISSUED",
        dueDate: new Date("2026-02-01")
      }
    });
    const lineCount = await prisma.studentInvoiceLine.count({ where: { invoiceId: invoice.id } });
    if (lineCount === 0) {
      await prisma.studentInvoiceLine.createMany({
        data: [
          { invoiceId: invoice.id, description: tuitionFee.name, category: tuitionFee.category, amount: tuitionFee.amount },
          { invoiceId: invoice.id, description: mealsFee.name, category: mealsFee.category, amount: mealsFee.amount }
        ]
      });
    }
    if (plan.paid > 0) {
      const receiptNo = `RCT-2026-${String(index + 1).padStart(3, "0")}`;
      const payment = await prisma.payment.upsert({
        where: { schoolId_receiptNo: { schoolId: school.id, receiptNo } },
        update: { invoiceId: invoice.id, amount: plan.paid, method: plan.method, reference: plan.reference, paidAt: new Date("2026-01-20"), receivedBy: admin.displayName },
        create: { schoolId: school.id, createdBy: admin.id, invoiceId: invoice.id, receiptNo, amount: plan.paid, method: plan.method, reference: plan.reference, paidAt: new Date("2026-01-20"), receivedBy: admin.displayName }
      });
      await prisma.receipt.upsert({
        where: { paymentId: payment.id },
        update: { receiptNo, displayNo: receiptNo, amountWords: `UGX ${plan.paid.toLocaleString("en-UG")} only` },
        create: { schoolId: school.id, paymentId: payment.id, receiptNo, displayNo: receiptNo, amountWords: `UGX ${plan.paid.toLocaleString("en-UG")} only` }
      });
    }
  }

  const discountInvoice = await prisma.studentInvoice.findUniqueOrThrow({ where: { schoolId_invoiceNo: { schoolId: school.id, invoiceNo: "INV-2026-004" } } });
  await prisma.feeAdjustment.upsert({
    where: { id: "00000000-0000-4000-8000-000000000101" },
    update: {},
    create: {
      id: "00000000-0000-4000-8000-000000000101",
      schoolId: school.id,
      createdBy: admin.id,
      studentId: students[3].id,
      invoiceId: discountInvoice.id,
      adjustmentType: "SCHOLARSHIP",
      amount: 200_000,
      reason: "Fictional merit scholarship for demo data",
      requestedBy: admin.id,
      approvedBy: admin.id,
      approvedAt: new Date("2026-01-18"),
      approvalStatus: "APPROVED"
    }
  });

  const item = await prisma.inventoryItem.upsert({
    where: { schoolId_sku: { schoolId: school.id, sku: "CHALK-WHITE" } },
    update: {},
    create: { schoolId: school.id, sku: "CHALK-WHITE", name: "White Chalk Box", quantity: 40, reorderLevel: 10 }
  });
  await prisma.stockMovement.create({ data: { schoolId: school.id, inventoryItemId: item.id, movementType: "IN", quantity: 40, reason: "Opening stock" } });

  const budget = await prisma.budget.upsert({
    where: { id: "00000000-0000-4000-8000-000000000201" },
    update: { amount: 10_000_000, spentAmount: 7_500_000, committedAmount: 850_000 },
    create: {
      id: "00000000-0000-4000-8000-000000000201",
      schoolId: school.id,
      createdBy: admin.id,
      name: "Learning Materials",
      academicYearId: academicYear.id,
      termId: term.id,
      department: "Academics",
      category: "Academic materials",
      amount: 10_000_000,
      spentAmount: 7_500_000,
      committedAmount: 850_000,
      warningThreshold: 80,
      hardCap: true,
      period: "Term 1",
      year: 2026
    }
  });
  const operationsBudget = await prisma.budget.upsert({
    where: { id: "00000000-0000-4000-8000-000000000202" },
    update: { amount: 18_000_000, spentAmount: 4_350_000 },
    create: {
      id: "00000000-0000-4000-8000-000000000202",
      schoolId: school.id,
      createdBy: admin.id,
      name: "School Operations",
      academicYearId: academicYear.id,
      termId: term.id,
      department: "Administration",
      category: "Operations",
      amount: 18_000_000,
      spentAmount: 4_350_000,
      warningThreshold: 75,
      hardCap: true,
      period: "Term 1",
      year: 2026
    }
  });
  const budgetRequest = await prisma.budgetRequest.upsert({
    where: { id: "00000000-0000-4000-8000-000000000301" },
    update: { amount: 850_000, reason: "Mathematics manipulatives for Grade 1" },
    create: {
      id: "00000000-0000-4000-8000-000000000301",
      schoolId: school.id,
      budgetId: budget.id,
      requestedBy: teacherOne.id,
      createdBy: teacherUsers[0].id,
      amount: 850_000,
      reason: "Mathematics manipulatives for Grade 1"
    }
  });
  await prisma.approvalWorkflow.upsert({
    where: { entityId: budgetRequest.id },
    update: { status: "SUBMITTED", currentApprover: admin.id },
    create: { schoolId: school.id, entityType: "BUDGET_REQUEST", entityId: budgetRequest.id, requestedBy: teacherUsers[0].id, currentApprover: admin.id, status: "SUBMITTED" }
  });
  await prisma.expense.upsert({
    where: { schoolId_expenseNo: { schoolId: school.id, expenseNo: "EXP-2026-001" } },
    update: { amount: 1_250_000, approvalStatus: "APPROVED" },
    create: {
      schoolId: school.id,
      createdBy: admin.id,
      expenseNo: "EXP-2026-001",
      spentAt: new Date("2026-01-22"),
      category: "Stationery",
      department: "Academics",
      description: "Exercise books and classroom stationery",
      amount: 1_250_000,
      method: "BANK_TRANSFER",
      payee: "Demo School Supplies Ltd",
      reference: "SUP-INV-2026-001",
      requestedBy: admin.id,
      budgetId: budget.id,
      approvalStatus: "APPROVED"
    }
  });
  const pendingExpense = await prisma.expense.upsert({
    where: { schoolId_expenseNo: { schoolId: school.id, expenseNo: "EXP-2026-002" } },
    update: { amount: 2_400_000, approvalStatus: "PENDING" },
    create: {
      schoolId: school.id,
      createdBy: teacherUsers[1].id,
      expenseNo: "EXP-2026-002",
      spentAt: new Date("2026-01-27"),
      category: "Maintenance",
      department: "Administration",
      description: "Repairs to classroom windows",
      amount: 2_400_000,
      method: "MOBILE_MONEY",
      payee: "Fictional Repairs Co",
      reference: "REP-2026-010",
      requestedBy: teacherUsers[1].id,
      budgetId: operationsBudget.id,
      approvalStatus: "PENDING"
    }
  });
  await prisma.approvalWorkflow.upsert({
    where: { entityId: pendingExpense.id },
    update: { status: "SUBMITTED", currentApprover: admin.id },
    create: { schoolId: school.id, entityType: "EXPENSE", entityId: pendingExpense.id, requestedBy: teacherUsers[1].id, currentApprover: admin.id, status: "SUBMITTED" }
  });

  const samplePayment = await prisma.payment.findUnique({ where: { schoolId_receiptNo: { schoolId: school.id, receiptNo: "RCT-2026-002" } } });
  if (samplePayment) {
    const reversal = await prisma.paymentReversal.upsert({
      where: { id: "00000000-0000-4000-8000-000000000401" },
      update: { approvalStatus: "PENDING" },
      create: {
        id: "00000000-0000-4000-8000-000000000401",
        schoolId: school.id,
        paymentId: samplePayment.id,
        requestedBy: admin.id,
        createdBy: admin.id,
        reason: "Fictional duplicate mobile money confirmation under review",
        approvalStatus: "PENDING"
      }
    });
    await prisma.approvalWorkflow.upsert({
      where: { entityId: reversal.id },
      update: { status: "SUBMITTED", currentApprover: teacherUsers[0].id },
      create: { schoolId: school.id, entityType: "PAYMENT_REVERSAL", entityId: reversal.id, requestedBy: admin.id, currentApprover: teacherUsers[0].id, status: "SUBMITTED" }
    });
  }

  await prisma.riskAlert.upsert({
    where: { id: "00000000-0000-4000-8000-000000000501" },
    update: { status: "NEW" },
    create: { id: "00000000-0000-4000-8000-000000000501", schoolId: school.id, category: "BUDGET_VIOLATION", severity: "HIGH", entityType: "EXPENSE", entityId: pendingExpense.id, amount: 2_400_000, userId: teacherUsers[1].id, reason: "Expense requires review because it exceeds the single-expense approval threshold." }
  });
  await prisma.riskAlert.upsert({
    where: { id: "00000000-0000-4000-8000-000000000502" },
    update: { status: "UNDER_REVIEW" },
    create: { id: "00000000-0000-4000-8000-000000000502", schoolId: school.id, category: "EXCESSIVE_WAIVER", severity: "MEDIUM", entityType: "FEE_ADJUSTMENT", entityId: "00000000-0000-4000-8000-000000000101", amount: 200_000, userId: admin.id, reason: "Scholarship adjustment included for demonstration review." }
  });

  await prisma.teacherSubjectAssignment.upsert({
    where: { teacherId_subjectId_classId_streamId: { teacherId: teacherOne.id, subjectId: math.id, classId: standardOne.id, streamId: stream.id } },
    update: { isActive: true },
    create: { schoolId: school.id, teacherId: teacherOne.id, subjectId: math.id, classId: standardOne.id, streamId: stream.id }
  });
  await prisma.classTeacherAssignment.upsert({
    where: { teacherId_classId_streamId_academicYearId: { teacherId: teacherOne.id, classId: standardOne.id, streamId: stream.id, academicYearId: academicYear.id } },
    update: { termId: term.id, isActive: true },
    create: { schoolId: school.id, teacherId: teacherOne.id, classId: standardOne.id, streamId: stream.id, academicYearId: academicYear.id, termId: term.id }
  });
  await prisma.teacherSubjectAssignment.upsert({
    where: { teacherId_subjectId_classId_streamId: { teacherId: teacherTwo.id, subjectId: english.id, classId: standardOne.id, streamId: stream.id } },
    update: { isActive: true },
    create: { schoolId: school.id, teacherId: teacherTwo.id, subjectId: english.id, classId: standardOne.id, streamId: stream.id }
  });
  for (const assignment of [
    { teacherId: teacherThree.id, subjectId: biology.id },
    { teacherId: teacherFour.id, subjectId: history.id },
    { teacherId: teacherFive.id, subjectId: geography.id },
    { teacherId: teacherSix.id, subjectId: entrepreneurship.id }
  ]) {
    await prisma.teacherSubjectAssignment.upsert({
      where: { teacherId_subjectId_classId_streamId: { teacherId: assignment.teacherId, subjectId: assignment.subjectId, classId: standardOne.id, streamId: stream.id } },
      update: { isActive: true },
      create: { schoolId: school.id, teacherId: assignment.teacherId, subjectId: assignment.subjectId, classId: standardOne.id, streamId: stream.id }
    });
  }

  const timetableRows = [
    { id: "00000000-0000-4000-8000-000000000601", subjectId: math.id, teacherId: teacherOne.id, dayOfWeek: 1, periodNumber: 1, startsAt: "08:00", endsAt: "08:40", room: "S1 East" },
    { id: "00000000-0000-4000-8000-000000000602", subjectId: english.id, teacherId: teacherTwo.id, dayOfWeek: 1, periodNumber: 2, startsAt: "08:45", endsAt: "09:25", room: "S1 East" },
    { id: "00000000-0000-4000-8000-000000000603", subjectId: biology.id, teacherId: teacherThree.id, dayOfWeek: 1, periodNumber: 3, startsAt: "09:45", endsAt: "10:25", room: "Lab 1" },
    { id: "00000000-0000-4000-8000-000000000605", subjectId: history.id, teacherId: teacherFour.id, dayOfWeek: 2, periodNumber: 1, startsAt: "08:00", endsAt: "08:40", room: "S1 East" },
    { id: "00000000-0000-4000-8000-000000000606", subjectId: geography.id, teacherId: teacherFive.id, dayOfWeek: 3, periodNumber: 2, startsAt: "08:45", endsAt: "09:25", room: "S1 East" },
    { id: "00000000-0000-4000-8000-000000000607", subjectId: entrepreneurship.id, teacherId: teacherSix.id, dayOfWeek: 4, periodNumber: 4, startsAt: "11:05", endsAt: "11:45", room: "S1 East" }
  ];
  for (const row of timetableRows) {
    await prisma.timetableEntry.upsert({
      where: { id: row.id },
      update: row,
      create: { ...row, schoolId: school.id, academicYearId: academicYear.id, termId: term.id, classId: standardOne.id, streamId: stream.id, createdBy: admin.id }
    });
  }

  for (const [index, student] of students.slice(0, 12).entries()) {
    const score = 52 + ((index * 5) % 41);
    await prisma.reportCard.upsert({
      where: { studentId_termId_examinationId: { studentId: student.id, termId: term.id, examinationId: examination.id } },
      update: {
        totalScore: score,
        averageScore: score,
        grade: ugandaGrade(score),
        remarks: "Fictional progress report for Satelite Secondary demo data",
        subjectResults: [{ subject: "Mathematics", score, grade: ugandaGrade(score) }],
        status: index < 8 ? "PUBLISHED" : "DRAFT",
        approvalStatus: index < 8 ? "APPROVED" : "PENDING",
        publishedAt: index < 8 ? new Date("2026-02-24") : null,
        preparedBy: teacherUsers[0].id,
        preparedAt: new Date("2026-02-22"),
        finalApprovedBy: index < 8 ? dos.id : null,
        finalApprovedAt: index < 8 ? new Date("2026-02-24") : null
      },
      create: {
          schoolId: school.id,
          createdBy: admin.id,
          studentId: student.id,
          termId: term.id,
          examinationId: examination.id,
          classId: standardOne.id,
          streamId: stream.id,
          totalScore: score,
          averageScore: score,
          grade: ugandaGrade(score),
          remarks: "Fictional progress report for Satelite Secondary demo data",
          subjectResults: [{ subject: "Mathematics", score, grade: ugandaGrade(score) }],
          status: index < 8 ? "PUBLISHED" : "DRAFT",
          approvalStatus: index < 8 ? "APPROVED" : "PENDING",
          publishedAt: index < 8 ? new Date("2026-02-24") : null,
          preparedBy: teacherUsers[0].id,
          preparedAt: new Date("2026-02-22"),
          finalApprovedBy: index < 8 ? dos.id : null,
          finalApprovedAt: index < 8 ? new Date("2026-02-24") : null
      }
    });
  }

  const supplier = await prisma.inventorySupplier.upsert({
    where: { schoolId_name: { schoolId: school.id, name: "Fictional School Supplies Ltd" } },
    update: { phone: "+254700222333", email: "supplies@example.test" },
    create: { schoolId: school.id, name: "Fictional School Supplies Ltd", phone: "+254700222333", email: "supplies@example.test", address: "42 Demo Market Road" }
  });
  await prisma.inventoryItem.upsert({
    where: { schoolId_sku: { schoolId: school.id, sku: "EXBOOK-A5" } },
    update: { category: "Stationery", quantity: 120, reorderLevel: 30, unit: "book", unitCost: 1200, storageLocation: "Store A" },
    create: { schoolId: school.id, createdBy: admin.id, sku: "EXBOOK-A5", name: "A5 Exercise Book", category: "Stationery", quantity: 120, reorderLevel: 30, unit: "book", unitCost: 1200, storageLocation: "Store A" }
  });
  await prisma.stockMovement.upsert({
    where: { id: "00000000-0000-4000-8000-000000000604" },
    update: { quantity: 80, supplierId: supplier.id },
    create: { id: "00000000-0000-4000-8000-000000000604", schoolId: school.id, createdBy: admin.id, inventoryItemId: item.id, movementType: "IN", quantity: 80, unitCost: 1500, supplierId: supplier.id, reference: "SUP-DEL-2026-001", occurredAt: new Date("2026-01-09"), approvedBy: admin.id, approvedAt: new Date("2026-01-09"), reason: "Opening stock replenishment" }
  });

  const profileOne = await prisma.payrollProfile.upsert({
    where: { schoolId_teacherId: { schoolId: school.id, teacherId: teacherOne.id } },
    update: { baseSalary: 45000, employeeNo: "EMP-001" },
    create: { schoolId: school.id, teacherId: teacherOne.id, employeeNo: "EMP-001", department: "Academics", baseSalary: 45000, paymentMethod: "BANK_TRANSFER", paymentAccount: "DEMO-001", effectiveAt: new Date("2026-01-01"), createdBy: admin.id }
  });
  const profileTwo = await prisma.payrollProfile.upsert({
    where: { schoolId_teacherId: { schoolId: school.id, teacherId: teacherTwo.id } },
    update: { baseSalary: 43000, employeeNo: "EMP-002" },
    create: { schoolId: school.id, teacherId: teacherTwo.id, employeeNo: "EMP-002", department: "Academics", baseSalary: 43000, paymentMethod: "BANK_TRANSFER", paymentAccount: "DEMO-002", effectiveAt: new Date("2026-01-01"), createdBy: admin.id }
  });
  await prisma.payrollComponent.upsert({
    where: { id: "00000000-0000-4000-8000-000000000701" },
    update: { amount: 3500 },
    create: { id: "00000000-0000-4000-8000-000000000701", schoolId: school.id, payrollProfileId: profileOne.id, componentType: "DEDUCTION", name: "Fictional Statutory Deduction", amount: 3500, effectiveAt: new Date("2026-01-01") }
  });
  const payrollRun = await prisma.payrollRun.upsert({
    where: { schoolId_period: { schoolId: school.id, period: "2026-01" } },
    update: { grossTotal: 88000, deductionTotal: 3500, netTotal: 84500, status: "SUBMITTED", submittedBy: admin.id, submittedAt: new Date("2026-01-30") },
    create: { schoolId: school.id, period: "2026-01", grossTotal: 88000, deductionTotal: 3500, netTotal: 84500, status: "SUBMITTED", createdBy: admin.id, submittedBy: admin.id, submittedAt: new Date("2026-01-30"), notes: "Fictional payroll run for review" }
  });
  const payrollSeedRows = [
    { id: "00000000-0000-4000-8000-000000000702", teacherId: teacherOne.id, profileId: profileOne.id, gross: 45000, deductions: 3500, net: 41500 },
    { id: "00000000-0000-4000-8000-000000000703", teacherId: teacherTwo.id, profileId: profileTwo.id, gross: 43000, deductions: 0, net: 43000 }
  ];
  for (const row of payrollSeedRows) {
    await prisma.payrollRecord.upsert({
      where: { id: row.id },
      update: { payrollRunId: payrollRun.id, grossPay: row.gross, deductions: row.deductions, netPay: row.net, status: "SUBMITTED" },
      create: { id: row.id, schoolId: school.id, teacherId: row.teacherId, payrollProfileId: row.profileId, payrollRunId: payrollRun.id, period: "2026-01", grossPay: row.gross, deductions: row.deductions, netPay: row.net, status: "SUBMITTED", createdBy: admin.id }
    });
  }
  await prisma.approvalWorkflow.upsert({
    where: { entityId: payrollRun.id },
    update: { status: "SUBMITTED", currentApprover: teacherUsers[0].id },
    create: { schoolId: school.id, entityType: "PAYROLL_RUN", entityId: payrollRun.id, requestedBy: admin.id, currentApprover: teacherUsers[0].id, status: "SUBMITTED" }
  });

  await prisma.notificationTemplate.upsert({
    where: { schoolId_name_channel: { schoolId: school.id, name: "Portal announcement", channel: "IN_APP" } },
    update: { body: "A new school announcement is available." },
    create: { schoolId: school.id, name: "Portal announcement", channel: "IN_APP", body: "A new school announcement is available.", variables: ["title"], createdBy: admin.id }
  });
  await prisma.announcement.upsert({
    where: { id: "00000000-0000-4000-8000-000000000801" },
    update: { title: "Term 1 Parents Meeting", publishAt: new Date("2026-02-01") },
    create: { id: "00000000-0000-4000-8000-000000000801", schoolId: school.id, title: "Term 1 Parents Meeting", message: "Fictional reminder for a parent-teacher meeting in the demonstration school.", audience: "PORTAL", priority: "HIGH", publishAt: new Date("2026-02-01"), createdBy: admin.id }
  });
  await prisma.notification.upsert({
    where: { id: "00000000-0000-4000-8000-000000000802" },
    update: { status: "SENT", sentAt: new Date("2026-02-01") },
    create: { id: "00000000-0000-4000-8000-000000000802", schoolId: school.id, recipientType: "STUDENT", recipientId: students[0].id, channel: "IN_APP", category: "ACADEMICS", title: "Report card available", body: "Your Term 1 midterm report card is available in the portal.", status: "SENT", sentAt: new Date("2026-02-01"), createdBy: admin.id }
  });

  console.log(`Seeded ${school.name} with ${students.length} students, ${teacherUsers.length} teachers, fees, payments, exams, inventory, and a budget request.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
