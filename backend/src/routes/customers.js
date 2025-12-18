import express from "express";
import { prisma } from "../db.js";

const router = express.Router();

/**
 * segments:
 * - BUYER: ลูกค้าที่เคย "มาซื้อ" (มี inventoryItemsBought อย่างน้อย 1)
 * - DEPOSITOR: ลูกค้าที่เคย "ฝากดูแล" (มี Contract.type = DEPOSIT)
 * - CONSIGNOR: ลูกค้าที่เคย "ขาย/ฝากขาย" (จาก ConsignmentContract)
 */
router.get("/", async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim();

    const where = q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q, mode: "insensitive" } },
            { idCard: { contains: q, mode: "insensitive" } },
            { lineId: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined;

    const customers = await prisma.customer.findMany({
      where,
      include: {
        contracts: { select: { id: true, type: true } },
        inventoryItemsBought: { select: { id: true }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    });

    // ===== CONSIGNOR index (ต้องกันกรณีตารางยังไม่มีจริง) =====
    const consignmentByIdCard = new Map();
    const consignmentByPhone = new Map();

    try {
      const consignments = await prisma.consignmentContract.findMany({
        select: { sellerIdCard: true, sellerPhone: true },
      });

      for (const c of consignments) {
        if (c?.sellerIdCard) consignmentByIdCard.set(String(c.sellerIdCard).trim(), true);
        if (c?.sellerPhone) consignmentByPhone.set(String(c.sellerPhone).trim(), true);
      }
    } catch (e) {
      // สำคัญ: ถ้ายังไม่ migrate ตาราง consignments หรือ DB มีปัญหา
      // ให้ระบบยังตอบได้ (แค่ CONSIGNOR จะยังไม่ขึ้น)
      console.warn("consignmentContract not available:", e?.message || e);
    }

    const rows = customers.map((c) => {
      const segments = [];

      // BUYER: มี inventoryItemsBought
      if (c.inventoryItemsBought?.length > 0) segments.push("BUYER");

      // DEPOSITOR: Contract.type = DEPOSIT (ตาม schema ของคุณ)
      const isDepositor = (c.contracts || []).some((ct) => ct.type === "DEPOSIT");
      if (isDepositor) segments.push("DEPOSITOR");

      // CONSIGNOR: match จาก idCard/phone ใน ConsignmentContract
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

    // consignments (กันกรณีตารางยังไม่มี)
    let consignments = [];
    try {
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
    } catch (e) {
      console.warn("consignmentContract not available:", e?.message || e);
      consignments = [];
    }

    // segments
    const segments = [];
    if (customer.inventoryItemsBought?.length > 0) segments.push("BUYER");
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
      salesOrders: [],
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
