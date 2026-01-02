// backend/src/services/priceCheck.service.js
import { prisma } from "../db.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

/* -------------------- utils -------------------- */
function num(v, fallback = 0) {
  if (v == null) return fallback;
  if (typeof v === "object" && typeof v.toNumber === "function") return v.toNumber();
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function medianInt(nums = []) {
  const a = nums.filter((n) => Number.isFinite(n)).sort((x, y) => x - y);
  if (!a.length) return 0;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : Math.round((a[mid - 1] + a[mid]) / 2);
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
    baseDelayMs = 600,
    maxDelayMs = 2600,
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

/* -------------------- DB search -------------------- */
function tokenize(q = "", max = 10) {
  return String(q)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, max);
}

async function findSimilarPriceHistory(name, limit = 30) {
  const tokens = tokenize(name, 12);
  const OR = tokens.map((t) => ({ itemName: { contains: t, mode: "insensitive" } }));

  const rows = await prisma.priceHistory.findMany({
    where: OR.length ? { OR } : undefined,
    orderBy: { buyDate: "desc" },
    take: Math.min(Number(limit || 30), 100),
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

  const sellPrices = rows.map((r) => (r.sellPrice == null ? null : Number(r.sellPrice))).filter((x) => x != null);
  const buyPrices = rows.map((r) => (r.buyPrice == null ? null : Number(r.buyPrice))).filter((x) => x != null);

  const basedOn = sellPrices.length >= 5 ? "sellingPrice" : buyPrices.length ? "cost" : "none";
  const med = basedOn === "sellingPrice" ? medianInt(sellPrices) : basedOn === "cost" ? medianInt(buyPrices) : 0;

  const floor = med ? Math.round(med * 0.85) : null;
  const ceil = med ? Math.round(med * 1.15) : null;

  return {
    refsRaw: rows,
    refsForUI: rows.slice(0, 10).map((r) => ({
      id: r.id,
      name: r.itemName,
      cost: num(r.buyPrice),
      targetPrice: 0,
      sellingPrice: num(r.sellPrice),
      status: r.sellPrice != null ? "SOLD" : "PRICE_HISTORY",
      createdAt: r.buyDate,
    })),
    stats: {
      similarCount: rows.length,
      basedOn,
      medianPrice: med,
      costMedian: medianInt(buyPrices),
      floor,
      ceil,
    },
  };
}

async function findSimilarInventory(name, limit = 30) {
  const tokens = tokenize(name, 6);
  const where =
    tokens.length > 0
      ? { OR: tokens.map((t) => ({ name: { contains: t, mode: "insensitive" } })) }
      : { name: { contains: String(name).slice(0, 40), mode: "insensitive" } };

  const rows = await prisma.inventoryItem.findMany({
    where,
    take: Math.min(Number(limit || 30), 100),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      cost: true,
      targetPrice: true,
      sellingPrice: true,
      status: true,
      createdAt: true,
    },
  });

  const solds = rows.map((x) => num(x.sellingPrice)).filter((x) => x > 0);
  const targets = rows.map((x) => num(x.targetPrice)).filter((x) => x > 0);
  const costs = rows.map((x) => num(x.cost)).filter((x) => x > 0);

  const base = solds.length ? solds : targets;
  const med = base.length ? medianInt(base) : 0;
  const costMed = costs.length ? medianInt(costs) : 0;

  let floor = med ? Math.round(med * 0.9) : null;
  let ceil = med ? Math.round(med * 1.1) : null;
  if (costMed > 0 && floor != null) floor = Math.max(floor, Math.round(costMed * 1.05));

  return {
    refsForUI: rows.slice(0, 10).map((x) => ({
      id: x.id,
      name: x.name,
      cost: num(x.cost),
      targetPrice: num(x.targetPrice),
      sellingPrice: num(x.sellingPrice),
      status: x.status,
      createdAt: x.createdAt,
    })),
    stats: {
      similarCount: rows.length,
      basedOn: solds.length ? "sellingPrice" : targets.length ? "targetPrice" : "none",
      medianPrice: med,
      costMedian: costMed,
      floor,
      ceil,
    },
  };
}

/* -------------------- fallback -------------------- */
function fallbackFromStats(stats, marginPct, reason) {
  const med = Number(stats?.medianPrice || 0);

  if (med <= 0) {
    return {
      appraisedMin: 0,
      appraisedMax: 0,
      appraisedPrice: 0,
      targetPrice: 0,
      confidence: 10,
      rationale: reason || "ไม่มีข้อมูลเพียงพอ จึงยังประเมินราคาไม่ได้",
      fallback: true,
    };
  }

  const floor = stats?.floor != null ? Number(stats.floor) : Math.round(med * 0.9);
  const ceil = stats?.ceil != null ? Number(stats.ceil) : Math.round(med * 1.1);

  const appraisedPrice = Math.round(med);
  const appraisedMin = Math.round(floor);
  const appraisedMax = Math.round(ceil);
  const targetPrice = Math.round(appraisedPrice * (1 + (Number(marginPct || 10) / 100)));

  return {
    appraisedMin,
    appraisedMax,
    appraisedPrice,
    targetPrice,
    confidence: 40,
    rationale: reason || "AI ไม่พร้อมใช้งาน → ใช้ฐานข้อมูลร้านเป็นหลัก",
    fallback: true,
  };
}

/* -------------------- main service -------------------- */
export async function priceCheck(payload) {
  const {
    name,
    condition,
    accessories,
    notes,
    desiredMarginPct,
    limit = 30,
  } = payload || {};

  if (!name || typeof name !== "string") {
    const err = new Error("ต้องส่ง name (ชื่อสินค้า) มาด้วย");
    err.statusCode = 400;
    throw err;
  }

  const margin = Number.isFinite(Number(desiredMarginPct)) ? Number(desiredMarginPct) : 10;

  // 1) ดึง DB พร้อมกัน
  const [ph, inv] = await Promise.all([
    findSimilarPriceHistory(name, limit),
    findSimilarInventory(name, limit),
  ]);

  // 2) เลือกแหล่งหลัก: PriceHistory ก่อน (ซื้อขายจริง)
  const usePH = Number(ph?.stats?.medianPrice || 0) > 0;
  const primaryStats = usePH ? ph.stats : inv.stats;
  const primaryRefs = usePH && ph.refsForUI.length ? ph.refsForUI : inv.refsForUI;

  // 3) ถ้าไม่มี key => fallback
  if (!process.env.GEMINI_API_KEY) {
    const fb = fallbackFromStats(primaryStats, margin, "AI ยังไม่พร้อม (ไม่มี GEMINI_API_KEY) → ใช้ฐานข้อมูลร้านเป็นหลัก");
    return {
      ...fb,
      refs: primaryRefs,
      stats: primaryStats,
    };
  }

  // 4) ทำ prompt ให้ AI ยึด DB เป็นหลัก
  const ctx = {
    item: { name, condition, accessories, notes },
    db: {
      primarySource: usePH ? "priceHistory" : "inventory",
      primaryStats,
      priceHistoryStats: ph.stats,
      inventoryStats: inv.stats,
      examples: {
        priceHistory: ph.refsRaw?.slice(0, 8) || [],
        inventory: inv.refsForUI?.slice(0, 8) || [],
      },
    },
    rules: {
      currency: "THB",
      marginPct: margin,
      constraint: "If primaryStats.floor/ceil exist, appraisedPrice must be within them",
      priority: "Prefer priceHistory median if exists; otherwise inventory median",
      output: "JSON only",
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
- ถ้ามี primaryStats.floor/ceil ให้ appraisedPrice อยู่ในช่วงนั้น
- ถ้ามีค่ากลางจากฐานข้อมูล (medianPrice) ให้ยึดเป็นฐานหลัก
- targetPrice ต้อง >= appraisedPrice และเผื่อกำไรตาม marginPct
- ถ้าข้อมูลน้อย ให้ confidence <= 40 และช่วง min/max กว้างขึ้น
- rationale เป็นภาษาไทย สั้น กระชับ และระบุว่าใช้ PriceHistory หรือ Inventory เป็นหลัก
`.trim();

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  let parsed;
  try {
    const result = await geminiGenerateWithRetry(model, prompt, {
      retries: 3,
      baseDelayMs: 600,
      maxDelayMs: 2600,
      retryOnStatuses: [429, 500, 502, 503, 504],
    });
    parsed = safeJsonParse((result.response.text() || "").trim());
  } catch (e) {
    // AI ล่ม => fallback DB
    const fb = fallbackFromStats(primaryStats, margin, "AI โหลดสูง/ล่ม → ใช้ฐานข้อมูลร้านเป็นหลัก");
    return {
      ...fb,
      refs: primaryRefs,
      stats: primaryStats,
      aiError: "MODEL_OVERLOADED",
    };
  }

  // 5) normalize + clamp ตาม floor/ceil
  let appraisedMin = num(parsed.appraisedMin);
  let appraisedMax = num(parsed.appraisedMax);
  let appraisedPrice = num(parsed.appraisedPrice);
  let targetPrice = num(parsed.targetPrice);
  let confidence = clamp(Math.round(num(parsed.confidence)), 0, 100);
  let rationale = String(parsed.rationale || "").slice(0, 800);

  const floor = primaryStats?.floor != null ? Number(primaryStats.floor) : null;
  const ceil = primaryStats?.ceil != null ? Number(primaryStats.ceil) : null;

  if (floor != null && ceil != null && floor > 0 && ceil > 0) {
    appraisedPrice = clamp(appraisedPrice, floor, ceil);
    if (appraisedMin < floor) appraisedMin = floor;
    if (appraisedMax > ceil) appraisedMax = ceil;
    if (appraisedMax < appraisedMin) appraisedMax = appraisedMin;
  }

  if (targetPrice < appraisedPrice) targetPrice = appraisedPrice * (1 + margin / 100);

  return {
    appraisedMin: Math.round(appraisedMin),
    appraisedMax: Math.round(appraisedMax),
    appraisedPrice: Math.round(appraisedPrice),
    targetPrice: Math.round(targetPrice),
    confidence,
    rationale,
    refs: primaryRefs,
    stats: primaryStats,
    fallback: false,
  };
}
