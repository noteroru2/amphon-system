// backend/src/routes/intake.js
import express from "express";
import multer from "multer";
import { prisma } from "../db.js";

const router = express.Router();
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
      const body = req.body;
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
      } = body;

      if (!brandModel) {
        return res
          .status(400)
          .json({ ok: false, message: "ต้องระบุชื่อสินค้า / รุ่น (Brand/Model)" });
      }

      const qtyValue =
        quantity && !Number.isNaN(Number(quantity)) ? Number(quantity) : 1;

      const unitValue =
        unitPrice && !Number.isNaN(Number(unitPrice)) ? Number(unitPrice) : 0;

      const totalValue =
        purchaseTotal && !Number.isNaN(Number(purchaseTotal))
          ? Number(purchaseTotal)
          : qtyValue * unitValue;

      const targetValue =
        targetPrice && !Number.isNaN(Number(targetPrice))
          ? Number(targetPrice)
          : null;

      // meta (ตอนนี้ยังไม่เก็บลง column แยก ถ้าจะใช้จริงค่อยเพิ่ม description column ภายหลัง)
      const meta = {
        seller: {
          name: sellerName || "",
          idCard: sellerIdCard || "",
          phone: sellerPhone || "",
          address: sellerAddress || "",
          lineId: sellerLineId || "",
        },
        notes: notes || "",
      };

      const productPhotoPaths = (files.productPhotos || []).map((f) => f.path);
      const idCardPhotoPaths = (files.idCardPhotos || []).map((f) => f.path);
      const contractPhotoPaths = (files.contractPhotos || []).map((f) => f.path);

      meta.evidenceFiles = {
        productPhotos: productPhotoPaths,
        idCardPhotos: idCardPhotoPaths,
        contractPhotos: contractPhotoPaths,
      };

      // สร้าง code สต๊อก
      const lastItem = await prisma.inventoryItem.findFirst({
        orderBy: { id: "desc" },
        select: { id: true },
      });

      const nextNumber = (lastItem?.id || 0) + 1;
      const year = new Date().getFullYear();
      const code = `INV-${year}-${String(nextNumber).padStart(4, "0")}`;

      const createdItem = await prisma.$transaction(async (tx) => {
        // 1) สร้างสินค้าเข้าสต๊อก
        const item = await tx.inventoryItem.create({
          data: {
            code,
            name: brandModel.trim(),
            serial: serial || null,
            condition: condition || null,
            accessories: accessories || null,
            storageLocation: null,

            sourceType: "PURCHASE", // ให้ตรง enum InventorySourceType
            sourceContractId: null,
            sourceContractCode: null,

            cost: unitValue, // ต้นทุนต่อชิ้น
            appraisedPrice: targetValue,
            targetPrice: targetValue,
            sellingPrice: null,

            quantity: qtyValue,
            quantityAvailable: qtyValue,
            quantitySold: 0,

            grossProfit: null,
            netProfit: null,

            status: "IN_STOCK", // ให้ตรง enum InventoryStatus

            buyerName: null,
            buyerPhone: null,
            buyerAddress: null,
            buyerTaxId: null,
            buyerCustomerId: null,
          },
        });

        // 2) บันทึกรายจ่ายเข้ารายการเงิน
        if (totalValue > 0) {
          await tx.cashbookEntry.create({
            data: {
              type: "OUT",
              category: "INVENTORY_BUY_IN",
              amount: totalValue,
              profit: 0,
              description: `รับซื้อสินค้า (Buy In) x${qtyValue}: ${brandModel} จาก ${
                sellerName || "ลูกค้าทั่วไป"
              }`,
              contractId: null,
              inventoryItemId: item.id,
            },
          });
        }

        return item;
      });

      console.log(
        "INTAKE CREATED INVENTORY & CASHBOOK:",
        createdItem.id,
        createdItem.code
      );

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
