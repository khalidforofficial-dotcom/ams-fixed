import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const schools = pgTable("schools", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique().default("demo-school"),
  nameEn: text("name_en").notNull(),
  nameBn: text("name_bn").notNull(),
  demoMode: boolean("demo_mode").notNull().default(true),
  settings: jsonb("settings").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id").notNull().references(() => schools.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  name: text("name").notNull(),
  email: text("email"),
  mobile: text("mobile"),
  admissionNo: text("admission_no"),
  dob: text("dob"),
  passwordHash: text("password_hash").notNull(),
  entityId: text("entity_id"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [uniqueIndex("users_school_email_uq").on(t.schoolId, t.email), index("users_admission_idx").on(t.admissionNo)]);

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const records = pgTable("records", {
  id: text("id").primaryKey(),
  schoolId: uuid("school_id").notNull().references(() => schools.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  data: jsonb("data").notNull(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
}, (t) => [index("records_school_type_idx").on(t.schoolId, t.type), index("records_deleted_idx").on(t.deletedAt)]);

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  schoolId: uuid("school_id").notNull().references(() => schools.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  details: jsonb("details").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index("audit_school_created_idx").on(t.schoolId, t.createdAt)]);

export const loginAttempts = pgTable("login_attempts", {
  key: text("key").primaryKey(),
  failures: text("failures").notNull().default("0"),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AppRecord = typeof records.$inferSelect;
