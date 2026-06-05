import { PrismaClient } from "@prisma/client";

declare global {
  var prismaGlobal: PrismaClient;
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
    devUrl ? { datasources: { db: { url: devUrl } } } : undefined,
  );
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = makeClient();
  }
}

const prisma = global.prismaGlobal ?? makeClient();

export default prisma;
