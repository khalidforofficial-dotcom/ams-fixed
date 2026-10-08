import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { records } from "@/db/schema";
import { getSession, logAudit } from "@/lib/server";
import { parseLegacyBackup } from "@/lib/server/legacy";

export async function POST(request: Request) {
  const user = await getSession();
  if (!user || user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json();
  const payload = body.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return Response.json({ error: "Legacy backup must be a JSON object" }, { status: 400 });
  const parsed = parseLegacyBackup(payload);
  const studentReport = parsed.report.student;
  if (!studentReport?.found) return Response.json({ error: "Invalid backup: students array is required" }, { status: 400 });
  const existingRows = await db.select({ data: records.data }).from(records).where(and(eq(records.schoolId, user.schoolId), eq(records.type, "student"), isNull(records.deletedAt)));
  const taken = new Set(existingRows.map((row) => String((row.data as Record<string, unknown>)?.admissionNo ?? "")).filter(Boolean));
  const droppedStudents = new Set<string>();
  parsed.records = parsed.records.filter((row) => {
    if (row.type !== "student") return true;
    const no = String((row.data as Record<string, unknown>).admissionNo ?? "");
    if (taken.has(no)) { droppedStudents.add(row.id); parsed.report.student.imported--; parsed.report.student.skipped++; parsed.report.student.reasons.push(`Admission number ${no} already exists; student skipped.`); return false; }
    taken.add(no); return true;
  });
  if (droppedStudents.size) parsed.records = parsed.records.filter((row) => {
    if (!droppedStudents.has(String((row.data as Record<string, unknown>).studentId ?? ""))) return true;
    const rep = parsed.report[row.type]; if (rep) { rep.imported--; rep.skipped++; rep.reasons.push("Belongs to a skipped duplicate student."); }
    return false;
  });
  const summary = Object.fromEntries(Object.entries(parsed.report).map(([kind, value]) => [kind, value.imported]));
  if (!body.commit) return Response.json({ ok: true, dryRun: true, report: parsed.report, summary, total: parsed.records.length, warnings: parsed.warnings.slice(0, 250) });
  const current = await db.select().from(records).where(eq(records.schoolId, user.schoolId));
  const snapshotId = `backup-${Date.now()}`;
  await db.insert(records).values({ id: snapshotId, schoolId: user.schoolId, type: "safetyBackup", data: { createdAt: new Date().toISOString(), reason: "Before legacy restore", records: current.map((row) => ({ id: row.id, type: row.type, data: row.data, deletedAt: row.deletedAt })) }, createdBy: user.id });
  for (let index = 0; index < parsed.records.length; index += 250) {
    await db.insert(records).values(parsed.records.slice(index, index + 250).map((row) => ({ ...row, schoolId: user.schoolId, createdBy: user.id }))).onConflictDoNothing();
  }
  await logAudit(user, "backup.restored", "migration", snapshotId, { report: parsed.report, warnings: parsed.warnings.length });
  return Response.json({ ok: true, report: parsed.report, summary, total: parsed.records.length, warnings: parsed.warnings, safetyBackup: snapshotId });
}
