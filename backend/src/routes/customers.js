import express from "express";
import { prisma } from "../db.js";

const router = express.Router();

const clean = (v) => (v ? String(v).trim() : "");

router.get("/", async (req, res) => {
  try {
    const q = clean(req.query.q);

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
        // ✅ ฝากดูแล: แค่รู้ว่ามี contract type=DEPOSIT หรือไม่
        contracts: { select: { id: true, type: true }, take: 1 },

        // ✅ มาซื้อ: inventory ที่ผูก buyerCustomerId
        inventoryItemsBought: { select: { id: true }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });

    // ✅ ฝากขาย: index จาก ConsignmentContract (match ด้วย idCard/phone)
    const consignmentByIdCard = new Set();
    const consignmentByPhone = new Set();

    const consignments = await prisma.consignmentContract.findMany({
      select: { sellerIdCard: true, sellerPhone: true },
    });

    for (const c of consignments) {
      const idc = clean(c.sellerIdCard);
      const ph = clean(c.sellerPhone);
      if (idc) consignmentByIdCard.add(idc);
      if (ph) consignmentByPhone.add(ph);
    }

    const rows = customers.map((c) => {
      const segments = [];

      // BUYER
      if ((c.inventoryItemsBought || []).length > 0) segments.push("BUYER");

      // ✅ DEPOSITOR (schema มีแค่ DEPOSIT)
      const isDepositor = (c.contracts || []).some((ct) => ct.type === "DEPOSIT");
      if (isDepositor) segments.push("DEPOSITOR");

      // ✅ CONSIGNOR (ฝากขาย)
      const idCardKey = clean(c.idCard);
      const phoneKey = clean(c.phone);

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
    return res.status(500).json({
      message: "ไม่สามารถโหลดรายการลูกค้าได้",
      error: err?.message || String(err),
    });
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

    // ✅ ฝากขาย: หาเฉพาะด้วย idCard/phone (แม่นกว่า name)
    const sellerIdCard = clean(customer.idCard);
    const sellerPhone = clean(customer.phone);

    const OR = [
      sellerIdCard ? { sellerIdCard } : null,
      sellerPhone ? { sellerPhone } : null,
    ].filter(Boolean);

    const consignments = OR.length
      ? await prisma.consignmentContract.findMany({
          where: { OR },
          orderBy: { createdAt: "desc" },
          include: { inventoryItem: true },
        })
      : [];

    const segments = [];
    if ((customer.inventoryItemsBought || []).length > 0) segments.push("BUYER");
    if ((customer.contracts || []).some((c) => c.type === "DEPOSIT")) segments.push("DEPOSITOR");
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
      salesOrders: [], // ตอนนี้ยังไม่มี schema salesOrder ใน prisma ที่คุณส่งมา
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
