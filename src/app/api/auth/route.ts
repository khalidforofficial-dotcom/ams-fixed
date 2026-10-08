import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { createHash } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/db";
import { auditLogs, loginAttempts, records, schools, sessions, users } from "@/db/schema";
import { clearSession, cookieSecure, createSession, ensureSeed, getSession, hashPassword, logAudit, verifyPassword } from "@/lib/server";

export const dynamic = "force-dynamic";
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const ACCOUNT_LIMIT = 5;
const IP_LIMIT = 20;

function clientIp(request: Request) {
  return (request.headers.get("x-forwarded-for")?.split(",")[0] || request.headers.get("x-real-ip") || "unknown").trim();
}

async function attempt(key: string) {
  const [row] = await db.select().from(loginAttempts).where(eq(loginAttempts.key, key)).limit(1);
  return row;
}

async function recordFailure(key: string, limit: number) {
  const current = await attempt(key);
  const expired = !current || Date.now() - current.updatedAt.getTime() > LOGIN_WINDOW_MS || Boolean(current.lockedUntil && current.lockedUntil <= new Date());
  const failures = (expired ? 0 : Number(current.failures || 0)) + 1;
  const lockedUntil = failures >= limit ? new Date(Date.now() + LOGIN_WINDOW_MS) : null;
  await db.insert(loginAttempts).values({ key, failures: String(failures), lockedUntil }).onConflictDoUpdate({
    target: loginAttempts.key,
    set: { failures: String(failures), lockedUntil, updatedAt: new Date() },
  });
  return { failures, lockedUntil };
}

async function isLocked(key: string) {
  const row = await attempt(key);
  return Boolean(row?.lockedUntil && row.lockedUntil > new Date());
}

export async function GET() {
  const school = await ensureSeed();
  const user = await getSession();
  const [admin] = await db.select({ id: users.id }).from(users).where(and(eq(users.schoolId, school.id), eq(users.role, "admin"), eq(users.active, true))).limit(1);
  return Response.json({ user, school: { id: school.id, nameEn: school.nameEn, nameBn: school.nameBn, demoMode: school.demoMode, settings: school.settings }, serverTime: new Date().toISOString(), setupRequired: !admin });
}

export async function POST(request: Request) {
  await ensureSeed();
  const body = await request.json();
  const action = String(body.action || "login");
  if (action === "logout") { await clearSession(); return Response.json({ ok: true }); }
  if (action === "extend") {
    const user = await getSession();
    if (!user) return Response.json({ error: "Session expired" }, { status: 401 });
    const store = await cookies();
    const token = store.get("ams_session")?.value;
    if (token) {
      const tokenHash = createHash("sha256").update(token).digest("hex");
      await db.update(sessions).set({ expiresAt: new Date(Date.now() + 30 * 60 * 1000) }).where(eq(sessions.tokenHash, tokenHash));
      store.set("ams_session", token, { httpOnly: true, sameSite: "lax", secure: cookieSecure, maxAge: 1800, path: "/" });
    }
    return Response.json({ ok: true });
  }
  if (action === "changePassword") {
    const user = await getSession();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const parsed = z.object({ current: z.string(), password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/) }).safeParse(body);
    if (!parsed.success) return Response.json({ error: "Use 8+ characters with an uppercase letter and number" }, { status: 400 });
    const [stored] = await db.select().from(users).where(eq(users.id, user.id));
    if (!await verifyPassword(parsed.data.current, stored.passwordHash)) return Response.json({ error: "Current password is incorrect" }, { status: 400 });
    await db.update(users).set({ passwordHash: await hashPassword(parsed.data.password) }).where(eq(users.id, user.id));
    await logAudit(user, "password.changed", "user", user.id);
    return Response.json({ ok: true });
  }
  if (action === "remove-demo") {
    const me = await getSession();
    if (!me || me.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });
    const p = z.object({ email: z.string().email(), password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/), schoolNameEn: z.string().min(2), schoolNameBn: z.string().optional() }).safeParse(body);
    if (!p.success) return Response.json({ error: "Enter a new admin email, a strong new password (8+ chars, a capital letter and a number) and the school name" }, { status: 400 });
    await db.delete(records).where(eq(records.schoolId, me.schoolId));
    await db.delete(users).where(and(eq(users.schoolId, me.schoolId), ne(users.role, "admin")));
    await db.update(users).set({ email: p.data.email, passwordHash: await hashPassword(p.data.password) }).where(eq(users.id, me.id));
    await db.update(schools).set({ demoMode: false, nameEn: p.data.schoolNameEn, nameBn: p.data.schoolNameBn || p.data.schoolNameEn }).where(eq(schools.id, me.schoolId));
    await logAudit(me, "demo.removed", "settings");
    return Response.json({ ok: true });
  }
  if (action === "setup") {
    const parsed = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/), setupToken: z.string().optional() }).safeParse(body);
    if (!parsed.success) return Response.json({ error: "Enter a valid email and strong password" }, { status: 400 });
    if (process.env.SETUP_TOKEN && parsed.data.setupToken !== process.env.SETUP_TOKEN) return Response.json({ error: "Invalid setup token" }, { status: 403 });
    const [school] = await db.select().from(schools).limit(1);
    const [admin] = await db.select({ id: users.id }).from(users).where(and(eq(users.schoolId, school.id), eq(users.role, "admin"), eq(users.active, true))).limit(1);
    if (admin) return Response.json({ error: "Administrator setup is already complete" }, { status: 409 });
    const [user] = await db.insert(users).values({ schoolId: school.id, role: "admin", name: parsed.data.name, email: parsed.data.email, passwordHash: await hashPassword(parsed.data.password) }).returning();
    await createSession(user.id);
    return Response.json({ ok: true });
  }

  const parsed = z.object({ role: z.enum(["admin", "teacher", "student"]), identifier: z.string().min(2), password: z.string().min(4), dob: z.string().optional() }).safeParse(body);
  if (!parsed.success) return Response.json({ error: "Please complete all required fields" }, { status: 400 });
  const { role, identifier, password, dob } = parsed.data;
  const ip = clientIp(request);
  const accountKey = `account:${role}:${identifier.toLowerCase()}`;
  const ipKey = `ip:${ip}`;
  if (await isLocked(accountKey) || await isLocked(ipKey)) return Response.json({ error: "Too many attempts. Try again in 15 minutes." }, { status: 429 });
  const [school] = await db.select().from(schools).limit(1);
  const query = role === "student"
    ? and(eq(users.schoolId, school.id), eq(users.role, role), eq(users.admissionNo, identifier), eq(users.dob, dob || ""))
    : and(eq(users.schoolId, school.id), eq(users.role, role), identifier.includes("@") ? eq(users.email, identifier) : eq(users.mobile, identifier));
  const [user] = await db.select().from(users).where(query).limit(1);
  if (!user || !await verifyPassword(password, user.passwordHash)) {
    const account = await recordFailure(accountKey, ACCOUNT_LIMIT);
    await recordFailure(ipKey, IP_LIMIT);
    await db.insert(auditLogs).values({ schoolId: school.id, actor: identifier, action: "auth.login_failed", resourceType: "session", details: { role, ip } });
    return Response.json({ error: `Invalid credentials${account.failures < ACCOUNT_LIMIT ? ` · ${ACCOUNT_LIMIT - account.failures} attempts remaining` : ""}` }, { status: 401 });
  }
  await db.delete(loginAttempts).where(eq(loginAttempts.key, accountKey));
  await db.delete(loginAttempts).where(eq(loginAttempts.key, ipKey));
  await createSession(user.id);
  await db.insert(auditLogs).values({ schoolId: user.schoolId, userId: user.id, actor: user.name, action: "auth.login", resourceType: "session", details: { ip } });
  return Response.json({ ok: true });
}
