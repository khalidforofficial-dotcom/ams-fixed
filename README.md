# EduPulse AMS

A bilingual, offline-ready Academy Management System for Bangladeshi primary schools (Classes 1–5), built with Next.js App Router, PostgreSQL, and Drizzle ORM.

## Run locally

Create the PostgreSQL role and database (run as a PostgreSQL superuser):

```bash
psql -U postgres -c "CREATE USER ams WITH PASSWORD 'replace-this-password';"
psql -U postgres -c "CREATE DATABASE ams OWNER ams;"
```

Configure and initialize the application:

```bash
cp .env.example .env # or create .env
# DATABASE_URL=postgresql://ams:replace-this-password@127.0.0.1:5432/ams
npm install
npx drizzle-kit push
npm run dev
```

Open `http://localhost:3000`. By default a fresh database shows the **Create administrator account** screen (no demo users, no default passwords). To try the demo school with sample data, start the app with `ENABLE_DEMO=true`.

### Production environment

- `DATABASE_URL` is required by both the app and `drizzle.config.ts`; no database credential is committed.
- `SETUP_TOKEN` is optional but strongly recommended. When set, the one-time `/api/auth/setup` request must include the same value as `setupToken`. Setup is rejected after the first active administrator exists.
- `COOKIE_SECURE` defaults to `true` when `NODE_ENV=production`. Leave it enabled behind HTTPS. Set `COOKIE_SECURE=false` only for an explicitly trusted HTTP-only development environment.
- Place secrets only in server environment variables; never use `NEXT_PUBLIC_` for these values.

Demo credentials are displayed only on the demo-mode login banner. Production deployments should disable/remove demo users. Passwords and portal PINs are bcrypt-hashed; none are stored in records or browser storage.

## Architecture and security

- Authentication uses opaque, random HTTP-only, SameSite session cookies with a 30-minute idle lifetime.
- Authorization is enforced in `src/lib/server.ts` and every route handler, not only in the client. Student records are scoped to the authenticated `entityId`; teachers can write only attendance, leave, and submissions; admin-only resources remain server protected.
- Student/account login locks for 15 minutes after five failed attempts. A separate IP limit throttles broad credential attacks, and every failed login is written to `audit_logs`.
- Sensitive operations create immutable rows in `audit_logs`.
- Students, teachers, and payments use 30-day soft-delete semantics.
- React escapes rendered values. The print renderer additionally HTML-escapes all record text.
- Upload implementations should proxy object storage with image/PDF MIME checks and a 2 MB limit in a production deployment. The current app stores compressed offline photo payloads in the queued record and syncs record metadata when online.

### Role boundary smoke test

Sign in as the demo student, request `/api/data?type=teacher` or try a POST to `/api/data`; the server returns no teacher rows and rejects writes. Student-visible payments/results/attendance are filtered to that student's ID. Teacher salary and all-school payment endpoints are admin-only.

## Offline operation

`public/sw.js` caches the app shell and successful GET responses. The latest authorized data snapshot is cached locally. Attendance and CRUD updates are applied optimistically; offline writes enter `ams_queue`, show as pending in the connectivity badge, and replay with stable IDs when the browser reconnects. Stable IDs prevent duplicate attendance and fee records. Queue items are processed independently; after three failed attempts an item moves to `ams_failed_queue` and a visible banner lets the user retry or discard it, so one bad write never blocks later writes.

For a production deployment, serve over HTTPS so service workers and secure cookies are enabled. Test by loading once, switching DevTools to Offline, marking attendance, then reconnecting.

## Legacy `ams_db_v1` import

1. Sign in as an administrator and open **Settings & Data**.
2. Select **Import legacy backup** and choose the old JSON export.
3. Review the dry-run counts and roll-matching warnings.
4. Confirm import only after resolving ambiguous class/roll matches.

The importer maps nested student/guardian/address fields, `t-*` teacher keys, grouped result objects, attendance and payment legacy IDs, custom terms, holiday notices, and class-group routines. It converts roll-keyed results to `studentId` and identifies ambiguous section matches. Before a committed import, it writes a complete safety snapshot as a `safetyBackup` record. Existing record IDs are never silently overwritten. `t-pin` and legacy settings passwords are never imported.

With the app running, execute the realistic dry-run + commit fixture:

```bash
npm run test:legacy
# Optional: AMS_TEST_URL=https://your-host AMS_TEST_ADMIN=... AMS_TEST_PASSWORD=... npm run test:legacy
```

The command fails unless all 3 students, 2 teachers, 6 subject results, and the holiday are reported as imported in both phases.

## Backups and exports

Settings can download a full JSON backup. Students, teachers, payments, certificates, and audit entries support CSV. Printable screens use browser-native printing with Bengali-capable system fonts (`Noto Sans Bengali` / `Nirmala UI`), preserving Bengali shaping in Save-to-PDF output.

## Database

Tables are defined in `src/db/schema.ts`:

- `schools`: bilingual identity and academic settings
- `users`: role accounts and password hashes
- `sessions`: hashed session tokens and expiry
- `records`: school-scoped typed domain records with soft deletes
- `audit_logs`: sensitive-action history
- `login_attempts`: portal rate limits

Use `npx drizzle-kit push` after schema changes. No Firebase configuration is required in this Next.js/PostgreSQL deployment; authorization equivalent to security rules is enforced at the API/database boundary.

## Update notes (security & validation)
- `ENABLE_DEMO=true` is required to seed the demo school and demo accounts (admin@demo.ams / Demo@2026, teacher@demo.ams / Teacher@2026). Never enable it on a real school's server.
- To turn a demo database into a real one: sign in as the demo admin and `POST /api/auth` with `{"action":"remove-demo","email":"new@admin.com","password":"NewStrong2026","schoolNameEn":"Your School"}`. It deletes all demo records and demo users and replaces the demo admin's email and password.
- Teachers cannot approve their own leave: new leave requests are always `pending`; only admins change `status`/`reviewNote`.
- The server rejects duplicate admission numbers, duplicate class + section + roll, invalid mobile numbers (01XXXXXXXXX), out-of-range birth dates and marks above the allowed maximum.
- Legacy import skips students whose admission number already exists, never invents birth dates (left blank with a warning), and uses an 18–75 age range for teachers.
- Copy `.env.example` to `.env`.
