CREATE TABLE "shrine_respects" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"offering" text NOT NULL,
	"github_id" bigint,
	"login" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "shrine_respects_created_at_idx" ON "shrine_respects" USING btree ("created_at");