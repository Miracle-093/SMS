import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { CurrentUser } from "@aethina/shared-types";
import type { PrismaService } from "../prisma/prisma.service.js";

type AcademicLevelBand = "LOWER" | "MIDDLE" | "UPPER";

const academicLevelBands: Array<{ band: AcademicLevelBand; label: string; minLevel: number; maxLevel: number }> = [
  { band: "LOWER", label: "Lower School (S1-S2)", minLevel: 1, maxLevel: 2 },
  { band: "MIDDLE", label: "Middle School (S3-S4)", minLevel: 3, maxLevel: 4 },
  { band: "UPPER", label: "Upper School (S5-S6)", minLevel: 5, maxLevel: 6 }
];

export function academicLevelBandsForUser(actor: CurrentUser): AcademicLevelBand[] {
  const roleText = actor.roles.map(normalizeRoleName).join(" ");
  const bands: AcademicLevelBand[] = [];
  if (/\b(lower|s1|senior one|senior 1)\b/.test(roleText)) bands.push("LOWER");
  if (/\b(middle|s3|senior three|senior 3)\b/.test(roleText)) bands.push("MIDDLE");
  if (/\b(upper|s5|senior five|senior 5)\b/.test(roleText)) bands.push("UPPER");
  return Array.from(new Set(bands));
}

export function hasAcademicLevelScope(actor: CurrentUser) {
  return academicLevelBandsForUser(actor).length > 0;
}

export function academicLevelScopeLabel(actor: CurrentUser) {
  const bands = academicLevelBandsForUser(actor);
  return bands.length
    ? academicLevelBands.filter((item) => bands.includes(item.band)).map((item) => item.label).join(", ")
    : "Whole school";
}

export async function classIdsForAcademicLevelScope(prisma: PrismaService, actor: CurrentUser): Promise<string[] | null> {
  const bands = await academicLevelBandsForActor(prisma, actor);
  if (bands.length === 0) return null;
  const ranges = bands.map((band) => ({
    minLevel: band.minLevel,
    maxLevel: band.maxLevel
  }));
  const classes = await prisma.class.findMany({
    where: {
      schoolId: actor.schoolId,
      OR: ranges.map((range) => ({ level: { gte: range.minLevel, lte: range.maxLevel } }))
    },
    select: { id: true }
  });
  return classes.map((klass) => klass.id);
}

export async function assertClassLevelWithinAcademicScope(prisma: PrismaService, actor: CurrentUser, level: number) {
  const bands = await academicLevelBandsForActor(prisma, actor);
  if (bands.length === 0) return;
  if (!bands.some((band) => level >= band.minLevel && level <= band.maxLevel)) {
    throw new BadRequestException(`This class level is outside ${bands.map((band) => band.label).join(", ")}.`);
  }
}

export async function assertClassWithinAcademicLevelScope(prisma: PrismaService, actor: CurrentUser, classId: string | null | undefined) {
  if (!classId) return;
  const classIds = await classIdsForAcademicLevelScope(prisma, actor);
  if (classIds && !classIds.includes(classId)) {
    throw new BadRequestException(`This class is outside ${academicLevelScopeLabel(actor)}.`);
  }
}

export function classIdWhereForScope(classIds: string[] | null): Prisma.StringNullableFilter | string | undefined {
  return classIds ? { in: classIds } : undefined;
}

function normalizeRoleName(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\s+/g, " ").trim();
}

async function academicLevelBandsForActor(prisma: PrismaService, actor: CurrentUser) {
  const explicit = await prisma.academicScopeAssignment.findMany({
    where: { schoolId: actor.schoolId, userId: actor.id, isActive: true },
    select: { band: true, minLevel: true, maxLevel: true }
  });
  if (explicit.length > 0) {
    return explicit.map((item) => ({
      band: item.band as AcademicLevelBand,
      label: academicLevelBands.find((band) => band.band === item.band)?.label ?? `${item.minLevel}-${item.maxLevel}`,
      minLevel: item.minLevel,
      maxLevel: item.maxLevel
    }));
  }
  const fallbackBands = academicLevelBandsForUser(actor);
  return academicLevelBands.filter((item) => fallbackBands.includes(item.band));
}
