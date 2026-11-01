CREATE TABLE "monitor_daily_stats" (
	"monitor_id" uuid NOT NULL,
	"day" date NOT NULL,
	"total_checks" integer DEFAULT 0 NOT NULL,
	"ok_checks" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "monitor_daily_stats_monitor_id_day_pk" PRIMARY KEY("monitor_id","day")
);
--> statement-breakpoint
CREATE TABLE "status_page_monitors" (
	"status_page_id" uuid NOT NULL,
	"monitor_id" uuid NOT NULL,
	CONSTRAINT "status_page_monitors_status_page_id_monitor_id_pk" PRIMARY KEY("status_page_id","monitor_id")
);
--> statement-breakpoint
CREATE TABLE "status_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "status_pages_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "monitor_daily_stats" ADD CONSTRAINT "monitor_daily_stats_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_page_monitors" ADD CONSTRAINT "status_page_monitors_status_page_id_status_pages_id_fk" FOREIGN KEY ("status_page_id") REFERENCES "public"."status_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "status_page_monitors" ADD CONSTRAINT "status_page_monitors_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Backfill daily stats from the checks still within retention.
INSERT INTO "monitor_daily_stats" ("monitor_id", "day", "total_checks", "ok_checks")
SELECT "monitor_id", ("checked_at" AT TIME ZONE 'Asia/Seoul')::date, count(*), count(*) FILTER (WHERE "ok")
  FROM "checks"
 GROUP BY 1, 2;
