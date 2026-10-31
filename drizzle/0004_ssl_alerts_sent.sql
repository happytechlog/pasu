CREATE TABLE "ssl_alerts_sent" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"monitor_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"threshold_days" integer NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ssl_alerts_sent" ADD CONSTRAINT "ssl_alerts_sent_monitor_id_monitors_id_fk" FOREIGN KEY ("monitor_id") REFERENCES "public"."monitors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ssl_alerts_sent_unique" ON "ssl_alerts_sent" USING btree ("monitor_id","expires_at","threshold_days");