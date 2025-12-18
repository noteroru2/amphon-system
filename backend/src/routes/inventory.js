// backend/src/routes/inventory.js
import express from "express";
import { prisma } from "../db.js";

const router = express.Router();

// -------- helpers --------
const toNumber = (v) => {
  if (v === null || v === undefined) return 0;
  if (typeof v === "object" && typeof v.toNumber === "function") return v.toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const getAvailable = (item) => {
  const qa = item?.quantityAvailable;
  if (qa !== null && qa !== undefined && Number.isFinite(Number(qa))) {
    return Math.max(Number(qa), 0);
  }
  const q = Number(item?.quantity ?? 0);
  const sold = Number(item?.quantitySold ?? 0);
  return Math.max(q - sold, 0);
};

const normalizeStatus = (item) => {
  const available = getAvailable(item);
  if (available <= 0) return "SOLD";
  return item.status || "IN_STOCK";
};

// ✅ helper: find/create buyer customer (ใช้ใน sell เดี่ยว + bulk)
async function resolveBuyerCustomer(tx, buyer = {}) {
  const buyerName = (buyer.name || "").toString().trim();
  const buyerPhone = (buyer.phone || "").toString().trim();
  const buyerAddress = (buyer.address || "").toString().trim();
  const buyerTaxId = (buyer.taxId || "").toString().trim();
  const buyerIdCard = (buyer.idCard || "").toString().trim(); // optional

  let buyerCustomer = null;

  // idCard unique -> ใช้ได้ชัวร์
  if (buyerIdCard) {
    buyerCustomer = await tx.customer.upsert({
      where: { idCard: buyerIdCard },
      update: {
        name: buyerName || undefined,
        phone: buyerPhone || undefined,
        address: buyerAddress || undefined,
      },
      create: {
        name: buyerName || "ลูกค้า",
        idCard: buyerIdCard,
        phone: buyerPhone || null,
        address: buyerAddress || null,
        lineId: null,
        lineToken: null,
      },
    });
    return buyerCustomer;
  }

  // phone ไม่ unique -> findFirst แล้ว update/create
  if (buyerPhone) {
    buyerCustomer = await tx.customer.findFirst({ where: { phone: buyerPhone } });
    if (!buyerCustomer) {
      buyerCustomer = await tx.customer.create({
        data: {
          name: buyerName || "ลูกค้า",
          phone: buyerPhone,
          address: buyerAddress || null,
          lineId: null,
          lineToken: null,
        },
      });
    } else if (buyerName || buyerAddress) {
      buyerCustomer = await tx.customer.update({
        where: { id: buyerCustomer.id },
        data: {
          name: buyerName || buyerCustomer.name,
          address: buyerAddress || buyerCustomer.address,
        },
      });
    }
  }

  return buyerCustomer;
}

// -------- 1) LIST: GET /api/inventory --------
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
        storageLocation: true,
        cost: true,
        targetPrice: true,
        sellingPrice: true,
        quantity: true,
        quantityAvailable: true,
        quantitySold: true,
        createdAt: true,
      },
    });

    const result = (items || []).map((it) => {
      const available = getAvailable(it);
      return {
        id: it.id,
        code: it.code,
        name: it.name,
        serial: it.serial,
        status: normalizeStatus({ ...it, quantityAvailable: available }),
        sourceType: it.sourceType || "-",
        storageLocation: it.storageLocation || null,
        cost: toNumber(it.cost),
        targetPrice: toNumber(it.targetPrice),
        sellingPrice: toNumber(it.sellingPrice),
        quantity: Number(it.quantity ?? 1),
        quantityAvailable: Number(available),
        quantitySold: Number(it.quantitySold ?? 0),
        createdAt: it.createdAt,
      };
    });

    res.json(result);
  } catch (err) {
    console.error("GET /api/inventory error:", err);
    res.status(500).json({ message: "ไม่สามารถดึงข้อมูลคลังสินค้าได้", error: String(err) });
  }
});

// -------- 2) DETAIL: GET /api/inventory/:id --------
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "id ไม่ถูกต้อง" });

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
        grossProfit: true,
        netProfit: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!it) return res.status(404).json({ message: "ไม่พบสินค้า" });

    const available = getAvailable(it);

    res.json({
      id: it.id,
      code: it.code,
      name: it.name,
      title: it.name,
      serial: it.serial,
      status: normalizeStatus({ ...it, quantityAvailable: available }),
      sourceType: it.sourceType || "-",
      storageLocation: it.storageLocation || null,
      cost: toNumber(it.cost),
      targetPrice: toNumber(it.targetPrice),
      sellingPrice: toNumber(it.sellingPrice),
      quantity: Number(it.quantity ?? 1),
      quantityAvailable: Number(available),
      quantitySold: Number(it.quantitySold ?? 0),
      buyerName: it.buyerName || null,
      buyerPhone: it.buyerPhone || null,
      buyerAddress: it.buyerAddress || null,
      buyerTaxId: it.buyerTaxId || null,
      grossProfit: toNumber(it.grossProfit),
      netProfit: toNumber(it.netProfit),
      createdAt: it.createdAt,
      updatedAt: it.updatedAt,
    });
  } catch (err) {
    console.error("GET /api/inventory/:id error:", err);
    res.status(500).json({ message: "ไม่สามารถดึงรายละเอียดสินค้าได้", error: String(err) });
  }
});

// -------- 3) SELL: POST /api/inventory/:id/sell --------
router.post("/:id/sell", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "id ไม่ถูกต้อง" });

    const { sellingPrice, quantity = 1, buyerName, buyerPhone, buyerAddress, buyerTaxId } = req.body || {};
    const qty = Number(quantity ?? 1);
    const price = Number(sellingPrice ?? 0);

    if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ message: "quantity ต้องมากกว่า 0" });
    if (!Number.isFinite(price) || price <= 0) return res.status(400).json({ message: "sellingPrice ต้องมากกว่า 0" });

    const result = await prisma.$transaction(async (tx) => {
      const item = await tx.inventoryItem.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          code: true,
          serial: true,
          status: true,
          sourceType: true,
          cost: true,
          quantity: true,
          quantityAvailable: true,
          quantitySold: true,
          grossProfit: true,
          netProfit: true,
        },
      });

      if (!item) {
        const e = new Error("NOT_FOUND");
        e.code = "NOT_FOUND";
        throw e;
      }

      const available = getAvailable(item);
      const sold = Number(item.quantitySold ?? 0);

      if (available <= 0 || item.status === "SOLD") {
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

      // ✅ resolve buyer customer -> ทำให้ BUYER segment ขึ้น
      const buyerCustomer = await resolveBuyerCustomer(tx, {
        name: buyerName,
        phone: buyerPhone,
        address: buyerAddress,
        taxId: buyerTaxId,
      });

      const newAvailable = available - qty;
      const newSold = sold + qty;
      const nextStatus = newAvailable === 0 ? "SOLD" : item.status || "IN_STOCK";

      const totalQty = Math.max(Number(item.quantity ?? 1), 1);
      const totalCost = toNumber(item.cost);
      const unitCost = totalQty > 1 && totalCost > 0 ? totalCost / totalQty : totalCost;

      const profitThisSale = (price - unitCost) * qty;

      const prevGross = toNumber(item.grossProfit);
      const prevNet = toNumber(item.netProfit);

      const updated = await tx.inventoryItem.update({
        where: { id },
        data: {
          sellingPrice: price,
          quantityAvailable: newAvailable,
          quantitySold: newSold,
          status: nextStatus,

          buyerName: buyerName ?? null,
          buyerPhone: buyerPhone ?? null,
          buyerAddress: buyerAddress ?? null,
          buyerTaxId: buyerTaxId ?? null,
          buyerCustomerId: buyerCustomer ? buyerCustomer.id : null, // ✅ สำคัญ

          grossProfit: prevGross + profitThisSale,
          netProfit: prevNet + profitThisSale,
        },
      });

      await tx.cashbookEntry.create({
        data: {
          type: "IN",
          category: "INVENTORY_SALE",
          amount: price * qty,
          profit: profitThisSale,
          inventoryItemId: item.id,
          description: `ขายสินค้า ${item.name} (${item.code}) จำนวน ${qty} ชิ้น`,
        },
      });

      return updated;
    });

    const availableAfter = getAvailable(result);

    res.json({
      id: result.id,
      code: result.code,
      name: result.name,
      title: result.name,
      serial: result.serial,
      status: normalizeStatus({ ...result, quantityAvailable: availableAfter }),
      sourceType: result.sourceType || "-",
      cost: toNumber(result.cost),
      targetPrice: toNumber(result.targetPrice),
      sellingPrice: toNumber(result.sellingPrice),
      quantity: Number(result.quantity ?? 1),
      quantityAvailable: Number(availableAfter),
      quantitySold: Number(result.quantitySold ?? 0),
      buyerName: result.buyerName || null,
      buyerPhone: result.buyerPhone || null,
      buyerAddress: result.buyerAddress || null,
      buyerTaxId: result.buyerTaxId || null,
      grossProfit: toNumber(result.grossProfit),
      netProfit: toNumber(result.netProfit),
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    });
  } catch (err) {
    console.error("POST /api/inventory/:id/sell error:", err);

    if (err?.code === "NOT_FOUND" || String(err?.message) === "NOT_FOUND") return res.status(404).json({ message: "ไม่พบสินค้า" });
    if (err?.code === "OUT_OF_STOCK" || String(err?.message) === "OUT_OF_STOCK") return res.status(400).json({ message: "สินค้าหมดสต๊อกแล้ว" });
    if (err?.code === "QTY_EXCEED" || String(err?.message) === "QTY_EXCEED")
      return res.status(400).json({ message: "จำนวนขายมากกว่าสต๊อกที่เหลือ", available: err.available ?? undefined });

    res.status(500).json({ message: "บันทึกการขายไม่สำเร็จ", error: String(err) });
  }
});

// -------- 4) BULK SELL: POST /api/inventory/bulk-sell --------
router.post("/bulk-sell", async (req, res) => {
  try {
    const { items, buyer } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "items ต้องเป็น array และห้ามว่าง" });
    }

    const cleanItems = items.map((x) => ({
      id: Number(x.id),
      quantity: Number(x.quantity ?? 1),
      sellingPrice: Number(x.sellingPrice ?? 0),
    }));

    for (const it of cleanItems) {
      if (!Number.isFinite(it.id) || it.id <= 0) return res.status(400).json({ message: "id ไม่ถูกต้อง" });
      if (!Number.isFinite(it.quantity) || it.quantity <= 0) return res.status(400).json({ message: "quantity ต้องมากกว่า 0" });
      if (!Number.isFinite(it.sellingPrice) || it.sellingPrice <= 0) return res.status(400).json({ message: "sellingPrice ต้องมากกว่า 0" });
    }

    const result = await prisma.$transaction(async (tx) => {
      // ✅ resolve buyer customer ครั้งเดียว (สำคัญ + เร็ว)
      const buyerCustomer = await resolveBuyerCustomer(tx, buyer || {});

      const soldItems = [];
      let grandTotal = 0;
      let grandProfit = 0;

      for (const reqIt of cleanItems) {
        const item = await tx.inventoryItem.findUnique({
          where: { id: reqIt.id },
          select: {
            id: true,
            code: true,
            name: true,
            serial: true,
            status: true,
            sourceType: true,
            cost: true,
            quantity: true,
            quantityAvailable: true,
            quantitySold: true,
            grossProfit: true,
            netProfit: true,
          },
        });

        if (!item) {
          const e = new Error("NOT_FOUND");
          e.code = "NOT_FOUND";
          e.itemId = reqIt.id;
          throw e;
        }

        const totalQty = Math.max(Number(item.quantity ?? 1), 1);
        const totalCost = toNumber(item.cost);
        const unitCost = totalQty > 1 && totalCost > 0 ? totalCost / totalQty : totalCost;

        const available = getAvailable(item);
        if (available <= 0 || item.status === "SOLD") {
          const e = new Error("OUT_OF_STOCK");
          e.code = "OUT_OF_STOCK";
          e.itemId = item.id;
          throw e;
        }
        if (reqIt.quantity > available) {
          const e = new Error("QTY_EXCEED");
          e.code = "QTY_EXCEED";
          e.itemId = item.id;
          e.available = available;
          throw e;
        }

        const amount = reqIt.sellingPrice * reqIt.quantity;
        const profitThis = (reqIt.sellingPrice - unitCost) * reqIt.quantity;

        const newAvailable = available - reqIt.quantity;
        const newSold = Number(item.quantitySold ?? 0) + reqIt.quantity;
        const nextStatus = newAvailable === 0 ? "SOLD" : item.status || "IN_STOCK";

        const prevGross = toNumber(item.grossProfit);
        const prevNet = toNumber(item.netProfit);

        const updated = await tx.inventoryItem.update({
          where: { id: item.id },
          data: {
            sellingPrice: reqIt.sellingPrice,
            quantityAvailable: newAvailable,
            quantitySold: newSold,
            status: nextStatus,

            buyerName: buyer?.name ?? null,
            buyerPhone: buyer?.phone ?? null,
            buyerAddress: buyer?.address ?? null,
            buyerTaxId: buyer?.taxId ?? null,
            buyerCustomerId: buyerCustomer ? buyerCustomer.id : null, // ✅ ทำให้ BUYER segment ขึ้น

            grossProfit: prevGross + profitThis,
            netProfit: prevNet + profitThis,
          },
        });

        await tx.cashbookEntry.create({
          data: {
            type: "IN",
            category: "INVENTORY_SALE",
            amount,
            profit: profitThis,
            inventoryItemId: item.id,
            description: `ขายสินค้า ${item.name} (${item.code}) จำนวน ${reqIt.quantity} ชิ้น`,
          },
        });

        soldItems.push({
          id: item.id,
          code: item.code,
          title: item.name,
          serial: item.serial || undefined,
          quantity: reqIt.quantity,
          unitPrice: reqIt.sellingPrice,
          amount,
          profit: profitThis,
          status: updated.status,
        });

        grandTotal += amount;
        grandProfit += profitThis;
      }

      return { soldItems, grandTotal, grandProfit };
    });

    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error("POST /api/inventory/bulk-sell error:", err);

    if (err?.code === "NOT_FOUND") return res.status(404).json({ message: "ไม่พบสินค้า", itemId: err.itemId });
    if (err?.code === "OUT_OF_STOCK") return res.status(400).json({ message: "สินค้าหมดสต๊อกแล้ว", itemId: err.itemId });
    if (err?.code === "QTY_EXCEED")
      return res.status(400).json({ message: "จำนวนขายมากกว่าสต๊อกที่เหลือ", itemId: err.itemId, available: err.available });

    return res.status(500).json({ message: "ขายหลายชิ้นไม่สำเร็จ", error: String(err) });
  }
});

export default router;
