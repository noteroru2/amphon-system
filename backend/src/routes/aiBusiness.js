import express from "express";
import { prisma } from "../db.js";

const router = express.Router();

function toNumber(v) {
  if (v == null) return 0;
  if (typeof v === "object" && typeof v.toNumber === "function") return v.toNumber(); // Decimal
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function daysBetween(a, b) {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}
function startOfDay(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0);
}
function startOfMonth(year, month) {
  return new Date(year, month - 1, 1, 0, 0, 0);
}
function endOfMonth(year, month) {
  return new Date(year, month, 1, 0, 0, 0);
}

/**
 * GET /api/ai/business/overview
 * - ภาพรวม 3 วิ: มูลค่าสต๊อก, สัญญา ACTIVE, กำไรวันนี้, service fee เดือนนี้ (ถ้าคุณใส่ profit ใน cashbook แล้ว)
 */
router.get("/overview", async (req, res) => {
  try {
    const now = new Date();
    const todayStart = startOfDay(now);

    const year = Number(req.query.year || now.getFullYear());
    const month = Number(req.query.month || now.getMonth() + 1);
    const mStart = startOfMonth(year, month);
    const mEnd = endOfMonth(year, month);

    // 1) Inventory valuation (ของพร้อมขาย)
    const inStockItems = await prisma.inventoryItem.findMany({
      where: { status: "IN_STOCK" },
      select: { id: true, quantityAvailable: true, targetPrice: true, cost: true },
      take: 2000,
    });

    const stockValuationTarget = inStockItems.reduce(
      (sum, x) => sum + toNumber(x.targetPrice) * (x.quantityAvailable || 0),
      0
    );
    const stockValuationCost = inStockItems.reduce(
      (sum, x) => sum + toNumber(x.cost) * (x.quantityAvailable || 0),
      0
    );

    // 2) Active contracts count
    const activeContracts = await prisma.contract.count({ where: { status: "ACTIVE" } });

    // 3) Profit today (จาก cashbook.profit)
    const profitTodayAgg = await prisma.cashbookEntry.aggregate({
      where: { createdAt: { gte: todayStart, lt: now } },
      _sum: { profit: true },
    });
    const profitToday = toNumber(profitTodayAgg._sum.profit);

    // 4) Service fee this month (แบบ heuristic: contractId not null และ profit>0)
    const serviceFeeAgg = await prisma.cashbookEntry.aggregate({
      where: {
        createdAt: { gte: mStart, lt: mEnd },
        contractId: { not: null },
        profit: { gt: 0 },
      },
      _sum: { profit: true },
    });
    const serviceFeeThisMonth = toNumber(serviceFeeAgg._sum.profit);

    res.json({
      activeContracts,
      stockValuationTarget,
      stockValuationCost,
      profitToday,
      serviceFeeThisMonth,
      range: { year, month },
    });
  } catch (e) {
    console.error("GET /api/ai/business/overview error:", e);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * GET /api/ai/business/cards
 * คืน 4 cards: Promotion / Acquisition / SEO / Growth
 * NOTE: SEO/Keyword/Channel ต้องมี field leadSource/utm ใน Customer ถึงจะแม่น
 * ตอนนี้จะคืนเป็น placeholder + สิ่งที่ทำได้จากข้อมูลจริง
 */
router.get("/cards", async (req, res) => {
  try {
    const now = new Date();

    // ---------------- Promotion Strategy (Dead stock > 60 days) ----------------
    const deadDays = Number(req.query.deadDays || 60);
    const inStock = await prisma.inventoryItem.findMany({
      where: { status: "IN_STOCK" },
      select: {
        id: true,
        code: true,
        name: true,
        createdAt: true,
        cost: true,
        targetPrice: true,
        quantityAvailable: true,
      },
      take: 500,
      orderBy: { createdAt: "asc" },
    });

    const deadStock = inStock
      .map((x) => {
        const ageDays = daysBetween(new Date(x.createdAt), now);
        const cost = toNumber(x.cost);
        const target = toNumber(x.targetPrice);
        // Suggested discount: ถ้าตั้งขายสูงเกิน ให้ลดลงมาใกล้ target (ถ้าไม่มี cost ก็ลดแบบ conservative)
        const safeMinSell = cost > 0 ? cost * 1.05 : target * 0.85;
        const suggestedPrice = target > 0 ? Math.max(safeMinSell, target * 0.92) : safeMinSell;
        const suggestedDiscountPct =
          target > 0 ? Math.max(0, Math.round(((target - suggestedPrice) / target) * 100)) : 0;

        return {
          id: x.id,
          code: x.code,
          name: x.name,
          ageDays,
          qty: x.quantityAvailable || 0,
          cost,
          targetPrice: target,
          suggestedPrice: Math.round(suggestedPrice),
          suggestedDiscountPct,
        };
      })
      .filter((x) => x.ageDays >= deadDays && x.qty > 0)
      .slice(0, 8);

    // Bundle Deal (MVP): ยังไม่มี data association จริง → คืนแนะนำทั่วไป + TODO
    const bundleDeal = {
      note:
        "MVP: ยังไม่มีข้อมูล “ซื้อคู่กัน” (ต้องเก็บ sale_items) แต่แนะนำโปรเสริมมาตรฐาน: เมาส์/กระเป๋า/คีย์บอร์ด/ประกัน/ติดฟิล์ม",
      suggestions: [
        { main: "Notebook", bundle: "เมาส์ + กระเป๋า + ลง Windows" },
        { main: "iPhone", bundle: "ฟิล์ม + เคส + สายชาร์จ" },
      ],
    };

    // ---------------- Stock Acquisition (Top wanted list by turnover) ----------------
    // ใช้ sold (quantitySold>0 หรือ status != IN_STOCK) เป็น proxy turnover
    const recentlySold = await prisma.inventoryItem.findMany({
      where: {
        OR: [{ quantitySold: { gt: 0 } }, { status: { not: "IN_STOCK" } }],
      },
      select: { name: true, updatedAt: true },
      take: 800,
      orderBy: { updatedAt: "desc" },
    });

    // นับชื่อสินค้า (ง่าย ๆ) เพื่อหา “ขายออกบ่อย”
    const freq = new Map();
    for (const x of recentlySold) {
      const key = (x.name || "").trim();
      if (!key) continue;
      freq.set(key, (freq.get(key) || 0) + 1);
    }

    const topWanted = Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, soldCount: count }));

    const acquisition = {
      topWanted,
      overpricedWarning: {
        note:
          "ต้องมีราคาตลาดภายนอก/หรือบันทึกขายจริงมากขึ้นเพื่อแจ้งรุ่นราคาดิ่งแบบแม่น (Phase 2)",
      },
    };

    // ---------------- SEO / Marketing ----------------
    const seo = {
      bestChannel: {
        note:
          "ต้องเพิ่ม field ใน Customer เช่น leadSource (WALK_IN/FACEBOOK/GOOGLE/LINE) ถึงจะทำกราฟช่องทางได้ (ผมทำให้ได้ใน Phase ต่อไป)",
      },
      keywordTrends: {
        note:
          "ต้องมีระบบเก็บคำค้น (จากเว็บ/WordPress/Google Search Console) ก่อน ตอนนี้ยังไม่มี datasource",
      },
    };

    // ---------------- Growth Plan (Retention) ----------------
    // Retention proxy: ลูกค้าที่มี contracts มากกว่า 1
    const customers = await prisma.customer.findMany({
      select: { id: true, name: true, createdAt: true, contracts: { select: { id: true } } },
      take: 2000,
    });

    const totalCustomers = customers.length;
    const repeatCustomers = customers.filter((c) => (c.contracts?.length || 0) >= 2).length;
    const repeatRate = totalCustomers ? Math.round((repeatCustomers / totalCustomers) * 100) : 0;

    const growth = {
      repeatRate,
      newOpportunity: [
        "ลูกค้าจำนำ/รับซื้อ Notebook เยอะ → เปิดบริการอัปเกรด RAM/SSD (เพิ่มกำไรบริการ)",
        "ทำแพ็กเกจ “ตรวจเช็ค + ทำความสะอาด” ก่อนขาย (เพิ่มมูลค่า)",
      ],
    };

    res.json({
      promotion: { deadStock, bundleDeal },
      acquisition,
      seo,
      growth,
    });
  } catch (e) {
    console.error("GET /api/ai/business/cards error:", e);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;
