// backend/src/routes/consignments.js
import express from "express";
import { prisma } from "../db.js";

const router = express.Router();

/* ---------------- helpers ---------------- */
const toNumber = (v, fallback = 0) => {
  if (v == null) return fallback;
  if (typeof v === "object" && typeof v.toNumber === "function") return v.toNumber(); // Prisma Decimal
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const toInt = (v, fallback = 1) => {
  const n = Math.floor(toNumber(v, fallback));
  return Number.isFinite(n) ? n : fallback;
};

const INVENTORY_STATUS = {
  IN_STOCK: "IN_STOCK",
  SOLD: "SOLD",
};

const CONSIGNMENT_STATUS = {
  ACTIVE: "ACTIVE",
  SOLD: "SOLD",
};

// ✅ gen consignment code ต่อปี: CONS-YYYY-00001
const genConsignmentCode = async (tx) => {
  const y = new Date().getFullYear();
  const count = await tx.consignmentContract.count({
    where: {
      createdAt: { gte: new Date(`${y}-01-01`), lt: new Date(`${y + 1}-01-01`) },
    },
  });
  return `CONS-${y}-${String(count + 1).padStart(5, "0")}`;
};

// ✅ gen inventory code: INV-YYYY-0001
const genInventoryCode = async (tx) => {
  const last = await tx.inventoryItem.findFirst({
    orderBy: { id: "desc" },
    select: { id: true },
  });
  const next = (last?.id || 0) + 1;
  const y = new Date().getFullYear();
  return `INV-${y}-${String(next).padStart(4, "0")}`;
};

const getAvailable = (inv) => {
  const qa = inv?.quantityAvailable;
  if (qa !== null && qa !== undefined && Number.isFinite(Number(qa))) return Math.max(Number(qa), 0);
  const q = Number(inv?.quantity ?? 0);
  const sold = Number(inv?.quantitySold ?? 0);
  return Math.max(q - sold, 0);
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

      targetPrice,
      netToSeller,
      advanceAmount,

      photos,
    } = req.body || {};

    // basic validate
    const name = (sellerName || "").toString().trim();
    if (!name) return res.status(400).json({ ok: false, message: "กรุณากรอกชื่อผู้ฝากขาย" });

    const item = (itemName || "").toString().trim();
    if (!item) return res.status(400).json({ ok: false, message: "กรุณากรอกชื่อสินค้า" });

    const adv = Math.max(0, toNumber(advanceAmount, 0));
    const netSeller = Math.max(0, toNumber(netToSeller, 0));
    const target = targetPrice == null || targetPrice === "" ? null : Math.max(0, toNumber(targetPrice, 0));

    const result = await prisma.$transaction(async (tx) => {
      // ✅ 1) upsert/หา Customer ของผู้ฝากขาย
      const idCard = (sellerIdCard || "").toString().trim();
      const phone = (sellerPhone || "").toString().trim();
      const address = (sellerAddress || "").toString().trim();

      let sellerCustomer = null;

      if (idCard) {
        sellerCustomer = await tx.customer.upsert({
          where: { idCard },
          update: {
            name: name || undefined,
            phone: phone || undefined,
            address: address || undefined,
          },
          create: {
            name: name || "ลูกค้า",
            idCard,
            phone: phone || null,
            address: address || null,
          },
        });
      } else if (phone) {
        sellerCustomer = await tx.customer.findFirst({ where: { phone } });
        if (!sellerCustomer) {
          sellerCustomer = await tx.customer.create({
            data: {
              name: name || "ลูกค้า",
              phone,
              address: address || null,
            },
          });
        } else {
          sellerCustomer = await tx.customer.update({
            where: { id: sellerCustomer.id },
            data: {
              name: name || sellerCustomer.name,
              address: address || sellerCustomer.address,
            },
          });
        }
      }

      // ✅ 2) สร้าง ConsignmentContract
      const contractCode = await genConsignmentCode(tx);

      const con = await tx.consignmentContract.create({
        data: {
          code: contractCode,

          sellerName: name || "ลูกค้า",
          sellerIdCard: idCard || null,
          sellerPhone: phone || null,
          sellerAddress: address || null,

          // ✅ ต้องมี field นี้ใน schema แล้ว + migrate แล้ว
          sellerCustomerId: sellerCustomer ? sellerCustomer.id : null,

          itemName: item,
          serial: serial || null,
          condition: condition || null,
          accessories: accessories || null,
          photos: photos ?? null,

          advanceAmount: adv,
          netToSeller: netSeller,
          targetPrice: target,

          status: CONSIGNMENT_STATUS.ACTIVE,
        },
      });

      // ✅ 3) สร้าง InventoryItem (เป็นสินค้าฝากขาย)
      const invCode = await genInventoryCode(tx);

      const inv = await tx.inventoryItem.create({
        data: {
          code: invCode,
          name: item,
          serial: serial || null,
          condition: condition || null,
          accessories: accessories || null,

          sourceType: "CONSIGNMENT",
          consignmentContractId: con.id,

          // ฝากขายปกติ "ไม่ใช่ทุนร้าน" แต่คุณจะเก็บเป็น 0 หรือ null ก็ได้
          cost: 0,
          targetPrice: target ?? null,
          sellingPrice: null,

          quantity: 1,
          quantityAvailable: 1,
          quantitySold: 0,

          status: INVENTORY_STATUS.IN_STOCK,
        },
      });

      // ✅ 4) update ConsignmentContract ให้ชี้ inventoryItemId (schema คุณกำหนด @unique)
      const con2 = await tx.consignmentContract.update({
        where: { id: con.id },
        data: { inventoryItemId: inv.id },
      });

      // ✅ 5) cashbook OUT (จ่ายเงินล่วงหน้าให้ผู้ฝากขาย)
      if (adv > 0) {
        await tx.cashbookEntry.create({
          data: {
            type: "OUT",
            category: "CONSIGNMENT_ADVANCE_OUT",
            amount: adv,
            profit: 0,
            inventoryItemId: inv.id,
            description: `จ่ายเงินรับฝากขาย (${con2.code}) ให้ ${name}`,
          },
        });
      }

      return { con: con2, inv, sellerCustomer };
    });

    return res.json({ ok: true, ...result });
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
      const available = getAvailable(inv);

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

          buyerName: buyerName?.trim() || null,
          buyerPhone: buyerPhone?.trim() || null,
          buyerAddress: buyerAddress?.trim() || null,
          buyerTaxId: buyerTaxId?.trim() || null,

          // เก็บกำไรเป็น “ค่าบริการร้าน” (commission)
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
