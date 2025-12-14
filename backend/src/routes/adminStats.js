import express from "express";
import { prisma } from "../db.js";

const router = express.Router();

/** ===================== helpers: Decimal/BigInt JSON safe ===================== */
function toNumberMaybe(v) {
  if (v == null) return 0;

  // Prisma Decimal (decimal.js)
  if (typeof v === "object" && typeof v.toNumber === "function") return v.toNumber();

  // BigInt
  if (typeof v === "bigint") {
    const max = BigInt(Number.MAX_SAFE_INTEGER);
    const min = BigInt(Number.MIN_SAFE_INTEGER);
    if (v > max || v < min) return Number(v.toString());
    return Number(v);
  }

  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toJsonSafe(value) {
  if (typeof value === "bigint") {
    const max = BigInt(Number.MAX_SAFE_INTEGER);
    const min = BigInt(Number.MIN_SAFE_INTEGER);
    if (value > max || value < min) return value.toString();
    return Number(value);
  }

  // Decimal.js
  if (value && typeof value === "object" && typeof value.toNumber === "function") {
    return value.toNumber();
  }

  if (Array.isArray(value)) return value.map(toJsonSafe);

  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = toJsonSafe(v);
    return out;
  }

  return value;
}

/** ===================== time range (UTC) ===================== */
function getMonthRange(year, month) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0));
  return { start, end };
}
function getYearRange(year) {
  const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0));
  return { start, end };
}

/** ===================== smart matcher ===================== */
function normStr(s) {
  return String(s || "").toLowerCase().trim();
}

// จับ "จำนวน 2" หรือ "จำนวน 2 ชิ้น"
function parseQtyFromDesc(desc) {
  const s = String(desc || "");
  const m = s.match(/จำนวน\s*(\d+)/);
  if (m && m[1]) return Math.max(1, Number(m[1]) || 1);
  return 1;
}

/** ฝากดูแล: แถวที่เป็น “ค่าบริการ” */
function isDepositServiceFeeRow(row) {
  const cat = normStr(row.category);
  const desc = normStr(row.description);

  const okCat = [
    "service_fee",
    "deposit_fee",
    "contract_fee",
    "renew_contract",
    "cut_principal",
    "redeem",
    "fee",
    "ค่าบริการ",
    "ต่อสัญญา",
    "ตัดต้น",
    "ไถ่ถอน",
  ];

  const okDesc = ["ค่าบริการ", "ต่อสัญญา", "ตัดต้น", "ไถ่ถอน", "renew", "cut", "redeem"];

  if (okCat.some((k) => cat.includes(k))) return true;
  if (okDesc.some((k) => desc.includes(k))) return true;
  return false;
}

/** ขายสินค้า: ของระบบคุณคือ INVENTORY_SALE (type=IN) */
function isInventorySaleRow(row) {
  const cat = normStr(row.category);
  const type = String(row.type || "").toUpperCase();
  if (type && type !== "IN") return false;
  return cat === "inventory_sale" || cat.includes("inventory_sale");
}

/** รับซื้อเข้า: ของระบบคุณคือ INVENTORY_BUY_IN (type=OUT) */
function isInventoryBuyInRow(row) {
  const cat = normStr(row.category);
  const type = String(row.type || "").toUpperCase();
  if (type && type !== "OUT") return false;
  return cat === "inventory_buy_in" || cat.includes("inventory_buy_in");
}

/** ===================== profit calculators ===================== */
function calcNormalSaleProfit(row) {
  // priority: ใช้ profit ใน cashbook ถ้ามี
  const p = toNumberMaybe(row.profit);
  if (p !== 0) return p;

  // fallback: คำนวณจาก amount - cost*qty (ถ้ามี cost)
  const qty = parseQtyFromDesc(row.description);
  const amount = toNumberMaybe(row.amount);
  const cost = toNumberMaybe(row.inventoryItem?.cost);
  if (cost > 0) return amount - cost * qty;

  return 0;
}

function calcConsignmentCommission(row, netToSellerPerUnit) {
  // priority: ถ้า profit ใน cashbook ถูก set เป็นคอมแล้ว ก็ใช้เลย
  const p = toNumberMaybe(row.profit);
  if (p !== 0) return p;

  // fallback: commission = saleAmount - netToSeller*qty
  const qty = parseQtyFromDesc(row.description);
  const amount = toNumberMaybe(row.amount);
  const net = toNumberMaybe(netToSellerPerUnit);
  if (net > 0) return amount - net * qty;

  return 0;
}

/** ===================== GET /api/admin/stats ===================== */
router.get("/", async (req, res) => {
  try {
    const mode = String(req.query.mode || "month"); // month | year
    const year = Number(req.query.year || new Date().getFullYear());
    const month = Number(req.query.month || new Date().getMonth() + 1);

    const { start, end } = mode === "year" ? getYearRange(year) : getMonthRange(year, month);

    /** ========== 0) OVERALL CASHBOOK (IN/OUT/PROFIT) ========== */
    // ✅ ทำแบบ aggregate แยก IN/OUT = กันปัญหา groupBy/enum mismatch
    const inAgg = await prisma.cashbookEntry.aggregate({
      where: { createdAt: { gte: start, lt: end }, type: "IN" },
      _sum: { amount: true, profit: true },
      _count: { _all: true },
    });

    const outAgg = await prisma.cashbookEntry.aggregate({
      where: { createdAt: { gte: start, lt: end }, type: "OUT" },
      _sum: { amount: true, profit: true },
      _count: { _all: true },
    });

    const totalIn = toNumberMaybe(inAgg?._sum?.amount);
    const totalOut = toNumberMaybe(outAgg?._sum?.amount);

    // profit ของคุณเป็น Decimal @default(0) อยู่แล้ว รวมได้เลย
    const totalProfit = toNumberMaybe(inAgg?._sum?.profit) + toNumberMaybe(outAgg?._sum?.profit);

    /** ========== OVERVIEW: CONTRACTS ACTIVE ========== */
    const activeContractsCount = await prisma.contract.count({ where: { status: "ACTIVE" } });

    const latestActiveContract = await prisma.contract.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        principal: true,
        dueDate: true,
        createdAt: true,
        customer: { select: { name: true, phone: true } },
      },
    });

    /** ========== DEPOSIT (ฝากดูแล) ========== */
    const depositAgg = await prisma.contract.aggregate({
      where: { createdAt: { gte: start, lt: end } },
      _sum: { principal: true },
      _count: { _all: true },
    });

    const depositPaid = toNumberMaybe(depositAgg._sum.principal);
    const depositContractsCreated = Number(depositAgg._count._all || 0);

    let contractCashbookRows = [];
    try {
      contractCashbookRows = await prisma.cashbookEntry.findMany({
        where: { contractId: { not: null }, createdAt: { gte: start, lt: end } },
        select: { id: true, type: true, category: true, amount: true, profit: true, description: true },
      });
    } catch {
      contractCashbookRows = [];
    }

    const depositFeeRows = contractCashbookRows.filter(isDepositServiceFeeRow);
    const depositServiceFeeIncome = depositFeeRows.reduce((sum, r) => sum + toNumberMaybe(r.profit), 0);

    /** ========== TRADE (รับซื้อ/ขาย/ฝากขาย) ========== */
    const inventoryCashbookRows = await prisma.cashbookEntry.findMany({
      where: { inventoryItemId: { not: null }, createdAt: { gte: start, lt: end } },
      select: {
        id: true,
        type: true,
        category: true,
        amount: true,
        profit: true,
        description: true,
        createdAt: true,
        inventoryItemId: true,
        inventoryItem: { select: { id: true, cost: true, consignmentContractId: true } },
      },
    });

    // ขาย (INVENTORY_SALE)
    const saleRows = inventoryCashbookRows.filter(isInventorySaleRow);
    const saleCount = saleRows.length;

    // แยก “ขายปกติ” vs “ฝากขาย”
    const normalSaleRows = saleRows.filter((r) => !r.inventoryItem?.consignmentContractId);
    const consignmentSaleRows = saleRows.filter((r) => !!r.inventoryItem?.consignmentContractId);

    // กำไรขายปกติ
    const normalSaleProfit = normalSaleRows.reduce((sum, r) => sum + calcNormalSaleProfit(r), 0);

    // commission ฝากขาย (คำนวณจาก profit ถ้ามี ไม่งั้น amount - netToSeller*qty)
    const consIds = Array.from(
      new Set(consignmentSaleRows.map((r) => r.inventoryItem?.consignmentContractId).filter((x) => x != null))
    );

    let consMap = new Map();
    if (consIds.length) {
      const cons = await prisma.consignmentContract.findMany({
        where: { id: { in: consIds } },
        select: { id: true, netToSeller: true },
      });
      consMap = new Map(cons.map((c) => [c.id, c.netToSeller]));
    }

    const consignmentCommission = consignmentSaleRows.reduce((sum, r) => {
      const consId = r.inventoryItem?.consignmentContractId;
      const netToSeller = consId ? consMap.get(consId) : 0;
      return sum + calcConsignmentCommission(r, netToSeller);
    }, 0);

    const consignmentVat = consignmentCommission * 0.07;

    // รับซื้อเข้า (INVENTORY_BUY_IN)
    const buyInRows = inventoryCashbookRows.filter(isInventoryBuyInRow);
    const buyInCount = buyInRows.length;

    /** ---- response ----
     * ✅ ส่งค่า "ซ้ำ" ทั้งใน overview และ root เพื่อกัน UI อ่านคนละ key แล้วเป็น 0
     */
    const payload = {
      mode,
      year,
      month: mode === "month" ? month : null,
      range: { start, end },

      overview: {
        activeContractsCount,
        latestActiveContract,

        totalIn,
        totalOut,
        totalProfit,

        debugCash: {
          inCount: Number(inAgg?._count?._all || 0),
          outCount: Number(outAgg?._count?._all || 0),
          inSum: toNumberMaybe(inAgg?._sum?.amount),
          outSum: toNumberMaybe(outAgg?._sum?.amount),
          inProfit: toNumberMaybe(inAgg?._sum?.profit),
          outProfit: toNumberMaybe(outAgg?._sum?.profit),
        },
      },

      deposit: {
        paidPrincipal: depositPaid,
        contractsCreated: depositContractsCreated,
        serviceFeeIncome: depositServiceFeeIncome,
        debug: { cashbookRows: contractCashbookRows.length, feeRowsMatched: depositFeeRows.length },
      },

      trade: {
        buyInCount,
        saleCount,
        normalSaleProfit,
        consignmentCommission,
        consignmentVat,
        debug: {
          cashbookRows: inventoryCashbookRows.length,
          saleMatched: saleRows.length,
          normalSaleMatched: normalSaleRows.length,
          consignmentSaleMatched: consignmentSaleRows.length,
          consignmentContractsLoaded: consIds.length,
        },
      },

      // ✅ root duplicate (กัน frontend ใช้ data.totalIn/data.totalProfit ฯลฯ)
      activeContractsCount,
      latestActiveContract,
      totalIn,
      totalOut,
      totalProfit,

      depositPaid,
      depositContractsCreated,
      serviceFeeIncome: depositServiceFeeIncome,

      buyInCount,
      saleCount,
      normalSaleProfit,
      consignmentCommission,
      consignmentVat,
    };

    res.json(toJsonSafe(payload));
  } catch (err) {
    console.error("GET /api/admin/stats error:", err);
    res.status(500).json({ message: "Internal Server Error", error: String(err?.message || err) });
  }
});

/** ===================== GET /api/admin/stats/series ===================== */
router.get("/series", async (req, res) => {
  try {
    const mode = String(req.query.mode || "month");
    const year = Number(req.query.year || new Date().getFullYear());
    if (mode !== "month") return res.status(400).json({ message: "mode รองรับเฉพาะ month" });

    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year + 1, 0, 1));

    const depositSeries = await prisma.$queryRaw`
      SELECT
        to_char(date_trunc('month', "createdAt"), 'YYYY-MM-01') AS m,
        COALESCE(SUM("principal"),0)::bigint AS deposit_paid,
        COUNT(*)::bigint AS contracts_created
      FROM "Contract"
      WHERE "createdAt" >= ${yearStart}
        AND "createdAt" < ${yearEnd}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    const cashbookRows = await prisma.cashbookEntry.findMany({
      where: { createdAt: { gte: yearStart, lt: yearEnd } },
      select: {
        createdAt: true,
        contractId: true,
        inventoryItemId: true,
        type: true,
        category: true,
        description: true,
        amount: true,
        profit: true,
        inventoryItem: { select: { consignmentContractId: true, cost: true } },
      },
    });

    const consIds = Array.from(
      new Set(
        cashbookRows
          .filter((r) => r.inventoryItemId && isInventorySaleRow(r))
          .map((r) => r.inventoryItem?.consignmentContractId)
          .filter((x) => x != null)
      )
    );

    let consMap = new Map();
    if (consIds.length) {
      const cons = await prisma.consignmentContract.findMany({
        where: { id: { in: consIds } },
        select: { id: true, netToSeller: true },
      });
      consMap = new Map(cons.map((c) => [c.id, c.netToSeller]));
    }

    const bucket = new Map();

    const getKey = (d) => {
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, "0");
      return `${y}-${m}-01`;
    };

    const ensure = (k) => {
      if (!bucket.has(k)) {
        bucket.set(k, {
          m: k,
          total_in: 0,
          total_out: 0,
          total_profit: 0,

          deposit_fee_income: 0,

          buy_in_count: 0,
          sale_count: 0,
          normal_sale_profit: 0,
          consignment_commission: 0,
          consignment_vat: 0,
        });
      }
      return bucket.get(k);
    };

    for (const r of cashbookRows) {
      const k = getKey(new Date(r.createdAt));
      const b = ensure(k);

      const type = String(r.type || "").toUpperCase();
      const amount = toNumberMaybe(r.amount);
      const profit = toNumberMaybe(r.profit);

      if (type === "IN") b.total_in += amount;
      if (type === "OUT") b.total_out += amount;
      b.total_profit += profit;

      if (r.contractId && isDepositServiceFeeRow(r)) {
        b.deposit_fee_income += profit;
      }

      if (r.inventoryItemId && isInventoryBuyInRow(r)) {
        b.buy_in_count += 1;
      }

      if (r.inventoryItemId && isInventorySaleRow(r)) {
        b.sale_count += 1;
        const isCons = !!r.inventoryItem?.consignmentContractId;
        if (isCons) {
          const consId = r.inventoryItem?.consignmentContractId;
          const netToSeller = consId ? consMap.get(consId) : 0;
          b.consignment_commission += calcConsignmentCommission(r, netToSeller);
        } else {
          b.normal_sale_profit += calcNormalSaleProfit(r);
        }
      }
    }

    for (const v of bucket.values()) {
      v.consignment_vat = v.consignment_commission * 0.07;
    }

    const series = Array.from(bucket.values()).sort((a, b) => a.m.localeCompare(b.m));

    const tradeSeries = series.map((x) => ({
      m: x.m,
      total_in: x.total_in,
      total_out: x.total_out,
      total_profit: x.total_profit,

      buy_in_count: x.buy_in_count,
      sale_count: x.sale_count,
      normal_sale_profit: x.normal_sale_profit,
      consignment_commission: x.consignment_commission,
      consignment_vat: x.consignment_vat,
    }));

    const feeSeries = series.map((x) => ({ m: x.m, fee_income: x.deposit_fee_income }));

    res.json(
      toJsonSafe({
        year,
        depositSeries,
        tradeSeries,
        feeSeries,
      })
    );
  } catch (err) {
    console.error("GET /api/admin/stats/series error:", err);
    res.status(500).json({ message: "Internal Server Error", error: String(err?.message || err) });
  }
});

export default router;
