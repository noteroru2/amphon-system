// backend/src/routes/inventory.js
import express from "express";
import { prisma } from "../db.js";

const router = express.Router();

// -------- helpers --------
const toNumber = (v) => {
  if (v === null || v === undefined) return 0;
  // Prisma Decimal -> string/Decimal-like
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const normalizeStatus = (item) => {
  const available = Number(item.quantityAvailable ?? 0);
  if (available <= 0) return "SOLD";
  return item.status || "IN_STOCK";
};

// -------- 1) LIST: GET /api/inventory --------
// สำหรับหน้า InventoryPage.tsx
router.get("/", async (req, res) => {
  try {
    const items = await prisma.inventoryItem.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        name: true,
        serial: true,
        status: true,
        sourceType: true,
        cost: true,
        targetPrice: true,
        sellingPrice: true,
        quantity: true,
        quantityAvailable: true,
        quantitySold: true,
        createdAt: true,
      },
    });

    const result = (items || []).map((it) => ({
      id: it.id,
      code: it.code,
      name: it.name,
      serial: it.serial,
      status: normalizeStatus(it),
      sourceType: it.sourceType || "-",
      cost: toNumber(it.cost),
      targetPrice: toNumber(it.targetPrice),
      sellingPrice: toNumber(it.sellingPrice),
      quantity: Number(it.quantity ?? 1),
      quantityAvailable: Number(it.quantityAvailable ?? 0),
      quantitySold: Number(it.quantitySold ?? 0),
      createdAt: it.createdAt,
    }));

    res.json(result);
  } catch (err) {
    console.error("GET /api/inventory error:", err);
    res
      .status(500)
      .json({ message: "ไม่สามารถดึงข้อมูลคลังสินค้าได้", error: String(err) });
  }
});

// -------- 2) DETAIL: GET /api/inventory/:id --------
// ใช้สำหรับหน้าแจ้งขาย / print / bulk receipt fetch latest
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "id ไม่ถูกต้อง" });

    const it = await prisma.inventoryItem.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        name: true,
        serial: true,
        status: true,
        sourceType: true,
        storageLocation: true,

        cost: true,
        targetPrice: true,
        sellingPrice: true,

        quantity: true,
        quantityAvailable: true,
        quantitySold: true,

        buyerName: true,
        buyerPhone: true,
        buyerAddress: true,
        buyerTaxId: true,

        createdAt: true,
        updatedAt: true,
      },
    });

    if (!it) return res.status(404).json({ message: "ไม่พบสินค้า" });

    res.json({
      id: it.id,
      code: it.code,
      name: it.name,
      title: it.name, // เผื่อบางหน้า/printHelpers ยังอ้าง title
      serial: it.serial,
      status: normalizeStatus(it),
      sourceType: it.sourceType || "-",
      storageLocation: it.storageLocation || null,

      cost: toNumber(it.cost),
      targetPrice: toNumber(it.targetPrice),
      sellingPrice: toNumber(it.sellingPrice),

      quantity: Number(it.quantity ?? 1),
      quantityAvailable: Number(it.quantityAvailable ?? 0),
      quantitySold: Number(it.quantitySold ?? 0),

      buyerName: it.buyerName || null,
      buyerPhone: it.buyerPhone || null,
      buyerAddress: it.buyerAddress || null,
      buyerTaxId: it.buyerTaxId || null,

      createdAt: it.createdAt,
      updatedAt: it.updatedAt,
    });
  } catch (err) {
    console.error("GET /api/inventory/:id error:", err);
    res.status(500).json({ message: "ไม่สามารถดึงรายละเอียดสินค้าได้", error: String(err) });
  }
});

// -------- 3) SELL: POST /api/inventory/:id/sell --------
// รองรับขาย “บางส่วน” ด้วย quantity
router.post("/:id/sell", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "id ไม่ถูกต้อง" });

    const {
      sellingPrice,
      quantity = 1,
      buyerName,
      buyerPhone,
      buyerAddress,
      buyerTaxId,
    } = req.body || {};

    const qty = Number(quantity ?? 1);
    const price = Number(sellingPrice ?? 0);

    if (!Number.isFinite(qty) || qty <= 0) {
      return res.status(400).json({ message: "quantity ต้องมากกว่า 0" });
    }
    if (!Number.isFinite(price) || price <= 0) {
      return res.status(400).json({ message: "sellingPrice ต้องมากกว่า 0" });
    }

    // ใช้ transaction กัน race-condition / ตัดสต๊อกให้ถูก
    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          code: true,
          cost: true,
          status: true,
          quantity: true,
          quantityAvailable: true,
          quantitySold: true,
        },
      });

      if (!item) {
        const e = new Error("NOT_FOUND");
        e.code = "NOT_FOUND";
        throw e;
      }

      const available = Number(item.quantityAvailable ?? 0);
      const sold = Number(item.quantitySold ?? 0);

      if (available <= 0) {
        const e = new Error("OUT_OF_STOCK");
        e.code = "OUT_OF_STOCK";
        throw e;
      }
      if (qty > available) {
        const e = new Error("QTY_EXCEED");
        e.code = "QTY_EXCEED";
        e.available = available;
        throw e;
      }

      const newAvailable = available - qty;
      const newSold = sold + qty;

      const status = newAvailable === 0 ? "SOLD" : "IN_STOCK";

      // profit = (ขาย - ทุน) * qty (ถ้ามีทุน)
      const costNum = toNumber(item.cost);
      const profit = costNum > 0 ? (price - costNum) * qty : 0;

      const updated = await tx.inventoryItem.update({
        where: { id },
        data: {
          sellingPrice: price,
          quantityAvailable: newAvailable,
          quantitySold: newSold,
          status,

          buyerName: buyerName ?? null,
          buyerPhone: buyerPhone ?? null,
          buyerAddress: buyerAddress ?? null,
          buyerTaxId: buyerTaxId ?? null,

          grossProfit: profit,
          netProfit: profit,
        },
      });

      // ลง cashbook: รายได้จากการขายสินค้า
      await tx.cashbookEntry.create({
        data: {
          type: "IN",
          category: "INVENTORY_SALE",
          amount: price * qty,
          profit: profit,
          inventoryItemId: item.id,
          description: `ขายสินค้า ${item.name} (${item.code}) จำนวน ${qty} ชิ้น`,
        },
      });

      return updated;
    });

    // ส่งกลับแบบ friendly ต่อ frontend
    res.json({
      id: result.id,
      code: result.code,
      name: result.name,
      title: result.name,
      serial: result.serial,
      status: normalizeStatus(result),
      sourceType: result.sourceType || "-",

      cost: toNumber(result.cost),
      targetPrice: toNumber(result.targetPrice),
      sellingPrice: toNumber(result.sellingPrice),

      quantity: Number(result.quantity ?? 1),
      quantityAvailable: Number(result.quantityAvailable ?? 0),
      quantitySold: Number(result.quantitySold ?? 0),

      buyerName: result.buyerName || null,
      buyerPhone: result.buyerPhone || null,
      buyerAddress: result.buyerAddress || null,
      buyerTaxId: result.buyerTaxId || null,

      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    });
  } catch (err) {
    console.error("POST /api/inventory/:id/sell error:", err);

    // error mapping (จาก transaction)
    if (err?.code === "NOT_FOUND" || String(err?.message) === "NOT_FOUND") {
      return res.status(404).json({ message: "ไม่พบสินค้า" });
    }
    if (err?.code === "OUT_OF_STOCK" || String(err?.message) === "OUT_OF_STOCK") {
      return res.status(400).json({ message: "สินค้าหมดสต๊อกแล้ว" });
    }
    if (err?.code === "QTY_EXCEED" || String(err?.message) === "QTY_EXCEED") {
      return res.status(400).json({
        message: "จำนวนขายมากกว่าสต๊อกที่เหลือ",
        available: err.available ?? undefined,
      });
    }

    res.status(500).json({ message: "บันทึกการขายไม่สำเร็จ", error: String(err) });
  }
});

export default router;
