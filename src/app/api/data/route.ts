import { and, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { auditLogs, records, schools } from "@/db/schema";
import { ensureSeed, fetchRecords, getSession, logAudit } from "@/lib/server";
import { createRecord, listRecords, updateRecord } from "@/lib/server/data";
import { HttpError } from "@/lib/server/core";

export const dynamic = "force-dynamic";
const recordSchema = z.object({ id: z.string().min(2).max(100).regex(/^[a-zA-Z0-9_-]+$/), type: z.string().min(2).max(40), data: z.record(z.string(), z.unknown()) });
const roleKinds: Record<string, string[]> = {
  teacher: ["teacher", "student", "attendance", "notice", "holiday", "routine", "syllabus", "result", "leave", "submission", "config"],
  student: ["student", "attendance", "notice", "holiday", "routine", "syllabus", "result", "payment", "config"],
};

export async function GET(request: Request) {
  await ensureSeed();
  const user = await getSession();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url), type = url.searchParams.get("type") || undefined, trash = url.searchParams.get("trash") === "1";
  if (type === "audit") {
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.schoolId, user.schoolId)).orderBy(desc(auditLogs.createdAt)).limit(500);
    return Response.json({ records: logs, serverTime: new Date().toISOString() });
  }
  if (trash) {
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
    const rows = await db.select().from(records).where(and(eq(records.schoolId, user.schoolId), isNotNull(records.deletedAt)));
    return Response.json({ records: rows });
  }
  try {
    if (user.role === "admin" && !type) return Response.json({ records: await fetchRecords(user), serverTime: new Date().toISOString() });
    if (type) return Response.json({ records: await listRecords(user, type, url.searchParams), serverTime: new Date().toISOString() });
    const groups = await Promise.all((roleKinds[user.role] || []).map((kind) => listRecords(user, kind, new URLSearchParams({ limit: "500" }))));
    return Response.json({ records: groups.flat(), serverTime: new Date().toISOString() });
  } catch (error) {
    if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json();
  if (body.action === "restore") {
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
    await db.update(records).set({ deletedAt: null, updatedAt: new Date() }).where(and(eq(records.id, String(body.id)), eq(records.schoolId, user.schoolId)));
    await logAudit(user, "record.restored", String(body.type), String(body.id));
    return Response.json({ ok: true });
  }
  const parsed = recordSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid record data" }, { status: 400 });
  const { id, type, data } = parsed.data;
  try {
    const [existing] = await db.select({ type: records.type }).from(records).where(and(eq(records.id, id), eq(records.schoolId, user.schoolId))).limit(1);
    if (existing && existing.type !== type) return Response.json({ error: "Record id already in use" }, { status: 409 });
    const saved = existing ? await updateRecord(user, type, id, data) : await createRecord(user, type, { id, data });
    if (["payment", "result", "student", "teacher", "certificate"].includes(type)) await logAudit(user, existing ? "record.updated" : "record.created", type, id, { offlineId: body.offlineId || null });
    return Response.json({ record: { id: saved.id, type: saved.kind, data: saved.data, createdAt: saved.createdAt, updatedAt: saved.updatedAt } });
  } catch (error) {
    if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

export async function DELETE(request: Request) {
  const user = await getSession();
  if (!user || user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
  const { id, type } = await request.json();
  if (!["student", "teacher", "payment"].includes(type)) await db.delete(records).where(and(eq(records.id, String(id)), eq(records.schoolId, user.schoolId)));
  else await db.update(records).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(records.id, String(id)), eq(records.schoolId, user.schoolId)));
  await logAudit(user, "record.deleted", String(type), String(id));
  return Response.json({ ok: true });
}

export async function PATCH(request: Request) {
  const user = await getSession();
  if (!user || user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
  const { nameEn, nameBn, settings } = await request.json();
  await db.update(schools).set({ nameEn, nameBn, settings, updatedAt: new Date() }).where(eq(schools.id, user.schoolId));
  await logAudit(user, "settings.updated", "settings");
  return Response.json({ ok: true });
}
