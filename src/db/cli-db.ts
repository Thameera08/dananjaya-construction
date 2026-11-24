/** DB client for CLI scripts (seed / create-admin). Uses the direct, unpooled Neon URL. */
import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

export function cliDb() {
  const url =
    process.env.DATABASE_URL_UNPOOLED ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL;
  if (!url) {
    console.error("✖ DATABASE_URL_UNPOOLED / DATABASE_URL is not set (try `vercel env pull .env.local`).");
    process.exit(1);
  }
  return drizzle({ client: neon(url), schema });
}

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : "";
}
export const flag = (name: string) => process.argv.includes(`--${name}`);
