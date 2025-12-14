// backend/src/routes/cashbook.js
import express from "express";
import { prisma } from "../db.js";

const router = express.Router();

/**
 * GET /api/cashbook?year=YYYY&month=MM
 * ถ้าไม่ส่ง -> ใช้เดือนปัจจุบันของเครื่อง server
 */
router.get("/", async (req, res) => {
  try {
    const now = new Date();

    let year = parseInt(req.query.year, 10);
    let month = parseInt(req.query.month, 10);

    if (Number.isNaN(year) || year < 2000 || year > 2100) {
      year = now.getFullYear();
    }
    if (Number.isNaN(month) || month < 1 || month > 12) {
      month = now.getMonth() + 1; // JS: 0–11
    }

    const start = new Date(year, month - 1, 1, 0, 0, 0);
    const end = new Date(year, month, 1, 0, 0, 0);

    const entries = await prisma.cashbookEntry.findMany({
      where: {
        createdAt: {
          gte: start,
          lt: end,
        },
      },
      orderBy: { createdAt: "asc" },
      include: {
        contract: {
          select: {
            id: true,
            code: true,
          },
        },
        inventoryItem: {
          select: {
            id: true,
            name: true,
            serial: true,
            sourceType: true,
          },
        },
      },
    });

    let totalIn = 0;
    let totalOut = 0;
    let totalProfit = 0;
    let principalOut = 0;
    let principalIn = 0;

    const mapped = entries.map((e) => {
      const amount = e.amount ? Number(e.amount) : 0;
      const profit = e.profit ? Number(e.profit) : 0;

      if (e.type === "IN") {
        totalIn += amount;
      } else if (e.type === "OUT") {
        totalOut += amount;
      }
      totalProfit += profit;

      // สรุป principal
      if (e.category === "DEPOSIT_PRINCIPAL_OUT") {
        principalOut += amount;
      }
      if (e.category === "CUT_PRINCIPAL") {
        principalIn += amount;
      }
      if (e.category === "REDEEM") {
        // ใน REDEEM: amount = principal + fee, profit = fee
        principalIn += amount - profit;
      }

      const inventoryTitle = e.inventoryItem
        ? e.inventoryItem.name ||
          `ทรัพย์จากคลัง #${e.inventoryItem.id}`
        : null;

      const inventoryInfo = e.inventoryItem
        ? [
            e.inventoryItem.sourceType
              ? `[${e.inventoryItem.sourceType}]`
              : null,
            e.inventoryItem.serial || null,
          ]
            .filter(Boolean)
            .join(" • ")
        : null;

      return {
        id: e.id,
        type: e.type,
        category: e.category,
        amount,
        description: e.description,
        createdAt: e.createdAt.toISOString(),
        contractId: e.contractId,
        contractCode: e.contract?.code ?? null,
        inventoryItemId: e.inventoryItemId,
        inventoryTitle,
        inventoryInfo,
        profit,
      };
    });

    const response = {
      month: `${year}-${String(month).padStart(2, "0")}`,
      summary: {
        totalIn,
        totalOut,
        netCash: totalIn - totalOut,
        totalProfit,
        principalOut,
        principalIn,
        profit: totalProfit,
      },
      entries: mapped,
    };

    return res.json(response);
  } catch (err) {
    console.error("GET /api/cashbook error:", err);
    return res.status(500).json({
      message: "ไม่สามารถดึงข้อมูลสมุดรายวัน (cashbook) ได้",
      error: err?.message || String(err),
    });
  }
});

export default router;
