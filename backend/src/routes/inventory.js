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

async function upsertCustomerBySeller(tx, seller) {
  const name = (seller?.name || "").toString().trim();
  const phone = (seller?.phone || "").toString().trim();
  const idCard = (seller?.idCard || "").toString().trim();
  const address = (seller?.address || "").toString().trim();

  if (!idCard && !phone && !name) return null;

  if (idCard) {
    return tx.customer.upsert({
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
  }

  if (phone) {
    const found = await tx.customer.findFirst({ where: { phone } });
    if (!found) {
      return tx.customer.create({
        data: { name: name || "ลูกค้า", phone, address: address || null },
      });
    }
    if (name || address) {
      return tx.customer.update({
        where: { id: found.id },
        data: {
          name: name || found.name,
          address: address || found.address,
        },
      });
    }
    return found;
  }

  return tx.customer.create({ data: { name: name || "ลูกค้า" } });
}


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

// ✅ upsert buyer customer ตาม schema จริง (idCard unique, phone ไม่ unique)
async function upsertBuyerCustomer(tx, buyer) {
  const name = (buyer?.name || "").toString().trim();
  const phone = (buyer?.phone || "").toString().trim();
  const idCard = (buyer?.idCard || "").toString().trim(); // optional
  const address = (buyer?.address || "").toString().trim();

  // ถ้าไม่กรอกอะไรเลย → ไม่สร้าง customer
  if (!idCard && !phone && !name) return null;

  // 1) มี idCard → upsert by idCard (unique)
  if (idCard) {
    return tx.customer.upsert({
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
  }

  // 2) ไม่มี idCard แต่มี phone → phone ไม่ unique เลยใช้ findFirst
  if (phone) {
    const found = await tx.customer.findFirst({ where: { phone } });
    if (!found) {
      return tx.customer.create({
        data: {
          name: name || "ลูกค้า",
          phone,
          address: address || null,
        },
      });
    }
    // อัปเดตถ้ามีข้อมูลใหม่
    if (name || address) {
      return tx.customer.update({
        where: { id: found.id },
        data: {
          name: name || found.name,
          address: address || found.address,
        },
      });
    }
    return found;
  }

  // 3) มีแค่ชื่อ → สร้าง customer ใหม่
  return tx.customer.create({
    data: { name: name || "ลูกค้า" },
  });
}

// -------- 1) LIST --------
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

// -------- 2) DETAIL --------
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
        buyerCustomerId: true,
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
      buyerCustomerId: it.buyerCustomerId || null,
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

// -------- 3) SELL (single) --------
router.post("/:id/sell", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "id ไม่ถูกต้อง" });

    const { sellingPrice, quantity = 1, buyerName, buyerPhone, buyerAddress, buyerTaxId, buyerIdCard } =
      req.body || {};

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

      // ✅ upsert buyer customer แล้วผูก buyerCustomerId
      const buyerCustomer = await upsertBuyerCustomer(tx, {
        name: buyerName,
        phone: buyerPhone,
        idCard: buyerIdCard,
        address: buyerAddress,
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
          buyerCustomerId: buyerCustomer ? buyerCustomer.id : null, // ✅ จุดสำคัญ

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
    return res.json({
      ok: true,
      id: result.id,
      name: result.name,
      code: result.code,
      quantityAvailable: Number(availableAfter),
      quantitySold: Number(result.quantitySold ?? 0),
      status: normalizeStatus({ ...result, quantityAvailable: availableAfter }),
    });
  } catch (err) {
    console.error("POST /api/inventory/:id/sell error:", err);
    if (err?.code === "NOT_FOUND") return res.status(404).json({ message: "ไม่พบสินค้า" });
    if (err?.code === "OUT_OF_STOCK") return res.status(400).json({ message: "สินค้าหมดสต๊อกแล้ว" });
    if (err?.code === "QTY_EXCEED") return res.status(400).json({ message: "จำนวนขายมากกว่าสต๊อกที่เหลือ", available: err.available });
    return res.status(500).json({ message: "บันทึกการขายไม่สำเร็จ", error: String(err) });
  }
});

// -------- 4) BULK SELL --------
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
      // ✅ upsert buyer ครั้งเดียว แล้วเอา id ไปผูกทุกชิ้น
      const buyerCustomer = await upsertBuyerCustomer(tx, buyer);

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

        const totalQty = Math.max(Number(item.quantity ?? 1), 1);
        const totalCost = toNumber(item.cost);
        const unitCost = totalQty > 1 && totalCost > 0 ? totalCost / totalQty : totalCost;

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
            buyerCustomerId: buyerCustomer ? buyerCustomer.id : null, // ✅ จุดสำคัญ

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

      return { soldItems, grandTotal, grandProfit, buyerCustomerId: buyerCustomer?.id ?? null };
    });

    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error("POST /api/inventory/bulk-sell error:", err);
    if (err?.code === "NOT_FOUND") return res.status(404).json({ message: "ไม่พบสินค้า", itemId: err.itemId });
    if (err?.code === "OUT_OF_STOCK") return res.status(400).json({ message: "สินค้าหมดสต๊อกแล้ว", itemId: err.itemId });
    if (err?.code === "QTY_EXCEED") return res.status(400).json({ message: "จำนวนขายมากกว่าสต๊อกที่เหลือ", itemId: err.itemId, available: err.available });
    return res.status(500).json({ message: "ขายหลายชิ้นไม่สำเร็จ", error: String(err) });
  }
});

// POST /api/inventory/intake
// รับซื้อเข้า (PURCHASE) + ผูก sellerCustomerId
router.post("/intake", async (req, res) => {
  try {
    const {
      seller, // {name, phone, idCard?, address?}
      item,   // {name, serial?, condition?, accessories?, storageLocation?}
      pricing // {cost, targetPrice?, appraisedPrice?}
    } = req.body || {};

    const name = (item?.name || "").toString().trim();
    if (!name) return res.status(400).json({ message: "item.name ห้ามว่าง" });

    const cost = Number(pricing?.cost ?? 0);
    if (!Number.isFinite(cost) || cost <= 0) {
      return res.status(400).json({ message: "pricing.cost ต้องมากกว่า 0" });
    }

    const result = await prisma.$transaction(async (tx) => {
      const sellerCustomer = await upsertCustomerBySeller(tx, seller);

      // สร้าง code แบบง่าย (คุณจะเปลี่ยนเป็น format สวย ๆ ก็ได้)
      const code = `INV-${Date.now()}`;

      const created = await tx.inventoryItem.create({
        data: {
          code,
          name,
          serial: item?.serial || null,
          condition: item?.condition || null,
          accessories: item?.accessories || null,
          storageLocation: item?.storageLocation || null,

          sourceType: "PURCHASE",
          cost: cost,
          appraisedPrice: pricing?.appraisedPrice ?? null,
          targetPrice: pricing?.targetPrice ?? null,

          quantity: 1,
          quantityAvailable: 1,
          quantitySold: 0,
          status: "IN_STOCK",

          sellerCustomerId: sellerCustomer ? sellerCustomer.id : null,
        },
      });

      // (ถ้าคุณอยากให้รับซื้อเข้าไปลง cashbook ด้วย ให้เปิดอันนี้)
      await tx.cashbookEntry.create({
        data: {
          type: "OUT",
          category: "INVENTORY_BUY_IN",
          amount: cost,
          profit: 0,
          inventoryItemId: created.id,
          description: `รับซื้อเข้า ${created.name} (${created.code})`,
        },
      });

      return { created, sellerCustomer };
    });

    return res.json({
      ok: true,
      inventoryItem: result.created,
      sellerCustomer: result.sellerCustomer,
    });
  } catch (err) {
    console.error("POST /api/inventory/intake error:", err);
    return res.status(500).json({ message: "รับซื้อเข้าไม่สำเร็จ", error: err?.message || String(err) });
  }
});


export default router;
