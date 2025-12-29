import express from "express";
import multer from "multer";
import XLSX from "xlsx";
import { prisma } from "../db.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// ====== TODO: กันแอดมินจริงภายหลัง ======
function requireAdmin(req, res, next) {
  return next();
}

/* =========================
   Utils
========================= */
function normalizeStr(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function toInt(v) {
  const n = Number(String(v ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) ? Math.round(n) : null;
}

function toCEYear(y) {
  let year = Number(y);
  if (!Number.isFinite(year)) return null;
  // กันปี พ.ศ. / ปีเพี้ยน (เช่น 3110) → ลดจนเป็น ค.ศ.
  while (year >= 2400) year -= 543;
  return year;
}

function roundUpTo10(n) {
  const x = Number(n || 0);
  if (!Number.isFinite(x)) return 0;
  return Math.ceil(x / 10) * 10;
}

// ✅ ใช้ "ดอก/15 วัน" เป็นฐาน: 7 = 15/2, 15 = 1x, 30 = 2x
function buildFeeBreakdownFromFee15(principal, termDays, fee15) {
  const amount = Number(principal || 0);
  const f15 = Number(fee15 || 0);

  let total = 0;
  if (termDays === 7) total = f15 / 2;
  else if (termDays === 30) total = f15 * 2;
  else total = f15;

  total = roundUpTo10(total);

  // docFee ตามสูตรเดิมคุณ
  let docFee = 0;
  if (amount <= 1000) docFee = 50;
  else if (amount <= 5000) docFee = 100;
  else docFee = 200;

  if (total <= docFee) docFee = total;

  const remainder = Math.max(total - docFee, 0);
  const storageFee = Math.floor(remainder * 0.6);
  const careFee = remainder - storageFee;

  return { docFee, storageFee, careFee, total };
}

function parseThaiDate(input) {
  if (!input) return null;

  // ✅ ถ้าเป็น Date อยู่แล้ว
  if (input instanceof Date && !isNaN(input.getTime())) {
    const y = input.getFullYear();
    const year = y >= 2400 ? y - 543 : y;
    return new Date(year, input.getMonth(), input.getDate(), 0, 0, 0);
  }

  // ✅ ถ้าเป็น excel serial number
  if (typeof input === "number") {
    const d = XLSX.SSF.parse_date_code(input);
    if (!d) return null;
    const year = toCEYear(d.y);
    if (!year) return null;
    return new Date(year, d.m - 1, d.d, 0, 0, 0);
  }

  const s = normalizeStr(input);
  if (!s) return null;

  // ISO/Date parse
  const isoTry = new Date(s);
  if (!isNaN(isoTry.getTime())) {
    const year = toCEYear(isoTry.getFullYear());
    if (!year) return null;
    return new Date(year, isoTry.getMonth(), isoTry.getDate(), 0, 0, 0);
  }

  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (!m) return null;

  const day = Number(m[1]);
  const month = Number(m[2]);
  let year = Number(m[3]);

  if (year < 100) year = year + 2500; // 2 หลัก → พ.ศ.
  year = toCEYear(year);
  if (!year) return null;

  const d = new Date(year, month - 1, day, 0, 0, 0);
  if (isNaN(d.getTime())) return null;
  return d;
}

function parseContactLineId(contactStr) {
  const s = normalizeStr(contactStr);
  if (!s) return "";
  const m = s.match(/-\s*([^)]+)\)/);
  if (m && m[1]) return m[1].trim();
  return s;
}

// นับวันแบบ date-only กัน timezone เพี้ยน
function diffDays(startDate, dueDate) {
  const s = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const d = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
  return Math.round((d.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
}

function resolveTermDays(startDate, dueDate) {
  if (!startDate || !dueDate) {
    return { termDays: null, dayDiff: null, warning: null, error: null };
  }

  const dayDiff = diffDays(startDate, dueDate);

  if ([7, 15, 30].includes(dayDiff)) {
    return { termDays: dayDiff, dayDiff, warning: null, error: null };
  }

  // เดาใกล้สุดแบบปลอดภัย (ห่างไม่เกิน 1 วัน)
  const candidates = [7, 15, 30];
  const nearest = candidates.reduce(
    (best, cur) => (Math.abs(cur - dayDiff) < Math.abs(best - dayDiff) ? cur : best),
    candidates[0]
  );

  if (Math.abs(nearest - dayDiff) > 1) {
    return {
      termDays: null,
      dayDiff,
      warning: null,
      error: `ระยะวันไม่อยู่ใน 7/15/30 (คำนวณได้ ${dayDiff} วัน)`,
    };
  }

  return {
    termDays: nearest,
    dayDiff,
    warning: `ระยะวันคำนวณได้ ${dayDiff} วัน → ปรับเป็น ${nearest} วันอัตโนมัติ`,
    error: null,
  };
}

// ✅ temp idCard กัน schema required/unique
function genTempIdCard(rowIndex) {
  return `TEMP-IMPORT-${String(rowIndex).padStart(4, "0")}-${Date.now()}`;
}

function isSummaryRow(customerName, assetModel) {
  const c = normalizeStr(customerName);
  const a = normalizeStr(assetModel);
  return c === "ยอดรวม" || a === "ยอดรวม";
}

/* =========================
   map row
========================= */
function mapExcelRowToPayload(row, rowIndex) {
  // จากไฟล์คุณ คอลัมน์แรกเป็นช่องว่าง
  const storageCode = normalizeStr(row[" "] || row[""] || row["เลขกล่อง"] || row["storageCode"]);

  // จากไฟล์คุณใช้ "ชื่อลูกค้า"
  const customerName = normalizeStr(row["ชื่อลูกค้า"] || row["ชื่อ"]);

  // จากไฟล์คุณใช้ "รายการ"
  const assetModel = normalizeStr(row["รายการ"] || row["ทรัพย์สิน"]);

  // จากไฟล์คุณใช้ "วันที่ฝาก" และ "ครบรอบ"
  const startDate = parseThaiDate(row["วันที่ฝาก"] || row["วันที่"]);
  const dueDate = parseThaiDate(row["ครบรอบ"] || row["วันครบ"]);

  // จากไฟล์คุณใช้ "ราคา"
  const principal = toInt(row["ราคา"] || row["ยอดฝาก"] || row["วงเงิน"]);

  // จากไฟล์คุณใช้ "ดอก/15 วัน" (มีเว้นวรรค)
  const fee15 = toInt(row["ดอก/15 วัน"] || row["ดอก/15วัน"]);

  const note = normalizeStr(row["หมายเหตุ"]);
  const contact = normalizeStr(row["ติดต่อ"]);
  const lineId = parseContactLineId(contact);

  const errors = [];
  const warnings = [];

  // กันแถวสรุป
  if (isSummaryRow(customerName, assetModel)) {
    errors.push("แถวสรุป (ยอดรวม) ไม่ต้องนำเข้า");
  }

  if (!storageCode) errors.push("ไม่มีเลขกล่อง/Storage");
  if (!customerName) errors.push("ไม่มีชื่อ");
  if (!assetModel) errors.push("ไม่มีรายการทรัพย์สิน");
  if (!startDate) errors.push("วันที่ฝากไม่ถูกต้อง");
  if (!dueDate) errors.push("วันครบไม่ถูกต้อง");
  if (!principal || principal <= 0) errors.push("ยอดฝากไม่ถูกต้อง");

  // termDays 7/15/30 + warning/error
  const termResolved = resolveTermDays(startDate, dueDate);
  if (termResolved.error) errors.push(termResolved.error);
  if (termResolved.warning) warnings.push(termResolved.warning);

  const termDays = termResolved.termDays;

  // feeConfig: docFee/storageFee/careFee/total
  const feeConfig =
    principal && termDays && fee15 !== null
      ? buildFeeBreakdownFromFee15(principal, termDays, fee15)
      : { docFee: 0, storageFee: 0, careFee: 0, total: 0 };

  return {
    rowIndex,
    errors,
    warnings,
    data: {
      storageCode,
      customerName,
      lineId,
      assetModel,
      principal,
      startDate: startDate ? startDate.toISOString() : null,
      dueDate: dueDate ? dueDate.toISOString() : null,
      termDays,
      dayDiff: termResolved.dayDiff ?? null,
      feeConfig,
      note,
      contact,
    },
  };
}

/* =========================
   Cashbook + ActionLog helpers
========================= */

// ✅ สร้าง cashbook entry แบบเดียวกับ “ทำสัญญาใหม่”
async function createCashbookForNewContract({ contractId, code, principal, feeTotal, atDate }) {
  const netReceive = Math.max(Number(principal || 0) - Number(feeTotal || 0), 0);

  if (netReceive <= 0) return;

  // NOTE: field names ตามที่คุณใช้ใน routes/contracts.js
  await prisma.cashbookEntry.create({
    data: {
      type: "OUT",
      category: "DEPOSIT_PRINCIPAL_OUT",
      amount: netReceive,
      profit: 0,
      contractId,
      description: `IMPORT ทำสัญญาฝากดูแล ${code} จ่ายสุทธิให้ลูกค้า ${netReceive} บาท (วงเงิน ${principal} บาท, ค่าบริการตามสัญญา ${feeTotal} บาท)`,
      // ถ้า schema มี createdAt ให้ย้อนวันได้ (ถ้าไม่มี Prisma จะ ignore)
      ...(atDate ? { createdAt: atDate } : {}),
    },
  });
}

async function createActionLogNewContract({ contractId, principal, atDate }) {
  await prisma.contractActionLog.create({
    data: {
      contractId,
      action: "NEW_CONTRACT",
      amount: Number(principal || 0),
      note: "IMPORT ทำสัญญาใหม่",
      ...(atDate ? { createdAt: atDate } : {}),
    },
  });
}

/* =========================
   PREVIEW
========================= */
router.post(
  "/admin/import/contracts/preview",
  requireAdmin,
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file || !req.file.buffer) {
        return res.status(400).json({ ok: false, message: "ไม่มีไฟล์" });
      }

      const wb = XLSX.read(req.file.buffer, { type: "buffer" });
      const sheetName = wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const mapped = rows.map((r, idx) => mapExcelRowToPayload(r, idx + 2));
      const hasError = mapped.some((x) => (x.errors || []).length > 0);

      return res.json({
        ok: true,
        sheetName,
        total: mapped.length,
        hasError,
        rows: mapped,
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

/* =========================
   COMMIT (สำคัญมาก: ไม่ใช้ transaction ยาวทั้งไฟล์)
   - แถวไหนพัง ข้ามแถวนั้น
   - รองรับ Neon/Pooler (แก้ P2028)
========================= */
router.post(
  "/admin/import/contracts/commit",
  requireAdmin,
  express.json({ limit: "10mb" }),
  async (req, res) => {
    try {
      const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
      if (!rows.length) {
        return res.status(400).json({ ok: false, message: "ไม่มีข้อมูล rows" });
      }

      // ✅ เอาเฉพาะแถวที่ผ่านจริง + กัน principal > 0
      const validRows = rows.filter(
        (r) =>
          r?.data &&
          Array.isArray(r.errors) &&
          r.errors.length === 0 &&
          Number(r.data.principal || 0) > 0
      );

      if (!validRows.length) {
        return res.status(400).json({ ok: false, message: "ไม่มีแถวที่ผ่านตรวจสอบ" });
      }

      const results = [];
      const failed = [];

      for (const r of validRows) {
        const d = r.data;

        try {
          const atDate = d.startDate ? new Date(d.startDate) : null;

          // 1) customer: หาโดย name + lineId (ถ้ามี)
          let customer = await prisma.customer.findFirst({
            where: {
              name: d.customerName,
              ...(d.lineId ? { lineId: d.lineId } : {}),
            },
          });

          if (!customer) {
            // ✅ กัน schema required/unique
            customer = await prisma.customer.create({
              data: {
                name: d.customerName || "",
                phone: "", // ถ้า schema เป็น string ห้าม null
                lineId: d.lineId || "",
                address: "",
                idCard: genTempIdCard(r.rowIndex),
              },
            });
          }

          // 2) สร้าง code กันซ้ำ
          const year = new Date(d.startDate || Date.now()).getFullYear();
          const code = `DEP-${year}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

          const allowed = [7, 15, 30];
          const usedTermDays = allowed.includes(Number(d.termDays)) ? Number(d.termDays) : 15;

          const startDate = new Date(d.startDate);
          const dueDate = new Date(d.dueDate);

          // 3) สร้าง contract
          const contract = await prisma.contract.create({
            data: {
              code,
              type: "DEPOSIT",
              status: "ACTIVE",
              customerId: customer.id,

              assetModel: d.assetModel || "",
              assetSerial: "",
              assetCondition: "",
              assetAccessories: "",
              storageCode: d.storageCode || "",

              principal: Number(d.principal) || 0,
              termDays: usedTermDays,
              feeConfig: d.feeConfig || { docFee: 0, storageFee: 0, careFee: 0, total: 0 },

              startDate,
              dueDate,
            },
          });

          // 4) ✅ สร้าง cashbook + actionlog เหมือนจริง
          const feeTotal = Number(d?.feeConfig?.total || 0);

          await createCashbookForNewContract({
            contractId: contract.id,
            code: contract.code,
            principal: contract.principal,
            feeTotal,
            atDate,
          });

          await createActionLogNewContract({
            contractId: contract.id,
            principal: contract.principal,
            atDate,
          });

          results.push({
            rowIndex: r.rowIndex,
            customerId: customer.id,
            contractId: contract.id,
            contractCode: contract.code,
          });
        } catch (rowErr) {
          console.error("[IMPORT] row failed:", r?.rowIndex, rowErr);
          failed.push({
            rowIndex: r?.rowIndex,
            message: rowErr?.message || String(rowErr),
          });
          // ไม่ throw เพื่อให้ import ต่อได้
        }
      }

      return res.json({
        ok: true,
        imported: results.length,
        results,
        failedCount: failed.length,
        failed,
      });
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

export default router;
