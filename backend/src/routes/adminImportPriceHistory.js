import express from "express";
import multer from "multer";
import XLSX from "xlsx";
import { prisma } from "../db.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// ====== TODO: auth admin ======
function requireAdmin(req, res, next) {
  return next();
}

// ====== Utils ======
function normalizeStr(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function toInt(v) {
  const s = normalizeStr(v);
  if (!s) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.round(n) : null;
}

function toCEYear(y) {
  let year = Number(y);
  while (year >= 2400) year -= 543; // กัน พ.ศ./ปีเพี้ยน
  return year;
}

function parseThaiDate(input) {
  if (!input) return null;

  // Date object
  if (input instanceof Date && !isNaN(input.getTime())) {
    const y = toCEYear(input.getFullYear());
    return new Date(y, input.getMonth(), input.getDate(), 0, 0, 0);
  }

  // Excel serial number
  if (typeof input === "number") {
    const d = XLSX.SSF.parse_date_code(input);
    if (!d) return null;
    const y = toCEYear(d.y);
    return new Date(y, d.m - 1, d.d, 0, 0, 0);
  }

  const s = normalizeStr(input);
  if (!s) return null;

  // ISO parse
  const isoTry = new Date(s);
  if (!isNaN(isoTry.getTime())) {
    const y = toCEYear(isoTry.getFullYear());
    return new Date(y, isoTry.getMonth(), isoTry.getDate(), 0, 0, 0);
  }

  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return null;

  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);

  if (year < 100) year = year + 2500; // 2 หลัก → พ.ศ.
  year = toCEYear(year);

  const d = new Date(year, month - 1, day, 0, 0, 0);
  if (isNaN(d.getTime())) return null;
  return d;
}

// normalize เบื้องต้นจากชื่อสินค้า
function basicNormalize(itemName) {
  const s = normalizeStr(itemName);
  const lower = s.toLowerCase();
  let brand = null;

  const brands = [
    "asus",
    "acer",
    "lenovo",
    "hp",
    "dell",
    "msi",
    "apple",
    "samsung",
    "huawei",
    "xiaomi",
    "oppo",
    "vivo",
  ];
  for (const b of brands) {
    if (lower.includes(b)) {
      brand = b.toUpperCase();
      break;
    }
  }

  let model = null;
  if (lower.includes("iphone")) model = "iPhone";
  else if (lower.includes("ipad")) model = "iPad";
  else if (lower.includes("macbook")) model = "MacBook";

  let cpu = null;
  const cpuM = s.match(/\b(i[3579]\s*[-]?\s*\d{4,5}[a-z]?)\b/i);
  if (cpuM?.[1]) cpu = cpuM[1].replace(/\s+/g, "");

  let ram = null;
  const ramM = s.match(/(\d+)\s*gb\s*ram/i);
  if (ramM?.[1]) ram = `${ramM[1]}GB`;

  let storage = null;
  const stM = s.match(/(\d+)\s*(gb|tb)\b/i);
  if (stM?.[1] && stM?.[2]) storage = `${stM[1]}${stM[2].toUpperCase()}`;

  let gpu = null;
  const gpuM = s.match(/\b(rtx|gtx)\s*\d{3,4}\s*(ti|super)?\b/i);
  if (gpuM?.[0]) gpu = gpuM[0].replace(/\s+/g, " ").toUpperCase();

  return { brand, model, cpu, ram, storage, gpu };
}

// ดึงค่าจากหลายหัวข้อ (กันหัวตารางไม่ตรง)
function pick(row, keys) {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && String(row[k]).trim() !== "") {
      return row[k];
    }
  }
  return "";
}

function mapExcelRowToPayload(row, rowIndex, sheetName) {
  const buyDate = parseThaiDate(pick(row, ["วันที่", "วันซื้อ", "วันที่รับซื้อ", "วันที่ซื้อ", "Date", "BuyDate"]));
  const sellDate = parseThaiDate(pick(row, ["วันที่ขาย", "วันขาย", "SellDate"]));

  const itemName = normalizeStr(pick(row, ["รายการ", "สินค้า", "ชื่อสินค้า", "Item", "Name"]));
  const buyPrice = toInt(pick(row, ["ราคารับซื้อเข้า", "ราคาซื้อ", "ซื้อ", "Buy", "BuyPrice"]));
  const sellPrice = toInt(pick(row, ["ราคาขายออก", "ราคาขาย", "ขาย", "Sell", "SellPrice"]));
  const note = normalizeStr(pick(row, ["หมายเหตุ", "Note"]));

  const errors = [];
  if (!itemName) errors.push("ไม่มีรายการ/ชื่อสินค้า");
  if (!buyDate) errors.push("วันที่ซื้อ/วันที่ ไม่ถูกต้อง");
  if (buyPrice === null || buyPrice <= 0) errors.push("ราคารับซื้อเข้า/ราคาซื้อ ไม่ถูกต้อง");

  // กันแถว summary
  if (itemName === "ยอดรวม" || itemName.toLowerCase().includes("total")) {
    errors.push("แถวสรุป ไม่ต้องนำเข้า");
  }

  const profit = sellPrice !== null && buyPrice !== null ? sellPrice - buyPrice : null;
  const norm = basicNormalize(itemName);

  return {
    sheetName,
    rowIndex,
    errors,
    warnings: [],
    data: {
      itemName,
      buyDate: buyDate ? buyDate.toISOString() : null,
      sellDate: sellDate ? sellDate.toISOString() : null,
      buyPrice: buyPrice ?? 0,
      sellPrice: sellPrice ?? null,
      profit,
      note: note || null,
      channel: null,
      ...norm,
    },
  };
}

// เลือกชีตที่ควรอ่าน: ข้าม "สรุป" + ชีตว่าง
function getImportableSheetNames(wb) {
  return (wb.SheetNames || []).filter((name) => {
    const n = normalizeStr(name);
    if (!n) return false;
    if (n.includes("สรุป")) return false;
    return true;
  });
}

/**
 * POST /admin/import/price-history/preview
 * ✅ อ่านทุกชีต แล้วรวมเป็น rows เดียว
 */
router.post(
  "/admin/import/price-history/preview",
  requireAdmin,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file?.buffer) {
        return res.status(400).json({ ok: false, message: "ไม่มีไฟล์" });
      }

      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheetNames = getImportableSheetNames(wb);

      const allRows = [];
      const sheetStats = [];

      for (const sheetName of sheetNames) {
        const ws = wb.Sheets[sheetName];
        if (!ws) continue;

        const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

        if (!rows || rows.length === 0) {
          sheetStats.push({ sheetName, total: 0, hasError: false });
          continue;
        }

        const mapped = rows.map((r, idx) => mapExcelRowToPayload(r, idx + 2, sheetName));
        const hasError = mapped.some((x) => (x.errors || []).length > 0);

        sheetStats.push({ sheetName, total: mapped.length, hasError });
        allRows.push(...mapped);
      }

      const hasError = allRows.some((x) => (x.errors || []).length > 0);

      return res.json({
        ok: true,
        sheetName: "ALL",
        sheets: sheetStats,
        total: allRows.length,
        hasError,
        rows: allRows,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({
        ok: false,
        message: "อ่านไฟล์ไม่สำเร็จ",
        error: e?.message || String(e),
      });
    }
  }
);

/**
 * POST /admin/import/price-history/commit
 * ✅ import ทีละแถว (กัน P2028)
 */
router.post(
  "/admin/import/price-history/commit",
  requireAdmin,
  express.json({ limit: "20mb" }),
  async (req, res) => {
    try {
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      if (!rows.length) {
        return res.status(400).json({ ok: false, message: "ไม่มีข้อมูล rows" });
      }

      const validRows = rows.filter((r) => r?.data && Array.isArray(r.errors) && r.errors.length === 0);
      if (!validRows.length) {
        return res.status(400).json({ ok: false, message: "ไม่มีแถวที่ผ่านตรวจสอบ" });
      }

      const results = [];
      const failed = [];

      for (const r of validRows) {
        const d = r.data;
        try {
          const created = await prisma.priceHistory.create({
            data: {
              itemName: d.itemName,
              buyPrice: Number(d.buyPrice || 0),
              sellPrice: d.sellPrice !== null ? Number(d.sellPrice) : null,
              profit: d.profit !== null ? Number(d.profit) : null,

              buyDate: new Date(d.buyDate),
              sellDate: d.sellDate ? new Date(d.sellDate) : null,

              note: d.note || null,
              channel: d.channel || null,

              brand: d.brand || null,
              model: d.model || null,
              cpu: d.cpu || null,
              ram: d.ram || null,
              storage: d.storage || null,
              gpu: d.gpu || null,

              source: "EXCEL_IMPORT",
            },
          });

          results.push({ sheetName: r.sheetName || null, rowIndex: r.rowIndex, id: created.id });
        } catch (err) {
          console.error("[IMPORT priceHistory] failed row", r.sheetName, r.rowIndex, err);
          failed.push({ sheetName: r.sheetName || null, rowIndex: r.rowIndex, message: err?.message || String(err) });
        }
      }

      return res.json({ ok: true, imported: results.length, failedCount: failed.length, results, failed });
    } catch (e) {
      console.error(e);
      return res.status(500).json({
        ok: false,
        message: "import ล้มเหลว",
        error: e?.message || String(e),
        code: e?.code || null,
        meta: e?.meta || null,
      });
    }
  }
);

/* =========================================================
 * ✅ NEW: GET /api/price-history/similar?q=...&limit=30
 * ใช้กับหน้า PriceAssessmentPage เพื่อดึง refs + stats
 * ========================================================= */
function tokenize(q = "") {
  return String(q)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length >= 2)
    .slice(0, 10);
}

function median(nums = []) {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return 0;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
}

router.get("/price-history/similar", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const limit = Math.min(Number(req.query.limit || 30), 100);

    if (!q) {
      return res.json({
        ok: true,
        refs: [],
        stats: { similarCount: 0, basedOn: "none", medianPrice: 0, floor: null, ceil: null },
      });
    }

    const tokens = tokenize(q);

    const OR = tokens.map((t) => ({
      itemName: { contains: t, mode: "insensitive" },
    }));

    const rows = await prisma.priceHistory.findMany({
      where: OR.length ? { OR } : undefined,
      orderBy: { buyDate: "desc" },
      take: limit,
      select: {
        id: true,
        itemName: true,
        buyPrice: true,
        sellPrice: true,
        profit: true,
        buyDate: true,
        sellDate: true,
        brand: true,
        model: true,
        cpu: true,
        ram: true,
        storage: true,
        gpu: true,
      },
    });

    const sellPrices = rows.map((r) => r.sellPrice).filter((x) => x != null).map(Number);
    const buyPrices = rows.map((r) => r.buyPrice).filter((x) => x != null).map(Number);

    const basedOn = sellPrices.length >= 5 ? "sellPrice" : buyPrices.length ? "buyPrice" : "none";
    const med = basedOn === "sellPrice" ? median(sellPrices) : basedOn === "buyPrice" ? median(buyPrices) : 0;

    const floor = med ? Math.round(med * 0.85) : null;
    const ceil = med ? Math.round(med * 1.15) : null;

    return res.json({
      ok: true,
      refs: rows,
      stats: {
        similarCount: rows.length,
        basedOn,
        medianPrice: med,
        floor,
        ceil,
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, message: "หา refs ไม่สำเร็จ", error: e?.message || String(e) });
  }
});

export default router;
