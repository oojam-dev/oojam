import { defineConfig } from "drizzle-kit";

// `npm run db:generate` diffs app/db/schema.ts against drizzle/meta and writes a new
// migration to drizzle/. It needs no database. `npm run db:migrate` applies them.
export default defineConfig({
  dialect: "postgresql",
  schema: "./app/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
