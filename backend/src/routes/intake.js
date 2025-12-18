// backend/src/routes/intake.js
import express from "express";
import multer from "multer";
import { prisma } from "../db.js";

const router = express.Router();

// NOTE: บน Render filesystem เป็น ephemeral (หายเมื่อ redeploy)
// ตอนนี้เก็บ path ไว้ก่อน ถ้าจะเก็บถาวรแนะนำ S3/R2 ภายหลัง
const upload = multer({ dest: "uploads/" });

/* ---------------- helpers ---------------- */
const toNum = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const toInt = (v, fallback = 1) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : fallback;
};

// ✅ map sourceType ให้ตรง enum ใน DB จริง
// ระบบคุณมี FORFEIT / PURCHASE / CONSIGNMENT (อย่างน้อย)
// ดังนั้น BUY_IN ให้ map -> PURCHASE
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

        sourceType: rawSourceType,
      } = body;

      if (!brandModel || !String(brandModel).trim()) {
        return res.status(400).json({
          ok: false,
          message: "ต้องระบุชื่อสินค้า / รุ่น (Brand/Model)",
        });
      }

      // -------- parse numbers --------
      const qtyValue = Math.max(1, toInt(quantity, 1));
      const unitValue = Math.max(0, toNum(unitPrice, 0));

      // ถ้าส่ง purchaseTotal มา ให้ใช้ก่อน ไม่งั้นคำนวณ qty*unit
      const totalValueRaw = toNum(purchaseTotal, qtyValue * unitValue);
      const totalValue = Math.max(0, totalValueRaw);

      const targetValueRaw = toNum(targetPrice, 0);
      const targetValue = targetValueRaw > 0 ? targetValueRaw : null;

      const sourceType = normalizeSourceType(rawSourceType);

      // -------- evidence files (paths) --------
      const productPhotoPaths = (files.productPhotos || []).map((f) => f.path);
      const idCardPhotoPaths = (files.idCardPhotos || []).map((f) => f.path);
      const contractPhotoPaths = (files.contractPhotos || []).map((f) => f.path);

      // meta (ตอนนี้ยังไม่เก็บลง DB แยก หากอยากเก็บจริงให้เพิ่ม column JSON)
      const meta = {
        seller: {
          name: sellerName || "",
          idCard: sellerIdCard || "",
          phone: sellerPhone || "",
          address: sellerAddress || "",
          lineId: sellerLineId || "",
        },
        notes: notes || "",
        evidenceFiles: {
          productPhotos: productPhotoPaths,
          idCardPhotos: idCardPhotoPaths,
          contractPhotos: contractPhotoPaths,
        },
      };

      // -------- generate stock code --------
      const lastItem = await prisma.inventoryItem.findFirst({
        orderBy: { id: "desc" },
        select: { id: true },
      });

      const nextNumber = (lastItem?.id || 0) + 1;
      const year = new Date().getFullYear();
      const code = `INV-${year}-${String(nextNumber).padStart(4, "0")}`;

      const createdItem = await prisma.$transaction(async (tx) => {
        // 1) create inventory
        const item = await tx.inventoryItem.create({
          data: {
            code,
            name: String(brandModel).trim(),
            serial: serial ? String(serial).trim() : null,
            condition: condition ? String(condition).trim() : null,
            accessories: accessories ? String(accessories).trim() : null,
            storageLocation: null,

            sourceType, // ✅ PURCHASE (หรือค่าที่รองรับ)
            sourceContractId: null,
            sourceContractCode: null,

            // ✅ cost = ต้นทุนต่อชิ้น (ตามหน้า NewIntakePage)
            cost: unitValue,
            appraisedPrice: targetValue,
            targetPrice: targetValue,
            sellingPrice: null, // ✅ ไม่ใช้ 0

            quantity: qtyValue,
            quantityAvailable: qtyValue,
            quantitySold: 0,

            grossProfit: null,
            netProfit: null,

            status: "IN_STOCK",

            buyerName: null,
            buyerPhone: null,
            buyerAddress: null,
            buyerTaxId: null,
            buyerCustomerId: null,
          },
        });

        // 2) cashbook OUT
        if (totalValue > 0) {
          await tx.cashbookEntry.create({
            data: {
              type: "OUT",
              category: "INVENTORY_BUY_IN",
              amount: totalValue,
              profit: 0,
              description: `รับซื้อสินค้า x${qtyValue}: ${String(brandModel).trim()} จาก ${
                sellerName ? String(sellerName).trim() : "ลูกค้าทั่วไป"
              }`,
              contractId: null,
              inventoryItemId: item.id,
            },
          });
        }

        return item;
      });

      console.log("[INTAKE] created inventory:", createdItem.id, createdItem.code, {
        sourceType,
        qtyValue,
        unitValue,
        totalValue,
        targetValue,
        metaPreview: {
          sellerName: meta.seller.name,
          files: {
            product: productPhotoPaths.length,
            idcard: idCardPhotoPaths.length,
            contract: contractPhotoPaths.length,
          },
        },
      });

      return res.json({
        ok: true,
        itemId: createdItem.id,
        itemCode: createdItem.code,
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
