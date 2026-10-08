import "server-only";
import { and, eq, ilike, isNull, ne, or, SQL, sql } from "drizzle-orm";
import { db } from "@/db";
import { records, schools } from "@/db/schema";
import type { SafeUser } from "@/lib/server";
import { asObject, HttpError } from "./core";
import { allowedQueryFields, assertQueryAllowed, assertReadable, assertWrite, PUBLIC_CONFIG_KEYS, sanitizeOut, scopeSql } from "./policy";

export type DataItem = { id: string; kind: string; data: Record<string, unknown>; createdAt?: Date; updatedAt?: Date };

function toItem(user: SafeUser, row: typeof records.$inferSelect): DataItem {
  return { id: row.id, kind: row.type, data: sanitizeOut(user, row.type, asObject(row.data)), createdAt: row.createdAt, updatedAt: row.updatedAt };
}

async function assignedClasses(user: SafeUser) {
  if (user.role !== "teacher" || !user.entityId) return [];
  const [profile] = await db.select({ data: records.data }).from(records).where(and(eq(records.schoolId, user.schoolId), eq(records.type, "teacher"), eq(records.id, user.entityId))).limit(1);
  const data = asObject(profile?.data);
  const classes = data.assignedClasses;
  return Array.isArray(classes) ? classes.map(String) : [];
}

async function configItems(user: SafeUser): Promise<DataItem[]> {
  const [school] = await db.select().from(schools).where(eq(schools.id, user.schoolId)).limit(1);
  if (!school) return [];
  const settings = asObject(school.settings);
  const values: Record<string, unknown> = {
    schoolInfo: { nameEn: school.nameEn, nameBn: school.nameBn, emis: settings.emis, ipemis: settings.ipemis, established: settings.established, address: settings.address, addressEn: settings.addressEn, logo: settings.logo },
    classes: settings.classes ?? [], examTerms: settings.terms ?? [], routineSubjects: settings.routineSubjects ?? {},
    gradeScale: settings.grades ?? [], session: settings.session ?? "",
  };
  return PUBLIC_CONFIG_KEYS.map((key) => ({ id: `config-${key}`, kind: "config", data: { key, value: values[key] } }));
}

export async function listRecords(user: SafeUser, kind: string, params: URLSearchParams) {
  assertReadable(user, kind);
  const q = params.get("q")?.trim() || null;
  const reserved = new Set(["q", "page", "limit", "trash", "type"]);
  const filters = Object.fromEntries([...params.entries()].filter(([key]) => !reserved.has(key)));
  assertQueryAllowed(user, kind, q, filters);
  if (kind === "config") return configItems(user);
  const classes = await assignedClasses(user);
  const conditions: (SQL | undefined)[] = [scopeSql(user, kind, classes)];
  for (const [key, value] of Object.entries(filters)) conditions.push(eq(sql<string>`data->>${key}`, value));
  if (q) {
    const fields = allowedQueryFields(user, kind);
    if (fields === null) conditions.push(ilike(sql<string>`data::text`, `%${q}%`));
    else conditions.push(or(...[...fields].map((field) => ilike(sql<string>`data->>${field}`, `%${q}%`))));
  }
  const limit = Math.min(500, Math.max(1, Number(params.get("limit")) || 100));
  const rows = await db.select().from(records).where(and(...conditions)).limit(limit);
  return rows.map((row) => toItem(user, row));
}

export async function getRecord(user: SafeUser, kind: string, id: string) {
  assertReadable(user, kind);
  if (kind === "config") return (await configItems(user)).find((item) => item.id === id) ?? null;
  const classes = await assignedClasses(user);
  const [row] = await db.select().from(records).where(and(scopeSql(user, kind, classes), eq(records.id, id))).limit(1);
  return row ? toItem(user, row) : null;
}

export async function createRecord(user: SafeUser, kind: string, input: { id: string; data: Record<string, unknown> }) {
  const [existing] = await db.select().from(records).where(and(eq(records.schoolId, user.schoolId), eq(records.id, input.id))).limit(1);
  if (existing) {
    if (existing.type !== kind) throw new HttpError(409, "Record id already in use");
    assertReadable(user, kind);
    const scoped = await getRecord(user, kind, existing.id);
    if (!scoped) throw new HttpError(403, "Forbidden");
    assertWrite(user, kind, asObject(existing.data), asObject(existing.data));
    return scoped;
  }
  const data = { ...input.data };
  if (user.role === "teacher" && ["leave", "submission", "attendance"].includes(kind)) data.teacherId = user.entityId;
  if (user.role === "teacher" && ["leave", "submission"].includes(kind)) { for (const key of ["reviewNote", "reviewedBy", "reviewedAt"]) delete data[key]; if (kind === "leave") data.status = "pending"; }
  assertWrite(user, kind, data);
  await validateRecord(user, kind, data, input.id);
  const [saved] = await db.insert(records).values({ id: input.id, schoolId: user.schoolId, type: kind, data, createdBy: user.id }).returning();
  return toItem(user, saved);
}

export async function updateRecord(user: SafeUser, kind: string, id: string, patch: Record<string, unknown>) {
  const [row] = await db.select().from(records).where(and(eq(records.schoolId, user.schoolId), eq(records.id, id))).limit(1);
  if (!row || row.type !== kind) throw new HttpError(404, "Record not found");
  const scoped = await getRecord(user, kind, id);
  if (!scoped) throw new HttpError(403, "Forbidden");
  const existing = asObject(row.data);
  const next = { ...existing, ...patch };
  assertWrite(user, kind, next, existing);
  await validateRecord(user, kind, next, id);
  const [saved] = await db.update(records).set({ data: next, updatedAt: new Date() }).where(and(eq(records.schoolId, user.schoolId), eq(records.id, id), eq(records.type, kind))).returning();
  return toItem(user, saved);
}

const MOBILE = /^01[3-9]\d{8}$/;
const bad = (message: string, status = 400) => { throw new HttpError(status, message); };
function yearOf(value: unknown) { const text = String(value ?? "").trim(); return /^\d{4}-\d{2}-\d{2}$/.test(text) ? Number(text.slice(0, 4)) : NaN; }
export async function validateRecord(user: SafeUser, kind: string, data: Record<string, unknown>, selfId: string) {
  const now = new Date().getFullYear();
  for (const field of ["mobile", "fatherMobile", "motherMobile", "guardianMobile"]) {
    const value = String(data[field] ?? "").trim();
    if (value && !MOBILE.test(value)) bad(`${field}: enter a valid Bangladeshi mobile number (01XXXXXXXXX).`);
  }
  if (kind === "teacher" && String(data.dob ?? "").trim()) {
    const year = yearOf(data.dob);
    if (!(year >= now - 75 && year <= now - 18)) bad("Teacher date of birth must make the teacher 18–75 years old.");
  }
  if (kind === "student") {
    if (String(data.dob ?? "").trim()) { const year = yearOf(data.dob); if (!(year >= now - 20 && year <= now)) bad("Student date of birth is outside the allowed range."); }
    const admissionNo = String(data.admissionNo ?? "").trim();
    const base = [eq(records.schoolId, user.schoolId), eq(records.type, "student"), isNull(records.deletedAt), ne(records.id, selfId)];
    if (admissionNo) {
      const [dup] = await db.select({ id: records.id }).from(records).where(and(...base, eq(sql<string>`data->>'admissionNo'`, admissionNo))).limit(1);
      if (dup) bad(`Admission number ${admissionNo} is already used by another student.`, 409);
    }
    const cls = String(data.classId ?? data.class ?? ""), section = String(data.section ?? ""), roll = String(data.roll ?? "");
    if (cls && roll) {
      const [dup] = await db.select({ id: records.id }).from(records).where(and(...base, eq(sql<string>`coalesce(data->>'classId', data->>'class')`, cls), eq(sql<string>`coalesce(data->>'section','')`, section), eq(sql<string>`data->>'roll'`, roll))).limit(1);
      if (dup) bad(`Roll ${roll} already exists in class ${cls} section ${section || "-"}.`, 409);
    }
  }
  if (kind === "result") {
    const max = data.max === undefined || data.max === "" ? 100 : Number(data.max);
    const frac = Number(data.classId ?? data.class) <= 2 ? 0.5 : 0.3;
    const nums: Record<string, number> = {};
    for (const key of ["continuous", "summative", "total"]) {
      if (data[key] === undefined || data[key] === "" || data[key] === null) continue;
      const n = Number(data[key]);
      if (!Number.isFinite(n) || n < 0) bad(`${key} must be a number of 0 or more.`);
      nums[key] = n;
    }
    if (!Number.isFinite(max) || max <= 0) bad("max must be a positive number.");
    if (nums.continuous !== undefined && nums.continuous > max * frac + 0.01) bad(`continuous marks cannot exceed ${max * frac}.`);
    if (nums.summative !== undefined && nums.summative > max * (1 - frac) + 0.01) bad(`summative marks cannot exceed ${max * (1 - frac)}.`);
    if (nums.total !== undefined && nums.total > max) bad(`total marks cannot exceed ${max}.`);
  }
}
