import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Local dev: `vercel env pull .env.local`. On Vercel the variables are injected by the Neon integration.
config({ path: ".env.local", quiet: true });
config({ quiet: true });

// Direct (unpooled) URL first; the Neon integration may also expose POSTGRES_* aliases.
const url =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL ??
  process.env.POSTGRES_URL;
if (!url) {
  throw new Error(
    [
      "No database URL found for drizzle-kit.",
      "Set DATABASE_URL_UNPOOLED (direct) and DATABASE_URL (pooled).",
      "On Vercel: Project → Storage → connect your Neon database (enable Production + Preview),",
      "or add them under Project → Settings → Environment Variables, then redeploy.",
    ].join("\n"),
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Migrations / push go through the direct (non-PgBouncer) connection.
  dbCredentials: { url },
  strict: false,
  verbose: true,
});
