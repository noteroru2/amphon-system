// backend/src/routes/customers.js
import express from "express";
import { prisma } from "../db.js";

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim();

    // ✅ index consignor จาก ConsignmentContract (schema มีจริง)
    const consignmentByIdCard = new Map();
    const consignmentByPhone = new Map();
    const consignments = await prisma.consignmentContract.findMany({
      select: { sellerIdCard: true, sellerPhone: true },
    });
    for (const c of consignments) {
      if (c.sellerIdCard) consignmentByIdCard.set(String(c.sellerIdCard).trim(), true);
      if (c.sellerPhone) consignmentByPhone.set(String(c.sellerPhone).trim(), true);
    }

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
        contracts: { select: { id: true, type: true } },
        inventoryItemsBought: { select: { id: true }, take: 1 }, // ✅ BUYER จาก buyerCustomerId
      },
      orderBy: { createdAt: "desc" },
    });

    const rows = customers.map((c) => {
      const segments = [];

      // BUYER
      if (c.inventoryItemsBought?.length > 0) segments.push("BUYER");

      // DEPOSITOR (schema ของคุณมี DEPOSIT เท่านั้น)
      const isDepositor = (c.contracts || []).some((ct) => ct.type === "DEPOSIT");
      if (isDepositor) segments.push("DEPOSITOR");

      // CONSIGNOR (ฝากขาย) จาก ConsignmentContract seller
      const idCardKey = c.idCard ? String(c.idCard).trim() : "";
      const phoneKey = c.phone ? String(c.phone).trim() : "";
      const isConsignor =
        (idCardKey && consignmentByIdCard.has(idCardKey)) ||
        (phoneKey && consignmentByPhone.has(phoneKey));
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
    return res.status(500).json({ message: "ไม่สามารถโหลดรายการลูกค้าได้", error: err?.message || String(err) });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "invalid customer id" });

    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        contracts: {
          orderBy: { createdAt: "desc" },
          include: { images: true, cashbookEntries: true, actionLogs: true },
        },
        inventoryItemsBought: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!customer) return res.status(404).json({ message: "ไม่พบลูกค้า" });

    // CONSIGNMENT by seller fields
    const sellerIdCard = customer.idCard ? String(customer.idCard).trim() : "";
    const sellerPhone = customer.phone ? String(customer.phone).trim() : "";
    const sellerName = customer.name ? String(customer.name).trim() : "";

    const OR = [
      sellerIdCard ? { sellerIdCard } : null,
      sellerPhone ? { sellerPhone } : null,
      sellerName ? { sellerName } : null,
    ].filter(Boolean);

    const consignments = OR.length
      ? await prisma.consignmentContract.findMany({
          where: { OR },
          orderBy: { createdAt: "desc" },
          include: { inventoryItem: true },
        })
      : [];

    const segments = [];
    if (customer.inventoryItemsBought?.length > 0) segments.push("BUYER");
    if ((customer.contracts || []).some((c) => c.type === "DEPOSIT")) segments.push("DEPOSITOR");
    if (consignments.length > 0) segments.push("CONSIGNOR");

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
      salesOrders: [], // schema ตอนนี้ยังไม่มี
    });
  } catch (err) {
    console.error("GET /api/customers/:id error:", err);
    return res.status(500).json({ message: "ไม่สามารถโหลดรายละเอียดลูกค้าได้", error: err?.message || String(err) });
  }
});

export default router;
