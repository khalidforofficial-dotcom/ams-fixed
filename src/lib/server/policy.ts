import "server-only";
import { and, eq, inArray, isNull, SQL, sql } from "drizzle-orm";
import { records } from "@/db/schema";
import type { SafeUser } from "@/lib/server";
import { deepEqual, HttpError } from "./core";

export const PUBLIC_CONFIG_KEYS = [
  "schoolInfo",
  "classes",
  "examTerms",
  "routineSubjects",
  "gradeScale",
  "session",
] as const;

const readable: Record<string, Set<string>> = {
  teacher: new Set(["teacher", "student", "attendance", "notice", "holiday", "routine", "syllabus", "result", "leave", "submission", "config"]),
  student: new Set(["student", "attendance", "notice", "holiday", "routine", "syllabus", "result", "payment", "config"]),
};

const filterFields: Record<string, Set<string>> = {
  student: new Set(["classId", "class", "section", "roll", "nameEn", "nameBn", "status"]),
  attendance: new Set(["classId", "class", "section", "studentId", "date", "status"]),
  teacher: new Set(["nameEn", "nameBn", "designation", "status"]),
  notice: new Set(["title", "titleBn", "category", "date"]),
  holiday: new Set(["title", "date"]),
  routine: new Set(["classId", "class", "classGroup", "term", "subject", "date"]),
  syllabus: new Set(["classId", "class", "title"]),
  result: new Set(["studentId", "classId", "class", "section", "term", "subject"]),
  payment: new Set(["studentId", "receiptNo", "date"]),
  leave: new Set(["teacherId", "status", "leaveType"]),
  submission: new Set(["teacherId", "category", "status"]),
  config: new Set(["key"]),
};

const teacherStudentFields = new Set(["admissionNo", "classId", "class", "section", "roll", "nameEn", "nameBn", "gender", "photo", "status"]);
const teacherProfilePrivate = new Set(["salary", "pin", "nid"]);
const studentOwnFields = new Set(["admissionNo", "classId", "class", "section", "roll", "nameEn", "nameBn", "gender", "dob", "bloodGroup", "nationality", "photo", "status", "fatherName", "motherName", "guardianName", "addressEn", "addressBn"]);

export function assertReadable(user: SafeUser, kind: string) {
  if (user.role === "admin") return;
  if (!readable[user.role]?.has(kind)) throw new HttpError(403, "Forbidden");
}

export function allowedQueryFields(user: SafeUser, kind: string) {
  if (user.role === "admin") return null;
  return filterFields[kind] ?? new Set<string>();
}

export function assertQueryAllowed(user: SafeUser, kind: string, q: string | null, filters: Record<string, string>) {
  if (user.role === "admin") return;
  const allowed = allowedQueryFields(user, kind) as Set<string>;
  const denied = Object.keys(filters).filter((key) => !allowed.has(key));
  if (denied.length) throw new HttpError(400, `Filtering is not allowed on: ${denied.join(", ")}`);
  if (q && !allowed.size) throw new HttpError(400, `Search is not allowed for ${kind}`);
}

export function scopeSql(user: SafeUser, kind: string, assignedClasses: string[] = []): SQL | undefined {
  const base = and(eq(records.schoolId, user.schoolId), eq(records.type, kind), isNull(records.deletedAt));
  if (user.role === "admin") return base;
  if (kind === "config") {
    return and(base, inArray(sql<string>`data->>'key'`, [...PUBLIC_CONFIG_KEYS]));
  }
  if (user.role === "teacher") {
    if (kind === "teacher") return and(base, eq(records.id, user.entityId ?? ""));
    if (["student", "attendance", "routine", "syllabus", "result"].includes(kind)) {
      if (!assignedClasses.length) return and(base, sql`false`);
      return and(base, inArray(sql<string>`coalesce(data->>'classId', data->>'class')`, assignedClasses));
    }
    if (["leave", "submission"].includes(kind)) return and(base, eq(sql<string>`data->>'teacherId'`, user.entityId ?? ""));
    return base;
  }
  if (user.role === "student") {
    if (kind === "student") return and(base, eq(records.id, user.entityId ?? ""));
    if (["attendance", "result", "payment"].includes(kind)) return and(base, eq(sql<string>`data->>'studentId'`, user.entityId ?? ""));
  }
  return base;
}

export function sanitizeOut(user: SafeUser, kind: string, data: Record<string, unknown>) {
  if (user.role === "admin") return data;
  if (user.role === "teacher" && kind === "student") return Object.fromEntries(Object.entries(data).filter(([key]) => teacherStudentFields.has(key)));
  if (user.role === "teacher" && kind === "teacher") return Object.fromEntries(Object.entries(data).filter(([key]) => !teacherProfilePrivate.has(key)));
  if (user.role === "student" && kind === "student") return Object.fromEntries(Object.entries(data).filter(([key]) => studentOwnFields.has(key)));
  if (kind === "config") return data.key && PUBLIC_CONFIG_KEYS.includes(String(data.key) as typeof PUBLIC_CONFIG_KEYS[number]) ? data : {};
  return data;
}

export function assertWrite(user: SafeUser, kind: string, data: Record<string, unknown>, existing?: Record<string, unknown>) {
  if (user.role === "admin") return;
  if (user.role === "teacher" && kind === "teacher" && user.entityId) {
    if (!existing) throw new HttpError(403, "Teachers cannot create teacher profiles");
    const allowed = new Set(["photo", "mobile", "addressEn", "addressBn"]);
    const keys = new Set([...Object.keys(existing), ...Object.keys(data)]);
    const changed = [...keys].filter((key) => !deepEqual(data[key], existing[key]));
    const denied = changed.filter((key) => !allowed.has(key));
    if (denied.length) throw new HttpError(403, `Teachers cannot change: ${denied.join(", ")}.`);
    return;
  }
  if (user.role === "teacher" && ["attendance", "leave", "submission"].includes(kind)) {
    if (data.teacherId && data.teacherId !== user.entityId) throw new HttpError(403, "Teachers can write only their own records");
    if (existing && kind !== "attendance") {
      const changed = ["status", "reviewNote", "reviewedBy", "reviewedAt"].filter((key) => !deepEqual(data[key], existing[key]));
      if (changed.length) throw new HttpError(403, `Teachers cannot change: ${changed.join(", ")}.`);
    }
    return;
  }
  throw new HttpError(403, "Forbidden");
}
