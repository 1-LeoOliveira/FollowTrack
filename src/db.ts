import { Pool, neonConfig } from "@neondatabase/serverless";
import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";
import ws from "ws";

// Driver adapter em vez do query engine nativo (binario .so): elimina os
// problemas de empacotamento desse binario em funcoes serverless (Vercel).
neonConfig.webSocketConstructor = ws;

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaNeon(pool);
  return new PrismaClient({ adapter });
}

// Reaproveita a mesma instancia entre invocacoes de uma funcao serverless
// "quente" (e entre reloads do ts-node-dev), evitando esgotar o pool de
// conexoes do banco Postgres hospedado.
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
