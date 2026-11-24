import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

/** Runtime client: Neon HTTP driver over the pooled DATABASE_URL — no TCP cold start in Vercel Functions. */
function createDb() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local (or run `vercel env pull .env.local`).");
  }
  return drizzle({ client: neon(url), schema });
}

export type DB = ReturnType<typeof createDb>;

let instance: DB | undefined;

/** Created on first use, so builds and imports never need a live connection string. */
export const db = new Proxy({} as DB, {
  get(_target, prop) {
    instance ??= createDb();
    const value = Reflect.get(instance, prop, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
