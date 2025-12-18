// backend/src/routes/intake.js
import express from "express";
import multer from "multer";
import { prisma } from "../db.js";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

const clean = (v) => (v ? String(v).trim() : "");

const toNum = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const toInt = (v, fallback = 1) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : fallback;
};

const normalizeSourceType = (raw) => {
  const s = String(raw || "").trim().toUpperCase();
  if (!s) return "PURCHASE";
  if (s === "BUY_IN" || s === "BUYIN" || s === "BUY-IN") return "PURCHASE";
  if (s === "PURCHASE" || s === "FORFEIT" || s === "CONSIGNMENT") return s;
  return "PURCHASE";
};

router.post(
  "/",
  upload.fields([
    { name: "productPhotos", maxCount: 10 },
    { name: "idCardPhotos", maxCount: 5 },
    { name: "contractPhotos", maxCount: 10 },
  ]),
  async (req, res) => {
    try {
      const body = req.body || {};
      const files = req.files || {};

      const sellerName = clean(body.sellerName);
      const sellerIdCard = clean(body.sellerIdCard);
      const sellerPhone = clean(body.sellerPhone);
      const sellerAddress = clean(body.sellerAddress);
      const sellerLineId = clean(body.sellerLineId);

      const brandModel = clean(body.brandModel);
      const serial = clean(body.serial);
      const condition = clean(body.condition);
      const accessories = clean(body.accessories);

      const qtyValue = Math.max(1, toInt(body.quantity, 1));
      const unitValue = Math.max(0, toNum(body.unitPrice, 0));
      const totalValue = Math.max(0, toNum(body.purchaseTotal, qtyValue * unitValue));
      const targetValueRaw = toNum(body.targetPrice, 0);
      const targetValue = targetValueRaw > 0 ? targetValueRaw : null;

      const sourceType = normalizeSourceType(body.sourceType);

      if (!brandModel) {
        return res.status(400).json({ ok: false, message: "ต้องระบุชื่อสินค้า / รุ่น (Brand/Model)" });
      }
      if (!sellerName) {
        return res.status(400).json({ ok: false, message: "ต้องระบุชื่อผู้ขาย" });
      }
      if (!sellerIdCard && !sellerPhone) {
        return res.status(400).json({ ok: false, message: "ต้องมีเลขบัตร หรือ เบอร์โทร อย่างน้อย 1 อย่าง" });
      }
      if (unitValue <= 0) {
        return res.status(400).json({ ok: false, message: "unitPrice ต้องมากกว่า 0" });
      }

      const productPhotoPaths = (files.productPhotos || []).map((f) => f.path);
      const idCardPhotoPaths = (files.idCardPhotos || []).map((f) => f.path);
      const contractPhotoPaths = (files.contractPhotos || []).map((f) => f.path);

      // gen inventory code
      const lastItem = await prisma.inventoryItem.findFirst({
        orderBy: { id: "desc" },
        select: { id: true },
      });

      const nextNumber = (lastItem?.id || 0) + 1;
      const year = new Date().getFullYear();
      const code = `INV-${year}-${String(nextNumber).padStart(4, "0")}`;

      const created = await prisma.$transaction(async (tx) => {
        // ✅ 1) upsert/find seller customer
        let sellerCustomer = null;

        if (sellerIdCard) {
          // idCard เป็น unique ใน schema ของคุณ
          sellerCustomer = await tx.customer.upsert({
            where: { idCard: sellerIdCard },
            update: {
              name: sellerName || undefined,
              phone: sellerPhone || undefined,
              address: sellerAddress || undefined,
              lineId: sellerLineId || undefined,
            },
            create: {
              name: sellerName || "ลูกค้า",
              idCard: sellerIdCard,
              phone: sellerPhone || null,
              address: sellerAddress || null,
              lineId: sellerLineId || null,
            },
          });
        } else if (sellerPhone) {
          // phone ไม่ unique → findFirst แล้วค่อย update/create
          sellerCustomer = await tx.customer.findFirst({ where: { phone: sellerPhone } });
          if (!sellerCustomer) {
            sellerCustomer = await tx.customer.create({
              data: {
                name: sellerName || "ลูกค้า",
                phone: sellerPhone,
                address: sellerAddress || null,
                lineId: sellerLineId || null,
              },
            });
          } else {
            sellerCustomer = await tx.customer.update({
              where: { id: sellerCustomer.id },
              data: {
                name: sellerName || sellerCustomer.name,
                address: sellerAddress || sellerCustomer.address,
                lineId: sellerLineId || sellerCustomer.lineId,
              },
            });
          }
        }

        // ✅ 2) create inventory
        const item = await tx.inventoryItem.create({
          data: {
            code,
            name: brandModel,
            serial: serial || null,
            condition: condition || null,
            accessories: accessories || null,
            storageLocation: null,

            sourceType, // PURCHASE
            sourceContractId: null,
            sourceContractCode: null,

            // ✅ ต้นทุนต่อชิ้น (ให้ตรง UI "ต้นทุน/ชิ้น")
            cost: unitValue,
            // ✅ ราคาตั้งขายต่อชิ้น
            targetPrice: targetValue,
            appraisedPrice: null,
            sellingPrice: null,

            quantity: qtyValue,
            quantityAvailable: qtyValue,
            quantitySold: 0,

            status: "IN_STOCK",

            // ✅ ผูกผู้ขาย (ต้องมี field ใน schema แล้ว)
            sellerCustomerId: sellerCustomer ? sellerCustomer.id : null,
          },
        });

        // ✅ 3) cashbook OUT = ต้นทุนรวมที่จ่ายจริง
        await tx.cashbookEntry.create({
          data: {
            type: "OUT",
            category: "INVENTORY_BUY_IN",
            amount: totalValue,
            profit: 0,
            description: `รับซื้อเข้า ${brandModel} x${qtyValue} จาก ${sellerName}`,
            inventoryItemId: item.id,
          },
        });

        return { item, sellerCustomer, evidence: { productPhotoPaths, idCardPhotoPaths, contractPhotoPaths } };
      });

      return res.json({
        ok: true,
        itemId: created.item.id,
        itemCode: created.item.code,
        sellerCustomerId: created.sellerCustomer?.id ?? null,
      });
    } catch (err) {
      console.error("POST /api/intake error:", err);
      return res.status(500).json({
        ok: false,
        message: "บันทึกรับเข้าไม่สำเร็จ",
        error: err?.message || String(err),
      });
    }
  }
);

export default router;
