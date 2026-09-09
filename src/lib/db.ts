import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

/**
 * One adapter for both environments. libSQL speaks `file:` locally and
 * `libsql://` against Turso, so deploying does not change how queries run.
 */
function resolveConnection(): { url: string; authToken?: string } {
  const turso = process.env.TURSO_DATABASE_URL;
  if (turso) {
    return { url: turso, authToken: process.env.TURSO_AUTH_TOKEN };
  }
  return { url: process.env.DATABASE_URL ?? "file:./dev.db" };
}

// Next.js hot-reloads modules in dev, which would otherwise open a new
// connection on every edit. Keep one client on the global object.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  return new PrismaClient({ adapter: new PrismaLibSql(resolveConnection()) });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
