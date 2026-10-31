import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

// Auth tables (user/session/account) are added in stage 2 by Better Auth.

export const monitorStatus = pgEnum("monitor_status", ["pending", "up", "down"]);
export const httpMethod = pgEnum("http_method", ["GET", "HEAD"]);
export const channelType = pgEnum("channel_type", ["slack", "email"]);

export const monitors = pgTable("monitors", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  method: httpMethod("method").notNull().default("GET"),
  intervalSec: integer("interval_sec").notNull().default(60), // 60 or 300
  timeoutMs: integer("timeout_ms").notNull().default(10000),
  enabled: boolean("enabled").notNull().default(true),
  status: monitorStatus("status").notNull().default("pending"),
  consecutiveFailures: integer("consecutive_failures").notNull().default(0),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  nextCheckAt: timestamp("next_check_at", { withTimezone: true }).notNull().defaultNow(),
  sslExpiresAt: timestamp("ssl_expires_at", { withTimezone: true }),
  sslCheckedAt: timestamp("ssl_checked_at", { withTimezone: true }),
  createdBy: text("created_by"), // FK to user added in stage 2
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
  (t) => [index("checks_monitor_checked_at_idx").on(t.monitorId, t.checkedAt)],
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
  (t) => [index("incidents_monitor_started_at_idx").on(t.monitorId, t.startedAt)],
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
