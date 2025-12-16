// backend/src/db.js
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

// ป้องกัน Prisma client ซ้ำใน dev / hot reload
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
