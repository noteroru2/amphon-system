// backend/src/routes/consignments.js
import express from "express";
import { prisma } from "../db.js";

const router = express.Router();

/* ---------------- helpers ---------------- */
const toNumber = (v, fallback = 0) => {
  if (v == null) return fallback;
  // Prisma Decimal
  if (typeof v === "object" && typeof v.toNumber === "function") return v.toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const toInt = (v, fallback = 1) => {
  const n = Math.floor(toNumber(v, fallback));
  return Number.isFinite(n) ? n : fallback;
};

const asArray = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  return [v].filter(Boolean);
};

// ✅ ให้ตรง enum จริงที่เจอบ่อยในโปรเจกต์คุณ
const INVENTORY_STATUS = {
  IN_STOCK: "IN_STOCK",
  SOLD_OUT: "SOLD_OUT",
};

const CONSIGNMENT_STATUS = {
  ACTIVE: "ACTIVE",
  SOLD: "SOLD",
};

// ✅ gen consignment code ต่อปี
const genConsignmentCode = async () => {
  const y = new Date().getFullYear();
  const count = await prisma.consignmentContract.count({
    where: {
      createdAt: { gte: new Date(`${y}-01-01`), lt: new Date(`${y + 1}-01-01`) },
    },
  });
  return `CONS-${y}-${String(count + 1).padStart(5, "0")}`;
};

// ✅ gen inventory code แบบเดียวกับ intake/forfeit: INV-YYYY-0001
const genInventoryCode = async () => {
  const last = await prisma.inventoryItem.findFirst({
    orderBy: { id: "desc" },
    select: { id: true },
  });
  const next = (last?.id || 0) + 1;
  const y = new Date().getFullYear();
  return `INV-${y}-${String(next).padStart(4, "0")}`;
};

/* ---------------- routes ---------------- */

// 1) create consignment + inventory + cashbook OUT (advance)
router.post("/", async (req, res) => {
  try {
    const {
      sellerName,
      sellerIdCard,
      sellerPhone,
      sellerAddress,

      itemName,
      serial,
      condition,
      accessories,
      photos,

      advanceAmount,
      netToSeller,
      targetPrice,

      quantity = 1,
      storageLocation,
    } = req.body || {};

    if (!sellerName?.trim()) return res.status(400).json({ ok: false, message: "กรุณากรอกชื่อผู้ฝากขาย" });
    if (!itemName?.trim()) return res.status(400).json({ ok: false, message: "กรุณากรอกชื่อสินค้า" });

    const adv = Math.max(0, toNumber(advanceAmount, 0));
    const net = Math.max(0, toNumber(netToSeller, 0));
    const tgt = Math.max(0, toNumber(targetPrice, 0));
    const qty = Math.max(1, toInt(quantity, 1));

    // NOTE: photos เก็บเป็น array ได้ (ถ้า schema เป็น Json หรือ String[])
    const photosArr = asArray(photos);

    const contractCode = await genConsignmentCode();
    const inventoryCode = await genInventoryCode();

    const created = await prisma.$transaction(async (tx) => {
      // 1) create inventory item
      const inv = await tx.inventoryItem.create({
        data: {
          code: inventoryCode,
          name: itemName.trim(),
          serial: serial?.trim() || null,
          condition: condition?.trim() || null,
          accessories: accessories?.trim() || null,
          storageLocation: storageLocation?.trim() || null,

          sourceType: "CONSIGNMENT",
          cost: adv, // เงินที่ร้านจ่ายจริงตอนรับฝากขาย (ถ้ามี)
          targetPrice: tgt > 0 ? tgt : null,
          sellingPrice: null,

          quantity: qty,
          quantityAvailable: qty,
          quantitySold: 0,

          status: INVENTORY_STATUS.IN_STOCK,
        },
      });

      // 2) create consignment contract
      const con = await tx.consignmentContract.create({
        data: {
          code: contractCode,

          sellerName: sellerName.trim(),
          sellerIdCard: sellerIdCard?.trim() || null,
          sellerPhone: sellerPhone?.trim() || null,
          sellerAddress: sellerAddress?.trim() || null,
          sellerCustomerId: customer.id,
          itemName: itemName.trim(),
          serial: serial?.trim() || null,
          condition: condition?.trim() || null,
          accessories: accessories?.trim() || null,
          photos: photosArr.length ? photosArr : null,

          advanceAmount: adv,
          netToSeller: net,
          targetPrice: tgt > 0 ? tgt : null,

          status: CONSIGNMENT_STATUS.ACTIVE,
          inventoryItemId: inv.id,
        },
        include: { inventoryItem: true },
      });

      // 3) cashbook OUT (จ่ายเงินให้ผู้ฝากขาย)
      if (adv > 0) {
        await tx.cashbookEntry.create({
          data: {
            type: "OUT",
            category: "CONSIGNMENT_ADVANCE_OUT",
            amount: adv,
            profit: 0,
            description: `จ่ายเงินรับฝากขาย (${contractCode}) ให้ ${sellerName.trim()}`,
            inventoryItemId: inv.id,
          },
        });
      }

      return { inv, con };
    });

    return res.json({ ok: true, ...created });
  } catch (err) {
    console.error("POST /api/consignments error:", err);
    return res.status(500).json({
      ok: false,
      message: "สร้างสัญญาฝากขายไม่สำเร็จ",
      error: String(err?.message || err),
    });
  }
});

// 2) list (default onlyOpen=1 => ACTIVE only)
router.get("/", async (req, res) => {
  try {
    const onlyOpen = String(req.query.onlyOpen ?? "1") === "1";

    const list = await prisma.consignmentContract.findMany({
      where: onlyOpen ? { status: CONSIGNMENT_STATUS.ACTIVE } : undefined,
      orderBy: { createdAt: "desc" },
      include: { inventoryItem: true },
    });

    return res.json(list);
  } catch (err) {
    console.error("GET /api/consignments error:", err);
    return res.status(500).json({
      ok: false,
      message: "ดึงรายการฝากขายไม่สำเร็จ",
      error: String(err?.message || err),
    });
  }
});

// 2.1) detail
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "id ไม่ถูกต้อง" });

    const con = await prisma.consignmentContract.findUnique({
      where: { id },
      include: { inventoryItem: true },
    });

    if (!con) return res.status(404).json({ ok: false, message: "ไม่พบสัญญาฝากขาย" });

    return res.json({
      consignment: con,
      customer: {
        name: con.sellerName,
        idCard: con.sellerIdCard,
        phone: con.sellerPhone,
        address: con.sellerAddress,
      },
      inventoryItem: con.inventoryItem,
    });
  } catch (err) {
    console.error("GET /api/consignments/:id error:", err);
    return res.status(500).json({
      ok: false,
      message: "ดึงรายละเอียดไม่สำเร็จ",
      error: String(err?.message || err),
    });
  }
});

// 3) sell consignment
router.post("/:id/sell", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ ok: false, message: "id ไม่ถูกต้อง" });

    const { salePrice, quantity = 1, buyerName, buyerPhone, buyerAddress, buyerTaxId } = req.body || {};

    const price = Math.max(0, toNumber(salePrice, 0));
    const qty = Math.max(1, toInt(quantity, 1));
    if (price <= 0) return res.status(400).json({ ok: false, message: "กรุณาระบุราคาขาย" });

    const result = await prisma.$transaction(async (tx) => {
      const con = await tx.consignmentContract.findUnique({
        where: { id },
        include: { inventoryItem: true },
      });

      if (!con) {
        const e = new Error("NOT_FOUND");
        throw e;
      }
      if (!con.inventoryItem) {
        const e = new Error("NO_INVENTORY");
        throw e;
      }

      const inv = con.inventoryItem;
      const available = Number(inv.quantityAvailable ?? 0);

      if (qty > available) {
        const e = new Error("QTY_EXCEED");
        e.available = available;
        throw e;
      }

      const netToSellerPerUnit = toNumber(con.netToSeller, 0);
      const sellerPayout = netToSellerPerUnit * qty;
      const grossSale = price * qty;

      const commissionFee = grossSale - sellerPayout;
      if (commissionFee < 0) {
        const e = new Error("PRICE_TOO_LOW");
        e.minSalePrice = netToSellerPerUnit;
        throw e;
      }

      const vatOnCommission = commissionFee * 0.07;

      // update inventory
      const newAvailable = available - qty;
      const newSold = Number(inv.quantitySold ?? 0) + qty;
      const newStatus = newAvailable === 0 ? INVENTORY_STATUS.SOLD_OUT : INVENTORY_STATUS.IN_STOCK;

      const updatedInv = await tx.inventoryItem.update({
        where: { id: inv.id },
        data: {
          sellingPrice: price,
          quantityAvailable: newAvailable,
          quantitySold: newSold,
          status: newStatus,

          buyerName: buyerName?.trim() || null,
          buyerPhone: buyerPhone?.trim() || null,
          buyerAddress: buyerAddress?.trim() || null,
          buyerTaxId: buyerTaxId?.trim() || null,

          grossProfit: commissionFee,
          netProfit: commissionFee,
        },
      });

      const updatedCon = await tx.consignmentContract.update({
        where: { id: con.id },
        data: {
          status: newAvailable === 0 ? CONSIGNMENT_STATUS.SOLD : CONSIGNMENT_STATUS.ACTIVE,
        },
      });

      // cashbook:
      // 1) IN รายรับจากลูกค้า
      await tx.cashbookEntry.create({
        data: {
          type: "IN",
          category: "CONSIGNMENT_SALE_IN",
          amount: grossSale,
          profit: 0,
          inventoryItemId: inv.id,
          description: `ขายฝากขาย ${con.code} จำนวน ${qty} ชิ้น`,
        },
      });

      // 2) OUT จ่ายให้ผู้ฝากขาย
      await tx.cashbookEntry.create({
        data: {
          type: "OUT",
          category: "CONSIGNMENT_PAYOUT_OUT",
          amount: sellerPayout,
          profit: 0,
          inventoryItemId: inv.id,
          description: `จ่ายให้ผู้ฝากขาย ${con.sellerName} ตามสัญญา ${con.code}`,
        },
      });

      // 3) IN ค่าบริการ (กำไร)
      await tx.cashbookEntry.create({
        data: {
          type: "IN",
          category: "CONSIGNMENT_COMMISSION_FEE",
          amount: commissionFee,
          profit: commissionFee,
          inventoryItemId: inv.id,
          description: `ค่าบริการฝากขาย ${con.code} (VAT 7% เฉพาะค่าบริการ ≈ ${vatOnCommission.toFixed(2)})`,
        },
      });

      return { updatedInv, updatedCon, commissionFee, vatOnCommission, sellerPayout, grossSale };
    });

    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error("POST /api/consignments/:id/sell error:", err);

    if (String(err.message) === "NOT_FOUND") return res.status(404).json({ ok: false, message: "ไม่พบสัญญาฝากขาย" });
    if (String(err.message) === "NO_INVENTORY") return res.status(400).json({ ok: false, message: "สัญญานี้ไม่มีสินค้าในคลัง" });
    if (String(err.message) === "QTY_EXCEED") return res.status(400).json({ ok: false, message: "จำนวนขายมากกว่าคงเหลือ", available: err.available });
    if (String(err.message) === "PRICE_TOO_LOW") return res.status(400).json({ ok: false, message: "ราคาขายต่ำกว่าที่สัญญากำหนด", minSalePrice: err.minSalePrice });

    return res.status(500).json({ ok: false, message: "ขายฝากขายไม่สำเร็จ", error: String(err?.message || err) });
  }
});

export default router;
