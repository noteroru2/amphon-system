// backend/src/routes/ai.js
import { Router } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "../db.js";

const router = Router();

/* -------------------- helpers -------------------- */
function num(v, fallback = 0) {
  if (v == null) return fallback;
  if (typeof v === "object" && typeof v.toNumber === "function") return v.toNumber(); // Prisma Decimal
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function median(arr) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      const jsonString = text.slice(start, end + 1);
      return JSON.parse(jsonString);
    }
    throw new Error("Cannot parse JSON from model output: " + text);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geminiGenerateWithRetry(model, prompt, opts = {}) {
  const {
    retries = 3,
    baseDelayMs = 500,
    maxDelayMs = 2500,
    retryOnStatuses = [429, 500, 502, 503, 504],
  } = opts;

  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      return await model.generateContent(prompt);
    } catch (err) {
      lastErr = err;
      const status = err?.status;
      const shouldRetry = retryOnStatuses.includes(status);

      if (!shouldRetry || i === retries) break;

      const delay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, i));
      console.warn(`[AI] retry ${i + 1}/${retries} after ${delay}ms (status=${status})`);
      await sleep(delay);
    }
  }
  throw lastErr;
}

/** split keyword -> ["iphone","13","pro","max","256gb"] */
function tokenizeName(name) {
  const raw = String(name || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!raw) return [];
  const tokens = raw
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 6);

  return tokens;
}

async function findSimilarInventoryItemsByName(name) {
  const q = String(name || "").trim();
  if (!q) return [];

  const tokens = tokenizeName(q);

  const where =
    tokens.length > 0
      ? {
          OR: tokens.map((t) => ({
            name: { contains: t, mode: "insensitive" },
          })),
        }
      : { name: { contains: q.slice(0, 40), mode: "insensitive" } };

  const items = await prisma.inventoryItem.findMany({
    where,
    take: 40,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      cost: true,
      targetPrice: true,
      sellingPrice: true,
      quantity: true,
      quantitySold: true,
      status: true,
      createdAt: true,
    },
  });

  return items;
}

function buildInternalPriceStats(items) {
  // sellingPrice / targetPrice / cost ในระบบของคุณ "ควรเป็นต่อชิ้น" (per-unit)
  const solds = items.map((x) => num(x.sellingPrice)).filter((x) => x > 0);
  const targets = items.map((x) => num(x.targetPrice)).filter((x) => x > 0);
  const costs = items.map((x) => num(x.cost)).filter((x) => x > 0);

  const base = solds.length ? solds : targets;
  const med = base.length ? median(base) : 0;
  const costMed = costs.length ? median(costs) : 0;

  let floor = med ? med * 0.9 : 0;
  let ceil = med ? med * 1.1 : 0;

  if (costMed > 0) floor = Math.max(floor, costMed * 1.05);

  if (!med) {
    floor = 0;
    ceil = 0;
  }

  return {
    similarCount: items.length,
    basedOn: solds.length ? "sellingPrice" : targets.length ? "targetPrice" : "none",
    medianPrice: med,
    costMedian: costMed,
    floor: floor || null,
    ceil: ceil || null,
  };
}

function buildFallbackPriceFromInternal(stats, marginPct = 10) {
  const med = Number(stats?.medianPrice || 0);
  const floor = Number(stats?.floor || 0);
  const ceil = Number(stats?.ceil || 0);

  if (med > 0) {
    const appraisedPrice = Math.round(med);
    const appraisedMin = Math.round(floor > 0 ? floor : med * 0.9);
    const appraisedMax = Math.round(ceil > 0 ? ceil : med * 1.1);
    const targetPrice = Math.round(appraisedPrice * (1 + marginPct / 100));
    return {
      appraisedMin,
      appraisedMax,
      appraisedPrice,
      targetPrice,
      confidence: 35,
      rationale: "AI ไม่พร้อมใช้งาน จึงประเมินจากราคาภายในระบบ (ของคล้ายในคลัง) เป็นหลัก",
      fallback: true,
    };
  }

  return {
    appraisedMin: 0,
    appraisedMax: 0,
    appraisedPrice: 0,
    targetPrice: 0,
    confidence: 10,
    rationale: "AI ไม่พร้อมใช้งาน และไม่มีข้อมูลสินค้าคล้ายในระบบเพียงพอ จึงยังประเมินราคาไม่ได้",
    fallback: true,
  };
}

/* -------------------- OCR validate helpers -------------------- */
function onlyDigits(s) {
  return String(s || "").replace(/\D/g, "");
}

function isValidThaiID(id13) {
  const id = onlyDigits(id13);
  if (!/^\d{13}$/.test(id)) return false;

  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(id[i], 10) * (13 - i);
  }
  const checkDigit = (11 - (sum % 11)) % 10;
  return checkDigit === parseInt(id[12], 10);
}

function normalizeThaiName(name) {
  const s = String(name || "")
    .replace(/\(.*?\)/g, " ") // ตัด (mock) / ข้อความในวงเล็บ
    .replace(/(นาย|นางสาว|น\.ส\.|นาง)\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return s;
}

function normalizeThaiAddress(addr) {
  return String(addr || "")
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================================================
   1) OCR ID CARD
   POST /api/ai/ocr-idcard
========================================================= */
router.post("/ocr-idcard", async (req, res) => {
  try {
    const { imageBase64, imageDataUrl, mimeType: bodyMimeType } = req.body || {};

    let raw = imageBase64 || imageDataUrl;
    if (!raw) {
      return res.status(400).json({ ok: false, message: "ต้องส่ง imageBase64 หรือ imageDataUrl มาด้วย" });
    }

    let base64 = raw;
    let mimeType = bodyMimeType || "image/jpeg";

    const commaIndex = raw.indexOf(",");
    if (commaIndex !== -1) {
      const meta = raw.slice(0, commaIndex);
      base64 = raw.slice(commaIndex + 1);
      const m = meta.match(/data:(.*?);base64/);
      if (m && m[1]) mimeType = m[1];
    }

    // ✅ คุม mock ด้วย ENV เท่านั้น (กัน “เผลอ” ใช้ mock ใน production)
    const allowMock = String(process.env.OCR_ALLOW_MOCK || "").toLowerCase() === "true";
    if (!process.env.GEMINI_API_KEY) {
      if (!allowMock) {
        return res.status(503).json({
          ok: false,
          message: "OCR ยังไม่พร้อมใช้งาน (GEMINI_API_KEY ไม่ถูกตั้งค่า)",
        });
      }

      return res.json({
        ok: true,
        valid: true,
        data: {
          name: "อำพล พวงสุข",
          idCard: "1349900900681",
          address: "ที่อยู่จาก mock address",
        },
        confidence: { idCard: 0.99, name: 0.9, address: 0.7 },
        mock: true,
      });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // ✅ ปรับ prompt: “ห้ามเดาเลขบัตร” และ “ถ้าไม่ชัวร์ให้เว้นว่าง”
    const prompt = `
คุณได้รับรูปบัตรประชาชนไทยเป็นภาพ ให้คุณอ่านข้อความบนบัตร แล้วตอบกลับเป็น JSON เท่านั้น (ห้ามมีข้อความอื่น)
รูปแบบ:
{
  "name": "ชื่อ นามสกุล",
  "idCard": "เลขประจำตัวประชาชน 13 หลัก ไม่มีขีด",
  "address": "ที่อยู่"
}

กติกาสำคัญ:
- ห้ามเดาเลขบัตรประชาชน: ถ้าอ่านไม่ชัด ให้ใส่ "" (ค่าว่าง)
- ชื่อ/ที่อยู่ ถ้าไม่ชัดให้ใส่ "" ได้
- ห้ามใส่ null
- ตอบกลับเป็น JSON เพียว ๆ เท่านั้น
`.trim();

    const imagePart = { inlineData: { data: base64, mimeType } };

    const result = await model.generateContent([prompt, imagePart]);
    const text = (result.response.text() || "").trim();
    const parsed = safeJsonParse(text);

    const nameRaw = String(parsed?.name || "");
    const idCardRaw = String(parsed?.idCard || "");
    const addressRaw = String(parsed?.address || "");

    const name = normalizeThaiName(nameRaw);
    const idCard = onlyDigits(idCardRaw).slice(0, 13);
    const address = normalizeThaiAddress(addressRaw);

    // ✅ validate เลขบัตรก่อน “ยอมรับ”
    const idOk = isValidThaiID(idCard);

    if (!idOk) {
      return res.json({
        ok: true,
        valid: false,
        error: "ไม่สามารถยืนยันเลขบัตรประชาชนได้ กรุณาถ่ายใหม่ (ให้เห็นเลข 13 หลักชัด ๆ)",
        data: {
          name: name || "",
          idCard: "", // ไม่ปล่อยเลขที่ไม่ผ่าน
          address: address || "",
        },
        confidence: { idCard: 0.0, name: name ? 0.6 : 0.0, address: address ? 0.5 : 0.0 },
      });
    }

    // name/address อาจว่างได้ แต่ idCard ผ่านแล้วถือว่า usable
    return res.json({
      ok: true,
      valid: true,
      data: {
        name: name || "",
        idCard,
        address: address || "",
      },
      confidence: { idCard: 0.99, name: name ? 0.85 : 0.4, address: address ? 0.75 : 0.35 },
    });
  } catch (err) {
    console.error("POST /api/ai/ocr-idcard error:", err);
    return res.status(500).json({ ok: false, message: "ไม่สามารถทำ OCR ได้", error: err?.message || String(err) });
  }
});

/* =========================================================
   2) PRICE SUGGEST
   POST /api/ai/price-suggest
========================================================= */
router.post("/price-suggest", async (req, res) => {
  try {
    const { name, brand, model, spec, condition, accessories, notes, desiredMarginPct } = req.body || {};

    if (!name || typeof name !== "string") {
      return res.status(400).json({ ok: false, message: "ต้องส่ง name (ชื่อสินค้า) มาด้วย" });
    }

    const margin = Number.isFinite(Number(desiredMarginPct)) ? Number(desiredMarginPct) : 10;

    const similarItems = await findSimilarInventoryItemsByName(name);
    const stats = buildInternalPriceStats(similarItems);

    const refs = similarItems.slice(0, 10).map((x) => ({
      id: x.id,
      name: x.name,
      cost: num(x.cost),
      targetPrice: num(x.targetPrice),
      sellingPrice: num(x.sellingPrice),
      status: x.status,
      createdAt: x.createdAt,
    }));

    if (!process.env.GEMINI_API_KEY) {
      const fb = buildFallbackPriceFromInternal(stats, margin);
      return res.json({ ok: true, data: { ...fb, refs, stats } });
    }

    const ctx = {
      item: { name, brand, model, spec, condition, accessories, notes },
      internalMarket: {
        similarCount: stats.similarCount,
        basedOn: stats.basedOn,
        medianPrice: stats.medianPrice,
        costMedian: stats.costMedian,
        recommendedFloor: stats.floor,
        recommendedCeiling: stats.ceil,
        examples: refs,
      },
      rules: {
        currency: "THB",
        recommendedMarginPct: margin,
        constraint: "If floor/ceiling exist, keep appraisedPrice within them",
        ifNoInternalData: "use wide range and confidence <= 40",
        // ✅ บังคับให้ยึดข้อมูลภายในก่อน
        priority: "Prefer internalMarket examples/median; only adjust by condition/accessories if provided",
      },
    };

    const prompt = `
คุณเป็นผู้ช่วยประเมินราคาสินค้ามือสองในร้านไอทีประเทศไทย
ตอบกลับเป็น JSON เท่านั้น ห้ามมีข้อความอื่น (ห้าม markdown)

ข้อมูลนำเข้า:
${JSON.stringify(ctx)}

ให้ตอบ JSON รูปแบบนี้เท่านั้น:
{
  "appraisedMin": number,
  "appraisedMax": number,
  "appraisedPrice": number,
  "targetPrice": number,
  "confidence": number,
  "rationale": string
}

กติกา:
- ถ้ามี recommendedFloor/recommendedCeiling ให้ appraisedPrice อยู่ในช่วงนั้น
- ถ้ามีตัวอย่างภายใน (examples) ให้ยึด medianPrice เป็นฐานก่อนเสมอ
- targetPrice ต้อง >= appraisedPrice และควรเผื่อกำไรตาม recommendedMarginPct
- ถ้าข้อมูลภายในไม่พอ ให้ confidence <= 40 และช่วง min/max กว้างขึ้น
- rationale เป็นภาษาไทย สั้น กระชับ และอ้างอิงข้อมูลภายในเมื่อทำได้
`.trim();

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const modelFlash = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    let parsed;
    try {
      const result = await geminiGenerateWithRetry(modelFlash, prompt, {
        retries: 3,
        baseDelayMs: 600,
        maxDelayMs: 2600,
        retryOnStatuses: [429, 500, 502, 503, 504],
      });
      parsed = safeJsonParse((result.response.text() || "").trim());
    } catch (e1) {
      console.warn("[AI] flash failed, fallback model", e1?.status, e1?.message);
      try {
        const modelFallback = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result2 = await geminiGenerateWithRetry(modelFallback, prompt, {
          retries: 2,
          baseDelayMs: 800,
          maxDelayMs: 3000,
          retryOnStatuses: [429, 500, 502, 503, 504],
        });
        parsed = safeJsonParse((result2.response.text() || "").trim());
      } catch (e2) {
        console.warn("[AI] fallback failed, use internal fallback", e2?.status, e2?.message);
        const fb = buildFallbackPriceFromInternal(stats, margin);
        return res.json({ ok: true, data: { ...fb, refs, stats, aiError: "MODEL_OVERLOADED" } });
      }
    }

    let appraisedMin = num(parsed.appraisedMin);
    let appraisedMax = num(parsed.appraisedMax);
    let appraisedPrice = num(parsed.appraisedPrice);
    let targetPrice = num(parsed.targetPrice);
    let confidence = clamp(Math.round(num(parsed.confidence)), 0, 100);
    const rationale = String(parsed.rationale || "").slice(0, 800);

    const floor = stats.floor;
    const ceil = stats.ceil;

    if (floor != null && ceil != null && floor > 0 && ceil > 0) {
      appraisedPrice = clamp(appraisedPrice, floor, ceil);
      appraisedMin = Math.max(appraisedMin, floor);
      appraisedMax = Math.min(appraisedMax, ceil);
      if (appraisedMax < appraisedMin) appraisedMax = appraisedMin;
    }

    if (stats.similarCount === 0) confidence = Math.min(confidence, 40);

    if (targetPrice < appraisedPrice) targetPrice = appraisedPrice * (1 + margin / 100);

    appraisedMin = Math.round(appraisedMin);
    appraisedMax = Math.round(appraisedMax);
    appraisedPrice = Math.round(appraisedPrice);
    targetPrice = Math.round(targetPrice);

    return res.json({
      ok: true,
      data: {
        appraisedMin,
        appraisedMax,
        appraisedPrice,
        targetPrice,
        confidence,
        rationale,
        refs,
        stats,
        fallback: false,
      },
    });
  } catch (err) {
    console.error("POST /api/ai/price-suggest error:", err);
    return res.status(500).json({ ok: false, message: "ไม่สามารถประเมินราคาได้", error: err?.message || String(err) });
  }
});

export default router;
