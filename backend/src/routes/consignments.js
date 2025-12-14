import express from "express";
import { prisma } from "../db.js";

const router = express.Router();

const toNumber = (v) => {
  if (v == null) return 0;
  if (typeof v === "object" && typeof v.toNumber === "function") return v.toNumber(); // Decimal
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const asArray = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  return [v].filter(Boolean);
};

// กัน enum พัง (ปรับให้ตรง enum จริงของคุณได้)
const INVENTORY_STATUS = {
  IN_STOCK: "IN_STOCK",
  SOLD: "SOLD", // ถ้า enum คุณไม่มี SOLD ให้เปลี่ยนเป็น SOLD_OUT / OUT_OF_STOCK ตามจริง
};

const CONSIGNMENT_STATUS = {
  ACTIVE: "ACTIVE",
  SOLD: "SOLD",
};

const genCode = async () => {
  const y = new Date().getFullYear();
  const count = await prisma.consignmentContract.count({
    where: { createdAt: { gte: new Date(`${y}-01-01`), lt: new Date(`${y + 1}-01-01`) } },
  });
  return `CONS-${y}-${String(count + 1).padStart(5, "0")}`;
};

// 1) create consignment + inventory + cashbook OUT
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

    if (!sellerName) return res.status(400).json({ message: "กรุณากรอกชื่อผู้ฝากขาย" });
    if (!itemName) return res.status(400).json({ message: "กรุณากรอกชื่อสินค้า" });

    const adv = toNumber(advanceAmount);
    const net = toNumber(netToSeller);
    const tgt = toNumber(targetPrice);
    const qty = Math.max(1, Math.floor(toNumber(quantity)));

    if (adv < 0 || net < 0 || tgt < 0) return res.status(400).json({ message: "จำนวนเงินไม่ถูกต้อง" });

    const code = await genCode();
    const photosArr = asArray(photos);

    const created = await prisma.$transaction(async (tx) => {
      // 1) create inventory item
      const inv = await tx.inventoryItem.create({
        data: {
          code: `CON-${Date.now()}`,
          name: itemName,
          serial: serial || null,
          condition: condition || null,
          accessories: accessories || null,
          storageLocation: storageLocation || null,

          sourceType: "CONSIGNMENT",
          cost: adv, // เงินจ่ายจริงตอนรับฝาก
          targetPrice: tgt || null,

          quantity: qty,
          quantityAvailable: qty,
          quantitySold: 0,

          status: INVENTORY_STATUS.IN_STOCK,
        },
      });

      // 2) create consignment contract
      const con = await tx.consignmentContract.create({
        data: {
          code,
          sellerName,
          sellerIdCard: sellerIdCard || null,
          sellerPhone: sellerPhone || null,
          sellerAddress: sellerAddress || null,

          itemName,
          serial: serial || null,
          condition: condition || null,
          accessories: accessories || null,
          photos: photosArr.length ? photosArr : null,

          advanceAmount: adv,
          netToSeller: net,
          targetPrice: tgt || null,

          status: CONSIGNMENT_STATUS.ACTIVE,
          inventoryItemId: inv.id,
        },
        include: { inventoryItem: true },
      });

      // 3) cashbook OUT (จ่ายเงินให้ลูกค้า)
      if (adv > 0) {
        await tx.cashbookEntry.create({
          data: {
            type: "OUT",
            category: "CONSIGNMENT_ADVANCE_OUT",
            amount: adv,
            profit: 0,
            description: `จ่ายเงินรับฝากขาย (${code}) ให้ ${sellerName}`,
            inventoryItemId: inv.id,
          },
        });
      }

      return { inv, con };
    });

    res.json(created); // { inv, con }
  } catch (err) {
    console.error("POST /api/consignments error:", err);
    res.status(500).json({ message: "สร้างสัญญาฝากขายไม่สำเร็จ", error: String(err?.message || err) });
  }
});

// 2) list (default: onlyOpen=1 => show ACTIVE only)
router.get("/", async (req, res) => {
  try {
    const onlyOpen = String(req.query.onlyOpen ?? "1") === "1";

    const list = await prisma.consignmentContract.findMany({
      where: onlyOpen ? { status: CONSIGNMENT_STATUS.ACTIVE } : undefined,
      orderBy: { createdAt: "desc" },
      include: { inventoryItem: true },
    });

    res.json(list);
  } catch (err) {
    console.error("GET /api/consignments error:", err);
    res.status(500).json({ message: "ดึงรายการฝากขายไม่สำเร็จ", error: String(err?.message || err) });
  }
});

// 2.1) detail for print/detail page
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "id ไม่ถูกต้อง" });

    const con = await prisma.consignmentContract.findUnique({
      where: { id },
      include: { inventoryItem: true },
    });

    if (!con) return res.status(404).json({ message: "ไม่พบสัญญาฝากขาย" });

    // normalize ให้ frontend เรียกง่าย
    res.json({
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
    res.status(500).json({ message: "ดึงรายละเอียดไม่สำเร็จ", error: String(err?.message || err) });
  }
});

// 3) sell consignment (คิดส่วนต่าง + VAT เฉพาะค่าบริการ)
router.post("/:id/sell", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { salePrice, quantity = 1, buyerName, buyerPhone, buyerAddress, buyerTaxId } = req.body || {};

    const price = toNumber(salePrice);
    const qty = Math.max(1, Math.floor(toNumber(quantity)));
    if (price <= 0) return res.status(400).json({ message: "กรุณาระบุราคาขาย" });

    const result = await prisma.$transaction(async (tx) => {
      const con = await tx.consignmentContract.findUnique({
        where: { id },
        include: { inventoryItem: true },
      });
      if (!con) throw new Error("NOT_FOUND");
      if (!con.inventoryItem) throw new Error("NO_INVENTORY");

      const inv = con.inventoryItem;
      const available = Number(inv.quantityAvailable ?? 0);
      if (qty > available) {
        const e = new Error("QTY_EXCEED");
        e.available = available;
        throw e;
      }

      const netToSeller = toNumber(con.netToSeller); // ต่อชิ้น
      const sellerPayout = netToSeller * qty;
      const grossSale = price * qty;

      const commissionFee = grossSale - sellerPayout;
      if (commissionFee < 0) {
        const e = new Error("PRICE_TOO_LOW");
        e.minSalePrice = netToSeller;
        throw e;
      }

      const vatOnCommission = commissionFee * 0.07;

      // update inventory (ตัดสต๊อก)
      const newAvailable = available - qty;
      const newSold = Number(inv.quantitySold ?? 0) + qty;

      const newStatus = newAvailable === 0 ? INVENTORY_STATUS.SOLD : INVENTORY_STATUS.IN_STOCK;

      const updatedInv = await tx.inventoryItem.update({
        where: { id: inv.id },
        data: {
          sellingPrice: price,
          quantityAvailable: newAvailable,
          quantitySold: newSold,
          status: newStatus,

          buyerName: buyerName || null,
          buyerPhone: buyerPhone || null,
          buyerAddress: buyerAddress || null,
          buyerTaxId: buyerTaxId || null,

          grossProfit: commissionFee,
          netProfit: commissionFee,
        },
      });

      const updatedCon = await tx.consignmentContract.update({
        where: { id: con.id },
        data: { status: newAvailable === 0 ? CONSIGNMENT_STATUS.SOLD : CONSIGNMENT_STATUS.ACTIVE },
      });

      // cashbook:
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

      await tx.cashbookEntry.create({
        data: {
          type: "IN",
          category: "CONSIGNMENT_COMMISSION_FEE",
          amount: commissionFee,
          profit: commissionFee,
          inventoryItemId: inv.id,
          description: `ค่าบริการฝากขาย ${con.code} (VAT 7% เฉพาะค่าบริการ = ${vatOnCommission.toFixed(2)})`,
        },
      });

      return { updatedInv, updatedCon, commissionFee, vatOnCommission, sellerPayout, grossSale };
    });

    res.json(result);
  } catch (err) {
    console.error("POST /api/consignments/:id/sell error:", err);

    if (String(err.message) === "NOT_FOUND") return res.status(404).json({ message: "ไม่พบสัญญาฝากขาย" });
    if (String(err.message) === "NO_INVENTORY") return res.status(400).json({ message: "สัญญานี้ไม่มีสินค้าในคลัง" });
    if (String(err.message) === "QTY_EXCEED") return res.status(400).json({ message: "จำนวนขายมากกว่าคงเหลือ", available: err.available });
    if (String(err.message) === "PRICE_TOO_LOW") return res.status(400).json({ message: "ราคาขายต่ำกว่าที่สัญญากำหนด", minSalePrice: err.minSalePrice });

    res.status(500).json({ message: "ขายฝากขายไม่สำเร็จ", error: String(err?.message || err) });
  }
});

export default router;
