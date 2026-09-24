import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

const g = globalThis as unknown as { __orbitDb?: Promise<Db> };

async function connectNeon(url: string): Promise<Db> {
  const { neon } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-http");
  return drizzle({ client: neon(url), schema }) as unknown as Db;
}

async function connectPglite(url: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const target = url.replace(/^pglite:\/\//, "");
  const client = target === "memory" || target === "" ? new PGlite() : new PGlite(target);
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db as unknown as Db;
}

export function getDb(): Promise<Db> {
  if (!g.__orbitDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    g.__orbitDb = url.startsWith("pglite://") ? connectPglite(url) : connectNeon(url);
  }
  return g.__orbitDb;
}

export function isLocalDb() {
  return (process.env.DATABASE_URL ?? "").startsWith("pglite://");
}

export { schema };
