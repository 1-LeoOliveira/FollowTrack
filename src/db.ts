import { PrismaClient } from "@prisma/client";

// Reaproveita a mesma instancia entre invocacoes de uma funcao serverless
// "quente" (e entre reloads do ts-node-dev), evitando esgotar o pool de
// conexoes do banco Postgres hospedado.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
