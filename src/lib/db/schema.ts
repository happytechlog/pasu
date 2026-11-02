import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Auth tables. Shape follows Better Auth's core schema (user, session,
// account, verification); `role` is an additional field configured in
// src/lib/auth.ts.
// ---------------------------------------------------------------------------

export const userRole = pgEnum("user_role", ["admin", "member"]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRole("role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// Invite-only sign-up. The raw token is only ever in the emailed link;
// the DB stores its SHA-256 hash.
export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  role: userRole("role").notNull().default("member"),
  tokenHash: text("token_hash").notNull().unique(),
  invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Monitoring tables
// ---------------------------------------------------------------------------

export const monitorStatus = pgEnum("monitor_status", ["pending", "up", "down"]);
export const httpMethod = pgEnum("http_method", ["GET", "HEAD"]);
export const channelType = pgEnum("channel_type", ["slack", "email"]);

export const monitors = pgTable(
  "monitors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    method: httpMethod("method").notNull().default("GET"),
    intervalSec: integer("interval_sec").notNull().default(60), // 60 or 300
    timeoutMs: integer("timeout_ms").notNull().default(10000),
    // Comma-separated codes or classes, e.g. "2xx" or "200,301,4xx".
    // Parsed by src/lib/monitor/expected-status.ts.
    expectedStatus: text("expected_status").notNull().default("2xx"),
    enabled: boolean("enabled").notNull().default(true),
    status: monitorStatus("status").notNull().default("pending"),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    nextCheckAt: timestamp("next_check_at", { withTimezone: true }).notNull().defaultNow(),
    sslExpiresAt: timestamp("ssl_expires_at", { withTimezone: true }),
    sslCheckedAt: timestamp("ssl_checked_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // The worker polls `enabled AND next_check_at <= now()` every 10s.
  (t) => [index("monitors_due_idx").on(t.nextCheckAt).where(sql`${t.enabled}`)],
);

export const checks = pgTable(
  "checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
    ok: boolean("ok").notNull(),
    statusCode: integer("status_code"),
    responseTimeMs: integer("response_time_ms"),
    error: text("error"),
  },
  (t) => [
    index("checks_monitor_checked_at_idx").on(t.monitorId, t.checkedAt),
    // Retention purge deletes by age across all monitors.
    index("checks_checked_at_idx").on(t.checkedAt),
  ],
);

export const incidents = pgTable(
  "incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    reason: text("reason"),
  },
  (t) => [
    index("incidents_monitor_started_at_idx").on(t.monitorId, t.startedAt),
    // At most one open incident per monitor (guards against duplicates after pause/resume).
    uniqueIndex("incidents_one_open_per_monitor").on(t.monitorId).where(sql`${t.resolvedAt} is null`),
  ],
);

export const alertChannels = pgTable("alert_channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: channelType("type").notNull(),
  name: text("name").notNull(),
  target: text("target").notNull(), // Slack webhook URL or email address
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const monitorAlertChannels = pgTable(
  "monitor_alert_channels",
  {
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id")
      .notNull()
      .references(() => alertChannels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.monitorId, t.channelId] })],
);

// One row per SSL expiry alert sent. Keyed by the certificate's expiry date,
// so a renewed certificate (new expiry) can be alerted on again.
export const sslAlertsSent = pgTable(
  "ssl_alerts_sent",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    thresholdDays: integer("threshold_days").notNull(), // 14, 7 or 1
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("ssl_alerts_sent_unique").on(t.monitorId, t.expiresAt, t.thresholdDays)],
);

// Per-monitor daily check counts (day = KST calendar date). Incremented in the
// same transaction that stores each check, so it outlives `checks` retention
// and backs the 90-day bars on public status pages.
export const monitorDailyStats = pgTable(
  "monitor_daily_stats",
  {
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    totalChecks: integer("total_checks").notNull().default(0),
    okChecks: integer("ok_checks").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.monitorId, t.day] })],
);

// Public status pages (/status/[slug]), open without login.
export const statusPages = pgTable("status_pages", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  title: text("title").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const statusPageMonitors = pgTable(
  "status_page_monitors",
  {
    statusPageId: uuid("status_page_id")
      .notNull()
      .references(() => statusPages.id, { onDelete: "cascade" }),
    monitorId: uuid("monitor_id")
      .notNull()
      .references(() => monitors.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.statusPageId, t.monitorId] })],
);

// Team-wide settings edited by admins at /settings/general. Exactly one row
// (id = 1); read through src/lib/settings.ts, which falls back to defaults.
export const appSettings = pgTable(
  "app_settings",
  {
    id: integer("id").primaryKey().default(1),
    checkRetentionDays: integer("check_retention_days").notNull().default(30),
    // IANA zone for times in email alerts and Slack fallback text.
    alertTimeZone: text("alert_time_zone").notNull().default("Asia/Seoul"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("app_settings_single_row", sql`${t.id} = 1`)],
);
