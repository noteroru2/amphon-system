import express from "express";
import { prisma } from "../db.js";

const router = express.Router();

/**
 * segments:
 * - BUYER: ลูกค้าที่เคย "ซื้อ" (มี inventoryItemsBought)
 * - DEPOSITOR: ลูกค้าที่เคย "ฝากดูแล" (มี contracts.type = DEPOSIT หรือ DEPOSIT_CARE)
 * - CONSIGNOR: ลูกค้าที่เคย "ขาย/ฝากขาย"
 */
router.get("/", async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim();

    const customers = await prisma.customer.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q, mode: "insensitive" } },
              { idCard: { contains: q, mode: "insensitive" } },
              { lineId: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined,
      include: {
        contracts: {
          select: { id: true, type: true },
        },
        inventoryItemsBought: {
          select: { id: true },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // ===== CONSIGNOR sources (optional models / optional fields) =====
    const consignmentByIdCard = new Map();
    const consignmentByPhone = new Map();

    // 1) consignmentContract (ถ้ามีจริง)
    try {
      if (prisma.consignmentContract?.findMany) {
        const consignments = await prisma.consignmentContract.findMany({
          select: { sellerIdCard: true, sellerPhone: true },
        });
        for (const c of consignments) {
          if (c?.sellerIdCard) consignmentByIdCard.set(String(c.sellerIdCard).trim(), true);
          if (c?.sellerPhone) consignmentByPhone.set(String(c.sellerPhone).trim(), true);
        }
      }
    } catch {
      // ignore
    }

    // 2) inventoryItem.sellerCustomerId + sourceType (ถ้ามีจริง)
    const sellerCustomerIds = new Set(); // number set
    try {
      if (prisma.inventoryItem?.findMany) {
        const sellers = await prisma.inventoryItem.findMany({
          where: {
            OR: [{ sourceType: "PURCHASE" }, { sourceType: "CONSIGNMENT" }],
          },
          select: { sellerCustomerId: true },
        });

        for (const s of sellers) {
          const id = s?.sellerCustomerId;
          if (typeof id === "number") sellerCustomerIds.add(id);
        }
      }
    } catch {
      // ignore (schema ไม่มี field/enum)
    }

    const rows = customers.map((c) => {
      const segments = [];

      // BUYER
      if (c.inventoryItemsBought?.length > 0) segments.push("BUYER");

      // DEPOSITOR (ปรับ enum ให้ตรงของคุณได้)
      const isDepositor = (c.contracts || []).some(
        (ct) => ct.type === "DEPOSIT" || ct.type === "DEPOSIT_CARE"
      );
      if (isDepositor) segments.push("DEPOSITOR");

      // CONSIGNOR
      const idCardKey = c.idCard ? String(c.idCard).trim() : "";
      const phoneKey = c.phone ? String(c.phone).trim() : "";

      const isConsignor =
        (idCardKey && consignmentByIdCard.has(idCardKey)) ||
        (phoneKey && consignmentByPhone.has(phoneKey)) ||
        (sellerCustomerIds.size > 0 && sellerCustomerIds.has(c.id));

      if (isConsignor) segments.push("CONSIGNOR");

      return {
        id: c.id,
        name: c.name,
        idCard: c.idCard,
        phone: c.phone,
        lineId: c.lineId,
        address: c.address,
        createdAt: c.createdAt,
        segments,
      };
    });

    return res.json(rows);
  } catch (err) {
    console.error("GET /api/customers error:", err);
    return res.status(500).json({
      message: "ไม่สามารถโหลดรายการลูกค้าได้",
      error: err?.message || String(err),
    });
  }
});

/**
 * GET /api/customers/:id
 * คืนข้อมูลลูกค้าคนเดียว + ประวัติทั้งหมดที่มีในระบบ
 */
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: "invalid customer id" });
    }

    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        contracts: {
          orderBy: { createdAt: "desc" },
          include: {
            images: true,
            cashbookEntries: true,
            actionLogs: true,
          },
        },
        inventoryItemsBought: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!customer) return res.status(404).json({ message: "ไม่พบลูกค้า" });

    // CONSIGNMENT (ถ้ามี model จริง)
    let consignments = [];
    try {
      if (prisma.consignmentContract?.findMany) {
        const sellerIdCard = customer.idCard ? String(customer.idCard).trim() : "";
        const sellerPhone = customer.phone ? String(customer.phone).trim() : "";
        const sellerName = customer.name ? String(customer.name).trim() : "";

        const OR = [
          sellerIdCard ? { sellerIdCard } : null,
          sellerPhone ? { sellerPhone } : null,
          sellerName ? { sellerName } : null,
        ].filter(Boolean);

        consignments = await prisma.consignmentContract.findMany({
          where: OR.length ? { OR } : undefined,
          orderBy: { createdAt: "desc" },
          include: { inventoryItem: true },
        });
      }
    } catch {
      consignments = [];
    }

    // OPTIONAL: sales history (ถ้ามี salesOrder model)
    let salesOrders = [];
    try {
      if (prisma.salesOrder?.findMany) {
        salesOrders = await prisma.salesOrder.findMany({
          where: { customerId: customer.id },
          orderBy: { createdAt: "desc" },
          include: { items: true },
        });
      }
    } catch {
      salesOrders = [];
    }

    // segments เพื่อให้ UI แสดง badge
    const segments = [];
    if (customer.inventoryItemsBought?.length > 0) segments.push("BUYER");
    if ((customer.contracts || []).some((c) => c.type === "DEPOSIT" || c.type === "DEPOSIT_CARE"))
      segments.push("DEPOSITOR");
    if ((consignments || []).length > 0) segments.push("CONSIGNOR");

    return res.json({
      customer: {
        id: customer.id,
        name: customer.name,
        idCard: customer.idCard,
        phone: customer.phone,
        lineId: customer.lineId,
        lineToken: customer.lineToken,
        address: customer.address,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
        segments,
      },
      depositContracts: customer.contracts || [],
      inventoryItemsBought: customer.inventoryItemsBought || [],
      consignments,
      salesOrders,
    });
  } catch (err) {
    console.error("GET /api/customers/:id error:", err);
    return res.status(500).json({
      message: "ไม่สามารถโหลดรายละเอียดลูกค้าได้",
      error: err?.message || String(err),
    });
  }
});

export default router;
