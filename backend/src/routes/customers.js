import express from "express";
import { prisma } from "../db.js";

const router = express.Router();

/**
 * segments:
 * - BUYER: ลูกค้าที่เคย "ซื้อ" (มี inventoryItemsBought)
 * - DEPOSITOR: ลูกค้าที่เคย "ฝากดูแล" (มี contracts.type = DEPOSIT หรือมี contract ใดๆที่เป็นฝากดูแล)
 * - CONSIGNOR: ลูกค้าที่เคย "ขาย/ฝากขาย" (พยายามหาจาก consignmentContract ถ้ามี, หรือจาก inventoryItem ที่มี sourceType = PURCHASE/CONSIGNMENT ถ้า schema รองรับ)
 */
router.get("/", async (req, res) => {
  try {
    const q = (req.query.q || "").toString().trim();

    // ดึงลูกค้า + สรุปข้อมูลที่มีแน่นอนจาก schema ที่คุณส่งมา
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
          take: 1, // แค่รู้ว่ามีหรือไม่มี
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // ====== หา CONSIGNOR แบบ "ไม่พัง" (รองรับหลาย schema) ======
    // ถ้ามี consignmentContract ใน Prisma จริง: ใช้ match จาก idCard/phone/name
    let consignmentByIdCard = new Map();
    let consignmentByPhone = new Map();

    if (prisma.consignmentContract?.findMany) {
      const consignments = await prisma.consignmentContract.findMany({
        select: { sellerIdCard: true, sellerPhone: true, sellerName: true },
      });

      for (const c of consignments) {
        if (c.sellerIdCard) consignmentByIdCard.set(String(c.sellerIdCard).trim(), true);
        if (c.sellerPhone) consignmentByPhone.set(String(c.sellerPhone).trim(), true);
      }
    }

    // ถ้า schema ของ InventoryItem มี sourceType + sellerCustomerId (บางโปรเจกต์จะมี)
    // จะลองอ่านแบบปลอดภัย (ถ้าไม่มี field ก็จะโดน error -> เราจะ catch แล้วข้าม)
    let sellerCustomerIds = new Set();
    try {
      if (prisma.inventoryItem?.findMany) {
        const sellers = await prisma.inventoryItem.findMany({
          where: {
            OR: [
              { sourceType: "PURCHASE" }, // ลูกค้ามาขายให้ร้าน
              { sourceType: "CONSIGNMENT" }, // ลูกค้ามาฝากขาย
            ],
          },
          select: {
            sellerCustomerId: true,
          },
        });

        for (const s of sellers) {
          if (s?.sellerCustomerId) sellerCustomerIds.add(s.sellerCustomerId);
        }
      }
    } catch {
      // ignore (ถ้า schema ไม่มี field/enum นี้)
    }

    // ====== สร้าง segments ======
    const rows = customers.map((c) => {
      const segments = [];

      // BUYER: มี inventoryItemsBought อย่างน้อย 1
      if (c.inventoryItemsBought?.length > 0) segments.push("BUYER");

      // DEPOSITOR: มี contract ที่เป็นฝากดูแล
      // (คุณปรับเงื่อนไขนี้ได้ให้ตรง enum ContractType ของคุณ)
      const isDepositor =
        (c.contracts || []).some((ct) => ct.type === "DEPOSIT" || ct.type === "DEPOSIT_CARE");
      if (isDepositor) segments.push("DEPOSITOR");

      // CONSIGNOR: เช็คจาก consignmentContract (idCard/phone) หรือ sellerCustomerId
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

    res.json(rows);
  } catch (err) {
    console.error("GET /api/customers error:", err);
    res.status(500).json({ message: "Internal Server Error" });
  }
});

/**
 * GET /api/customers/:id
 * คืนข้อมูลลูกค้าคนเดียว + ประวัติทั้งหมดที่มีในระบบ
 */
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "invalid customer id" });

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

    // ====== CONSIGNMENT / SELLER HISTORY (ถ้ามี model จริง) ======
    let consignments = [];
    if (prisma.consignmentContract?.findMany) {
      const sellerIdCard = customer.idCard ? String(customer.idCard).trim() : "";
      const sellerPhone = customer.phone ? String(customer.phone).trim() : "";
      const sellerName = customer.name ? String(customer.name).trim() : "";

      consignments = await prisma.consignmentContract.findMany({
        where: {
          OR: [
            sellerIdCard ? { sellerIdCard } : undefined,
            sellerPhone ? { sellerPhone } : undefined,
            sellerName ? { sellerName } : undefined,
          ].filter(Boolean),
        },
        orderBy: { createdAt: "desc" },
        include: { inventoryItem: true },
      });
    }

    // ====== OPTIONAL: sales history (ถ้ามี salesOrder model) ======
    let salesOrders = [];
    if (prisma.salesOrder?.findMany) {
      salesOrders = await prisma.salesOrder.findMany({
        where: { customerId: customer.id },
        orderBy: { createdAt: "desc" },
        include: { items: true },
      });
    }

    // segments เพื่อให้ UI แสดง badge
    const segments = [];
    if (customer.inventoryItemsBought?.length > 0) segments.push("BUYER");
    if ((customer.contracts || []).some((c) => c.type === "DEPOSIT" || c.type === "DEPOSIT_CARE"))
      segments.push("DEPOSITOR");
    if ((consignments || []).length > 0) segments.push("CONSIGNOR");

    res.json({
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
    res.status(500).json({ message: "Internal Server Error" });
  }
});

export default router;
