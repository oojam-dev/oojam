CREATE TABLE "graffiti_pieces" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"github_id" bigint NOT NULL,
	"login" text NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"w" integer NOT NULL,
	"h" integer NOT NULL,
	"image_png" text NOT NULL,
	"link_url" text NOT NULL,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "graffiti_reports" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"piece_id" bigint NOT NULL,
	"reporter" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "graffiti_reports_piece_reporter_key" UNIQUE("piece_id","reporter")
);
--> statement-breakpoint
ALTER TABLE "graffiti_reports" ADD CONSTRAINT "graffiti_reports_piece_id_graffiti_pieces_id_fk" FOREIGN KEY ("piece_id") REFERENCES "public"."graffiti_pieces"("id") ON DELETE no action ON UPDATE no action;