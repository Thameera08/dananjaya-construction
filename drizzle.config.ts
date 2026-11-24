import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// Local dev: `vercel env pull .env.local`. On Vercel the variables are injected by the Neon integration.
config({ path: ".env.local", quiet: true });
config({ quiet: true });

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_UNPOOLED (or DATABASE_URL) must be set for drizzle-kit");

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // Migrations / push go through the direct (non-PgBouncer) connection.
  dbCredentials: { url },
  strict: false,
  verbose: true,
});
