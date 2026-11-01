CREATE TABLE "app_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"check_retention_days" integer DEFAULT 30 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_settings_single_row" CHECK ("app_settings"."id" = 1)
);
--> statement-breakpoint
CREATE INDEX "checks_checked_at_idx" ON "checks" USING btree ("checked_at");--> statement-breakpoint
INSERT INTO "app_settings" ("id") VALUES (1) ON CONFLICT DO NOTHING;
