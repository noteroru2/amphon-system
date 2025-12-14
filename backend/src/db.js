import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

// backend/src/db.js
import "dotenv/config";          // ✅ โหลด .env ทันที

import pkg from "pg";
const { Pool } = pkg;

// ลอง log ออกมาดูด้วย (ช่วย debug)
console.log("DATABASE_URL from env:", process.env.DATABASE_URL);

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function query(text, params) {
  return pool.query(text, params);
}

export async function getClient() {
  return pool.connect();
}
