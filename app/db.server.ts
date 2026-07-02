import { PrismaClient } from "@prisma/client";

declare global {
  var prismaGlobal: PrismaClient;
}

// The Supabase session pooler (DIRECT_URL, used in dev) caps total clients at
// pool_size 15. Prisma's default connection_limit is `num_cpus * 2 + 1`, which
// on a typical machine exceeds 15 — a burst of parallel queries (e.g. the ops
// dashboard) then trips "EMAXCONNSESSION: max clients reached". Cap Prisma's
// pool well under 15 and let extra queries queue (pool_timeout) instead.
function withDevPoolLimit(url: string): string {
  try {
    const u = new URL(url);
    if (!u.searchParams.has("connection_limit")) u.searchParams.set("connection_limit", "8");
    if (!u.searchParams.has("pool_timeout")) u.searchParams.set("pool_timeout", "30");
    return u.toString();
  } catch {
    return url;
  }
}

// Local dev runs one long-lived Node process that fires parallel queries (the
// dashboard loader does Promise.all of several). DATABASE_URL is the Supabase
// transaction pooler with connection_limit=1 — correct for Vercel serverless
// but it deadlocks locally. Use DIRECT_URL (session pooler) in dev so enough
// connections are available; production keeps DATABASE_URL unchanged.
function makeClient(): PrismaClient {
  const devUrl =
    process.env.NODE_ENV !== "production" ? process.env.DIRECT_URL : undefined;
  return new PrismaClient(
    devUrl ? { datasources: { db: { url: withDevPoolLimit(devUrl) } } } : undefined,
  );
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = makeClient();
  }
}

const prisma = global.prismaGlobal ?? makeClient();

export default prisma;
