import React, { useMemo, useState } from "react";
import { api } from "../lib/api";

type AiPriceResult = {
  appraisedMin: number;
  appraisedMax: number;
  appraisedPrice: number;
  targetPrice: number;
  confidence: number;
  rationale: string;
  refs?: Array<{
    id: number;
    name: string;
    cost?: number;
    targetPrice?: number;
    sellingPrice?: number;
    status?: string;
    createdAt?: string;
  }>;
  stats?: {
    similarCount: number;
    basedOn: string;
    medianPrice: number;
    costMedian: number;
    floor: number | null;
    ceil: number | null;
  };
};

type ConditionKey = "90_95" | "80_89" | "70_79" | "UNKNOWN";
type AccessoriesKey = "FULL_BOX" | "BODY_ONLY" | "WITH_CHARGER" | "UNKNOWN";

const fmtMoney = (n: number) => Number(n || 0).toLocaleString("th-TH") + " ฿";

function roundTo100(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n / 100) * 100;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Policy ของร้าน (ปรับได้)
 */
function getPolicy(condition: ConditionKey, accessories: AccessoriesKey) {
  const conditionFactor =
    condition === "90_95"
      ? 1.0
      : condition === "80_89"
      ? 0.92
      : condition === "70_79"
      ? 0.82
      : 0.88;

  const accessoriesFactor =
    accessories === "FULL_BOX"
      ? 1.0
      : accessories === "WITH_CHARGER"
      ? 0.96
      : accessories === "BODY_ONLY"
      ? 0.9
      : 0.95;

  const buyRatioBase = 0.55;
  const buyRatio = clamp(buyRatioBase * conditionFactor * accessoriesFactor, 0.45, 0.7);

  const pawnRatioBase = 0.75;
  const pawnRatio = clamp(pawnRatioBase * conditionFactor, 0.6, 0.85);

  const pawnFee15Days = 400;
  const docAndStorage = 300;
  const careFee = 100;

  return { buyRatio, pawnRatio, pawnFee15Days, docAndStorage, careFee };
}

function normalizeAiResponse(raw: any): AiPriceResult {
  // รองรับ backend ส่ง { ok, data } หรือส่ง object ตรง ๆ
  const d = raw?.data ?? raw;
  if (d?.ok === false) {
    throw new Error(d?.message || "AI response not ok");
  }
  const x = d?.data ?? d;

  return {
    appraisedMin: Number(x?.appraisedMin ?? 0),
    appraisedMax: Number(x?.appraisedMax ?? 0),
    appraisedPrice: Number(x?.appraisedPrice ?? 0),
    targetPrice: Number(x?.targetPrice ?? 0),
    confidence: Number(x?.confidence ?? 0),
    rationale: String(x?.rationale ?? ""),
    refs: Array.isArray(x?.refs) ? x.refs : [],
    stats: x?.stats
      ? {
          similarCount: Number(x.stats.similarCount ?? 0),
          basedOn: String(x.stats.basedOn ?? ""),
          medianPrice: Number(x.stats.medianPrice ?? 0),
          costMedian: Number(x.stats.costMedian ?? 0),
          floor: x.stats.floor == null ? null : Number(x.stats.floor),
          ceil: x.stats.ceil == null ? null : Number(x.stats.ceil),
        }
      : undefined,
  };
}

export default function PriceAssessmentPage() {
  const [modelText, setModelText] = useState("โน๊ตบุค asus tuf i5-10300h gtx1650");
  const [condition, setCondition] = useState<ConditionKey>("90_95");
  const [accessories, setAccessories] = useState<AccessoriesKey>("FULL_BOX");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [ai, setAi] = useState<AiPriceResult | null>(null);

  const policy = useMemo(() => getPolicy(condition, accessories), [condition, accessories]);

  const computed = useMemo(() => {
    if (!ai) {
      return {
        pawn: 0,
        buy: 0,
        sell: 0,
        marketRange: "-",
        refText: "-",
        analysis: "",
        confidence: 0,
      };
    }

    const sell = roundTo100(ai.targetPrice || ai.appraisedMax || ai.appraisedPrice || 0);
    const buy = roundTo100(sell * policy.buyRatio);
    const pawn = roundTo100(buy * policy.pawnRatio);

    const marketMin = ai.appraisedMin || 0;
    const marketMax = ai.appraisedMax || 0;
    const marketRange =
      marketMin > 0 && marketMax > 0
        ? `${Number(marketMin).toLocaleString("th-TH")} - ${Number(marketMax).toLocaleString("th-TH")}`
        : "-";

    let refText = "ยังไม่มีข้อมูลอ้างอิงในระบบ";
    if (ai.stats?.similarCount && ai.stats.similarCount > 0) {
      const basedOn =
        ai.stats.basedOn === "sellingPrice"
          ? "ราคาขายจริง"
          : ai.stats.basedOn === "targetPrice"
          ? "ราคาตั้งขาย"
          : "ข้อมูลภายใน";
      refText = `อ้างอิงจากของคล้ายในระบบ ${ai.stats.similarCount} รายการ (${basedOn})`;
    }

    return {
      pawn,
      buy,
      sell,
      marketRange,
      refText,
      analysis: ai.rationale || "",
      confidence: ai.confidence || 0,
    };
  }, [ai, policy.buyRatio, policy.pawnRatio]);

  const onAnalyze = async () => {
    try {
      setErr("");
      setLoading(true);
      setAi(null);

      const payload = {
        name: modelText,
        condition:
          condition === "90_95"
            ? "สภาพ 90-95%"
            : condition === "80_89"
            ? "สภาพ 80-89%"
            : condition === "70_79"
            ? "สภาพ 70-79%"
            : "ไม่ระบุ",
        accessories:
          accessories === "FULL_BOX"
            ? "ครบกล่อง"
            : accessories === "WITH_CHARGER"
            ? "มีสายชาร์จ"
            : accessories === "BODY_ONLY"
            ? "ตัวเครื่องอย่างเดียว"
            : "ไม่ระบุ",
        notes: "",
        desiredMarginPct: 10,
        // ✅ ช่วยให้ backend ใช้เป็น policy ได้ถ้าคุณอยากรองรับในอนาคต
        policy: {
          buyRatio: policy.buyRatio,
          pawnRatio: policy.pawnRatio,
        },
      };

      // ✅ ยิงผ่าน api ของเรา (ชี้ไป backend Render/VPS)
      const res = await api.post("/api/ai/price-suggest", payload, {
        headers: { "Content-Type": "application/json" },
      });

      const normalized = normalizeAiResponse(res.data);
      setAi(normalized);
    } catch (e: any) {
      console.error(e);
      setErr(e?.response?.data?.message || e?.message || "วิเคราะห์ราคาไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-4">
          <div className="text-3xl font-bold text-slate-900">ประเมินราคาสินค้า (AI Price Check)</div>
          <div className="mt-1 text-sm text-slate-500">
            วิเคราะห์จาก AI + อ้างอิงข้อมูลในระบบจริง (ถ้ามี refs)
          </div>
        </div>

        {err ? (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {err}
          </div>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-12">
          {/* LEFT */}
          <div className="lg:col-span-4">
            <div className="rounded-2xl bg-white p-6 shadow">
              <div className="text-sm font-semibold text-slate-800">ชื่อสินค้า / รุ่น (Model)</div>
              <input
                value={modelText}
                onChange={(e) => setModelText(e.target.value)}
                className="mt-2 w-full rounded-xl border px-4 py-3 text-sm outline-none focus:ring"
                placeholder="เช่น iPhone 13 Pro Max 256GB"
              />

              <div className="mt-5 text-sm font-semibold text-slate-800">สภาพสินค้า</div>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as ConditionKey)}
                className="mt-2 w-full rounded-xl border bg-white px-4 py-3 text-sm outline-none focus:ring"
              >
                <option value="90_95">สภาพ 90-95% (นางฟ้า)</option>
                <option value="80_89">สภาพ 80-89% (มีรอยบ้าง)</option>
                <option value="70_79">สภาพ 70-79% (รอยเยอะ)</option>
                <option value="UNKNOWN">ไม่ระบุ</option>
              </select>

              <div className="mt-5 text-sm font-semibold text-slate-800">อุปกรณ์</div>
              <select
                value={accessories}
                onChange={(e) => setAccessories(e.target.value as AccessoriesKey)}
                className="mt-2 w-full rounded-xl border bg-white px-4 py-3 text-sm outline-none focus:ring"
              >
                <option value="FULL_BOX">ครบกล่อง (Full Box)</option>
                <option value="WITH_CHARGER">มีสายชาร์จ</option>
                <option value="BODY_ONLY">ตัวเครื่องอย่างเดียว</option>
                <option value="UNKNOWN">ไม่ระบุ</option>
              </select>

              <button
                onClick={onAnalyze}
                disabled={loading || !modelText.trim()}
                className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 text-white shadow hover:opacity-95 disabled:opacity-60"
              >
                {loading ? "กำลังวิเคราะห์..." : "🔎 วิเคราะห์ราคา (Analyze)"}
              </button>
            </div>

            <div className="mt-4 rounded-2xl bg-white p-5 text-xs text-slate-500 shadow">
              หมายเหตุ: ราคาเป็นการประเมินจาก AI + อ้างอิงข้อมูลในระบบ (refs) ถ้ามี
            </div>
          </div>

          {/* RIGHT */}
          <div className="lg:col-span-8">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow">
                <div className="text-sm font-semibold text-amber-700">แนะนำรับฝาก (PAWN)</div>
                <div className="mt-2 text-4xl font-extrabold text-amber-700">{fmtMoney(computed.pawn)}</div>
                <div className="mt-1 text-xs text-amber-700/80">ระบบคำนวณจาก policy + ราคา AI</div>
                <div className="my-3 h-px bg-amber-200" />
                <div className="text-sm font-semibold text-amber-800">
                  ค่าบริการ (15 วัน): {policy.pawnFee15Days.toLocaleString("th-TH")} บาท
                </div>
                <div className="mt-2 grid grid-cols-2 gap-y-1 text-xs text-amber-800/80">
                  <div>ค่าเอกสาร+เก็บรักษา:</div>
                  <div className="text-right">{policy.docAndStorage.toLocaleString("th-TH")}.-</div>
                  <div>ค่าดูแล:</div>
                  <div className="text-right">{policy.careFee.toLocaleString("th-TH")}.-</div>
                </div>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow">
                <div className="text-sm font-semibold text-emerald-700">แนะนำรับซื้อ (BUY OUT)</div>
                <div className="mt-2 text-4xl font-extrabold text-emerald-700">{fmtMoney(computed.buy)}</div>
                <div className="mt-1 text-xs text-emerald-700/80">สำหรับซื้อขาด</div>
              </div>

              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow">
                <div className="text-sm font-semibold text-blue-700">ราคาขายหน้าร้าน (SELL)</div>
                <div className="mt-2 text-4xl font-extrabold text-blue-700">{fmtMoney(computed.sell)}</div>
                <div className="mt-1 text-xs text-blue-700/80">ราคาเป้าหมาย</div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-white p-6 shadow">
              <div className="text-lg font-semibold text-slate-900">บทวิเคราะห์และราคาตลาด</div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="rounded-xl bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">Reference (ในระบบเรา)</div>
                  <div className="mt-1 text-sm font-semibold text-slate-800">{computed.refText}</div>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">Market Range</div>
                  <div className="mt-1 text-sm font-semibold text-slate-800">{computed.marketRange}</div>
                  {ai ? <div className="mt-1 text-xs text-slate-500">ความมั่นใจ AI: {computed.confidence}%</div> : null}
                </div>
              </div>

              <div className="mt-4 text-sm font-semibold text-slate-900">เหตุผลประกอบการประเมิน</div>
              <div className="mt-2 rounded-xl border bg-white p-4 text-sm leading-6 text-slate-700">
                {ai ? computed.analysis : <span className="text-slate-500">กด “วิเคราะห์ราคา” เพื่อเริ่ม</span>}
              </div>

              {ai?.refs?.length ? (
                <div className="mt-4">
                  <div className="text-sm font-semibold text-slate-900">ของคล้ายในระบบ (Refs)</div>
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-left text-xs text-slate-500">
                        <tr>
                          <th className="px-3 py-2">ชื่อ</th>
                          <th className="px-3 py-2">ทุน</th>
                          <th className="px-3 py-2">ตั้งขาย</th>
                          <th className="px-3 py-2">ขายจริง</th>
                          <th className="px-3 py-2">สถานะ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ai.refs.slice(0, 6).map((r) => (
                          <tr key={r.id} className="border-t">
                            <td className="px-3 py-2">{r.name}</td>
                            <td className="px-3 py-2">{fmtMoney(Number(r.cost || 0))}</td>
                            <td className="px-3 py-2">{fmtMoney(Number(r.targetPrice || 0))}</td>
                            <td className="px-3 py-2">{fmtMoney(Number(r.sellingPrice || 0))}</td>
                            <td className="px-3 py-2">{r.status || "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-2 text-xs text-slate-500">
                    *ถ้า refs ไม่ขึ้น แปลว่า backend ยังไม่ได้ส่ง refs/stats กลับมา (เดี๋ยวเราปรับฝั่ง backend ต่อได้)
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
