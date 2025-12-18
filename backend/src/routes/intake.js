// backend/src/routes/intake.js
import express from "express";
import multer from "multer";
import { prisma } from "../db.js";

const router = express.Router();

// อัปโหลดไว้ชั่วคราว (Render เป็น ephemeral storage)
// ถ้าจะใช้งานจริง แนะนำย้ายไป S3/R2 ภายหลัง
const upload = multer({ dest: "uploads/" });

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

      const {
        sellerName,
        sellerIdCard,
        sellerPhone,
        sellerAddress,
        sellerLineId,

        brandModel,
        serial,
        condition,
        accessories,

        quantity,
        unitPrice,
        purchaseTotal,
        targetPrice,
        notes,

        sourceType, // "BUY_IN" from frontend
      } = body;

      if (!brandModel || !String(brandModel).trim()) {
        return res.status(400).json({
          ok: false,
          message: "ต้องระบุชื่อสินค้า / รุ่น (Brand/Model)",
        });
      }

      const qtyValue = Number(quantity);
      const qty = Number.isFinite(qtyValue) && qtyValue > 0 ? qtyValue : 1;

      const unit = Number(unitPrice);
      const unitCost = Number.isFinite(unit) && unit > 0 ? unit : 0;

      const totalV = Number(purchaseTotal);
      const totalCost =
        Number.isFinite(totalV) && totalV > 0 ? totalV : qty * unitCost;

      const tp = Number(targetPrice);
      const targetValue = Number.isFinite(tp) && tp > 0 ? tp : null;

      const st = String(sourceType || "BUY_IN").toUpperCase();

      // สร้างรหัส INV-0001, INV-0002 ... ตาม id ล่าสุด
      const lastItem = await prisma.inventoryItem.findFirst({
        orderBy: { id: "desc" },
        select: { id: true },
      });
      const nextNumber = (lastItem?.id || 0) + 1;
      const code = `INV-${String(nextNumber).padStart(4, "0")}`;

      // paths ของไฟล์ (ตอนนี้ยังไม่เก็บลง DB ถ้าไม่มี column)
      const productPhotoPaths = (files.productPhotos || []).map((f) => f.path);
      const idCardPhotoPaths = (files.idCardPhotos || []).map((f) => f.path);
      const contractPhotoPaths = (files.contractPhotos || []).map((f) => f.path);

      const created = await prisma.$transaction(async (tx) => {
        // 1) สร้างสินค้าเข้าคลัง
        const item = await tx.inventoryItem.create({
          data: {
            code,
            name: String(brandModel).trim(),
            serial: serial ? String(serial) : null,
            condition: condition ? String(condition) : null,
            accessories: accessories ? String(accessories) : null,
            storageLocation: null,

            // ✅ ให้ตรง enum ที่ระบบคุณใช้
            sourceType: st === "PURCHASE" ? "BUY_IN" : st, // กันเคสส่งผิด
            sourceContractId: null,
            sourceContractCode: null,

            // ✅ เก็บต้นทุน "รวม" (ขายทีหลังจะเฉลี่ยต่อชิ้นเองใน route sell)
            cost: totalCost,

            targetPrice: targetValue,
            sellingPrice: 0,

            quantity: qty,
            quantityAvailable: qty,
            quantitySold: 0,

            status: "IN_STOCK",

            buyerName: null,
            buyerPhone: null,
            buyerAddress: null,
            buyerTaxId: null,
          },
        });

        // 2) ลง cashbook เป็นรายจ่ายรับซื้อ
        if (totalCost > 0) {
          await tx.cashbookEntry.create({
            data: {
              type: "OUT",
              category: "INVENTORY_BUY_IN",
              amount: totalCost,
              profit: 0,
              inventoryItemId: item.id,
              description: `รับซื้อสินค้า (Buy In) x${qty}: ${String(brandModel).trim()} จาก ${
                sellerName ? String(sellerName) : "ลูกค้าทั่วไป"
              }`,
            },
          });
        }

        return item;
      });

      return res.json({
        ok: true,
        itemId: created.id,
        itemCode: created.code,
        evidence: {
          productPhotos: productPhotoPaths,
          idCardPhotos: idCardPhotoPaths,
          contractPhotos: contractPhotoPaths,
        },
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
