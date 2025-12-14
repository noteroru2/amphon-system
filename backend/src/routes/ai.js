// src/routes/ai.js
import { Router } from "express";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { prisma } from "../db.js"; // ⚠️ ปรับ path ให้ตรงของจริง (เช่น "../db.js" หรือ "../lib/prisma.js")

const router = Router();

/* -------------------- helpers -------------------- */
function num(v, fallback = 0) {
  if (v == null) return fallback;
  // Prisma Decimal (decimal.js)
  if (typeof v === "object" && typeof v.toNumber === "function") return v.toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function median(arr) {
  if (!arr.length) return 0;
  const a = [...arr].sort((x, y) => x - y);
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
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

async function findSimilarInventoryItemsByName(name) {
  const q = String(name || "").trim();
  if (!q) return [];

  // ตัดคำให้สั้นเพื่อไม่ให้ search แคบเกินไป
  const keyword = q.slice(0, 40);

  // ใช้ contains (insensitive) เพื่อความง่ายและเร็ว
  // Phase ต่อไปค่อยทำ embedding search
  const items = await prisma.inventoryItem.findMany({
    where: { name: { contains: keyword, mode: "insensitive" } },
    take: 30,
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
  const targets = items.map((x) => num(x.targetPrice)).filter((x) => x > 0);
  const solds = items.map((x) => num(x.sellingPrice)).filter((x) => x > 0);
  const costs = items.map((x) => num(x.cost)).filter((x) => x > 0);

  const base = solds.length ? solds : targets; // ถ้ามีราคาขายจริง ใช้ขายจริงก่อน
  const med = base.length ? median(base) : 0;
  const costMed = costs.length ? median(costs) : 0;

  // กรอบเริ่มต้น
  let min = med ? med * 0.9 : 0;
  let max = med ? med * 1.1 : 0;

  // ตั้ง floor กันต่ำกว่าทุน (ถ้ามีทุน)
  if (costMed > 0) min = Math.max(min, costMed * 1.05);

  // ถ้าไม่มีข้อมูลเลย ให้เป็น 0 เพื่อบอกโมเดลว่าไม่มี internal reference
  if (!med) {
    min = 0;
    max = 0;
  }

  return {
    similarCount: items.length,
    basedOn: solds.length ? "sellingPrice" : targets.length ? "targetPrice" : "none",
    medianPrice: med,
    costMedian: costMed,
    floor: min || null,
    ceil: max || null,
  };
}

// ====== เพิ่ม helper ด้านบนไฟล์ (ถ้ายังไม่มี) ======
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function geminiGenerateWithRetry(model, prompt, opts = {}) {
  const {
    retries = 3,               // จำนวนครั้ง retry
    baseDelayMs = 500,         // หน่วงเริ่มต้น
    maxDelayMs = 2500,         // หน่วงสูงสุด
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

function buildFallbackPriceFromInternal(stats, marginPct = 10) {
  // ถ้ามีกรอบ internal -> ใช้ median เป็นฐาน
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
      rationale:
        "ขณะนี้ AI ให้บริการไม่เสถียร จึงประเมินจากราคาภายในระบบ (ของคล้ายในคลัง) เป็นหลัก",
      fallback: true,
    };
  }

  // ไม่มีข้อมูลภายในเลย
  return {
    appraisedMin: 0,
    appraisedMax: 0,
    appraisedPrice: 0,
    targetPrice: 0,
    confidence: 10,
    rationale:
      "ขณะนี้ AI ให้บริการไม่เสถียร และไม่มีข้อมูลสินค้าคล้ายในระบบเพียงพอ จึงยังประเมินราคาไม่ได้",
    fallback: true,
  };
}

/* =========================================================
   1) OCR ID CARD (ของเดิมคุณ)
   POST /api/ai/ocr-idcard
========================================================= */
router.post("/ocr-idcard", async (req, res) => {
  try {
    const { imageBase64, imageDataUrl, mimeType: bodyMimeType } = req.body || {};

    // ----- ดึงข้อมูลรูป -----
    let raw = imageBase64 || imageDataUrl;

    if (!raw) {
      return res.status(400).json({
        message: "ต้องส่ง imageBase64 หรือ imageDataUrl มาด้วย",
      });
    }

    // raw อาจเป็น data URL: data:image/jpeg;base64,XXXXX หรือ base64 ล้วน
    let base64 = raw;
    let mimeType = bodyMimeType || "image/jpeg";

    const commaIndex = raw.indexOf(",");
    if (commaIndex !== -1) {
      // data URL
      const meta = raw.slice(0, commaIndex); // e.g. "data:image/jpeg;base64"
      base64 = raw.slice(commaIndex + 1);
      const m = meta.match(/data:(.*?);base64/);
      if (m && m[1]) {
        mimeType = m[1];
      }
    }

    // ----- ถ้าไม่มี GEMINI_API_KEY ให้ตอบ mock กลับไปก่อน -----
    if (!process.env.GEMINI_API_KEY) {
      console.warn("GEMINI_API_KEY not set. Returning mock OCR result.");
      return res.json({
        name: "อำพล พวงสุข (mock)",
        idCard: "1349900900681",
        address: "ที่อยู่จาก mock address",
      });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `
คุณได้รับรูปบัตรประชาชนไทยเป็นภาพ ให้คุณอ่านข้อความบนบัตร 
แล้วตอบกลับในรูปแบบ JSON เท่านั้น (ห้ามมีข้อความอื่นนอกจาก JSON) ในรูปแบบ:

{
  "name": "ชื่อ นามสกุล",
  "idCard": "เลขประจำตัวประชาชน 13 หลัก ไม่มีขีด",
  "address": "ที่อยู่เต็มตามบัตร หรือที่อยู่ใกล้เคียงที่สุด"
}

ข้อกำหนด:
- ถ้าอ่านไม่ชัด ให้เดาค่าที่เป็นไปได้มากที่สุด
- ห้ามใส่ null หรือปล่อยค่าว่างในทั้ง 3 field
- ตอบกลับเป็น JSON เพียว ๆ ไม่ต้องมีคำอธิบายเพิ่มเติม
`;

    const imagePart = {
      inlineData: {
        data: base64,
        mimeType,
      },
    };

    const result = await model.generateContent([prompt, imagePart]);
    const text = (result.response.text() || "").trim();

    const parsed = safeJsonParse(text);

    const name = parsed.name || "";
    const idCard = parsed.idCard || "";
    const address = parsed.address || "";

    return res.json({ name, idCard, address });
  } catch (err) {
    console.error("POST /api/ai/ocr-idcard error:", err);
    return res.status(500).json({
      message: "ไม่สามารถทำ OCR ได้",
      error: err?.message || String(err),
    });
  }
});

/* =========================================================
   2) PRICE SUGGEST (ของใหม่)
   POST /api/ai/price-suggest
   Body:
   {
     name: string,
     brand?: string,
     model?: string,
     spec?: string,
     condition?: string,
     accessories?: string,
     notes?: string,
     desiredMarginPct?: number
   }
========================================================= */
router.post("/price-suggest", async (req, res) => {
  try {
    const {
      name,
      brand,
      model,
      spec,
      condition,
      accessories,
      notes,
      desiredMarginPct,
    } = req.body || {};

    if (!name || typeof name !== "string") {
      return res.status(400).json({ message: "ต้องส่ง name (ชื่อสินค้า) มาด้วย" });
    }

    const margin = Number.isFinite(Number(desiredMarginPct)) ? Number(desiredMarginPct) : 10;

    // ----- ดึงตัวอย่างจาก DB เพื่อทำ Hybrid -----
    const similarItems = await findSimilarInventoryItemsByName(name);
    const stats = buildInternalPriceStats(similarItems);

    const refs = similarItems.slice(0, 8).map((x) => ({
      id: x.id,
      name: x.name,
      cost: num(x.cost),
      targetPrice: num(x.targetPrice),
      sellingPrice: num(x.sellingPrice),
      quantity: x.quantity,
      quantitySold: x.quantitySold,
      status: x.status,
      createdAt: x.createdAt,
    }));

    // ----- ถ้าไม่มี GEMINI_API_KEY ให้ fallback ทันที -----
    if (!process.env.GEMINI_API_KEY) {
      const fb = buildFallbackPriceFromInternal(stats, margin);
      return res.json({ ...fb, refs, stats });
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
- targetPrice ต้อง >= appraisedPrice และควรเผื่อกำไรตาม recommendedMarginPct
- ถ้าข้อมูลภายในไม่พอ ให้ confidence <= 40 และช่วง min/max กว้างขึ้น
- rationale เป็นภาษาไทย สั้น กระชับ และอ้างอิงข้อมูลภายในเมื่อทำได้
`;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

    // 1) พยายามใช้ gemini-2.5-flash ก่อน
    const modelFlash = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    let parsed;
    try {
      const result = await geminiGenerateWithRetry(modelFlash, prompt, {
        retries: 3,
        baseDelayMs: 600,
        maxDelayMs: 2600,
        retryOnStatuses: [429, 500, 502, 503, 504],
      });
      const text = (result.response.text() || "").trim();
      parsed = safeJsonParse(text);
    } catch (e1) {
      console.warn("[AI] flash failed, fallback model", e1?.status, e1?.message);

      // 2) fallback model (ถ้ามีสิทธิ์) — ใช้ 1.5-flash เป็นตัวสำรองที่เสถียรกว่า
      try {
        const modelFallback = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result2 = await geminiGenerateWithRetry(modelFallback, prompt, {
          retries: 2,
          baseDelayMs: 800,
          maxDelayMs: 3000,
          retryOnStatuses: [429, 500, 502, 503, 504],
        });
        const text2 = (result2.response.text() || "").trim();
        parsed = safeJsonParse(text2);
      } catch (e2) {
        console.warn("[AI] fallback model failed, use internal fallback", e2?.status, e2?.message);

        // 3) AI ล่มหมด → fallback จาก internal stats
        const fb = buildFallbackPriceFromInternal(stats, margin);
        return res.json({ ...fb, refs, stats, aiError: "MODEL_OVERLOADED" });
      }
    }

    // ----- normalize + enforce constraints -----
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

    if (stats.similarCount === 0) {
      confidence = Math.min(confidence, 40);
    }

    if (targetPrice < appraisedPrice) {
      targetPrice = appraisedPrice * (1 + margin / 100);
    }

    // ปัดเป็นบาท
    appraisedMin = Math.round(appraisedMin);
    appraisedMax = Math.round(appraisedMax);
    appraisedPrice = Math.round(appraisedPrice);
    targetPrice = Math.round(targetPrice);

    return res.json({
      appraisedMin,
      appraisedMax,
      appraisedPrice,
      targetPrice,
      confidence,
      rationale,
      refs,
      stats,
      fallback: false,
    });
  } catch (err) {
    console.error("POST /api/ai/price-suggest error:", err);
    return res.status(500).json({
      message: "ไม่สามารถประเมินราคาได้",
      error: err?.message || String(err),
    });
  }
});

export default router;
