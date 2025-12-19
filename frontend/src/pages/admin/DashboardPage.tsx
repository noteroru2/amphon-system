import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, getApiErrorMessage } from "../../lib/api"; // <-- ปรับ path ให้ตรงโปรเจกต์คุณ

type Overview = {
  activeContracts: number;
  stockValuationTarget: number;
  stockValuationCost: number;
  profitToday: number;
  serviceFeeThisMonth: number;
  range: { year: number; month: number };
};

type Cards = {
  promotion: {
    deadStock: Array<{
      id: number;
      code: string;
      name: string;
      ageDays: number;
      qty: number;
      cost: number;
      targetPrice: number;
      suggestedPrice: number;
      suggestedDiscountPct: number;
    }>;
    bundleDeal: {
      note: string;
      suggestions: Array<{ main: string; bundle: string }>;
    };
  };
  acquisition: {
    topWanted: Array<{ name: string; soldCount: number }>;
    overpricedWarning: { note: string };
  };
  seo: {
    bestChannel: { note: string };
    keywordTrends: { note: string };
  };
  growth: {
    repeatRate: number;
    newOpportunity: string[];
  };
};

function fmt(n: number) {
  return Number(n || 0).toLocaleString("th-TH") + " ฿";
}

function Pill({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  const cls =
    color === "purple"
      ? "bg-purple-100 text-purple-700"
      : color === "green"
      ? "bg-emerald-100 text-emerald-700"
      : color === "blue"
      ? "bg-blue-100 text-blue-700"
      : "bg-orange-100 text-orange-700";
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${cls}`}
    >
      {children}
    </span>
  );
}

function StatCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow">
      <div className="text-xs text-slate-500">{title}</div>
      <div className="mt-2 text-2xl font-bold text-slate-900">{value}</div>
      {sub ? <div className="mt-1 text-xs text-slate-500">{sub}</div> : null}
    </div>
  );
}

export default function AIBusinessAdvisorPage() {
  const [loading, setLoading] = useState(true);
  const [btnLoading, setBtnLoading] = useState(false);
  const [err, setErr] = useState("");

  const [overview, setOverview] = useState<Overview | null>(null);
  const [cards, setCards] = useState<Cards | null>(null);

  const [deadDays, setDeadDays] = useState(60);

  // กัน setState หลัง component unmount
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const fetchAll = async (source: "auto" | "manual" = "auto") => {
    try {
      setErr("");
      if (source === "manual") setBtnLoading(true);
      setLoading(true);

      // ✅ ใช้ api instance เท่านั้น (baseURL = VITE_API_BASE_URL)
      const [ovRes, cdRes] = await Promise.all([
        api.get("/api/ai/business/overview"),
        api.get("/api/ai/business/cards", { params: { deadDays } }),
      ]);

      if (!aliveRef.current) return;
      setOverview(ovRes.data);
      setCards(cdRes.data);
    } catch (e: any) {
      console.error(e);
      if (!aliveRef.current) return;
      setErr(getApiErrorMessage(e) || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      if (!aliveRef.current) return;
      setLoading(false);
      setBtnLoading(false);
    }
  };

  // auto refresh เมื่อเปลี่ยน deadDays
  useEffect(() => {
    fetchAll("auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadDays]);

  const deadStockCount = cards?.promotion?.deadStock?.length || 0;

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-8">
        {/* HERO */}
        <div className="rounded-2xl bg-slate-900 p-6 text-white shadow">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                AI BUSINESS ADVISOR
              </div>
              <div className="mt-3 text-2xl font-bold">
                ระบบวิเคราะห์ร้านค้าอัจฉริยะ
              </div>
              <div className="mt-1 text-sm text-white/70">
                ใช้ข้อมูลสัญญา คลังสินค้า และรายได้ เพื่อช่วยแนะนำกลยุทธ์โปรโมชัน
                การจัดสต๊อก และแผนเติบโตของร้านคุณ
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="rounded-xl bg-white/10 px-3 py-2 text-xs">
                Dead stock เกิน
                <select
                  value={deadDays}
                  onChange={(e) => setDeadDays(Number(e.target.value))}
                  className="ml-2 rounded bg-white/10 px-2 py-1 text-xs outline-none"
                >
                  <option value={30}>30 วัน</option>
                  <option value={60}>60 วัน</option>
                  <option value={90}>90 วัน</option>
                </select>
              </div>

              <button
                onClick={() => fetchAll("manual")}
                disabled={btnLoading}
                className={`rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:opacity-95 ${
                  btnLoading ? "opacity-70 cursor-not-allowed" : ""
                }`}
              >
                {btnLoading ? "กำลังวิเคราะห์..." : "เริ่มวิเคราะห์ข้อมูล"}
              </button>
            </div>
          </div>
        </div>

        {err ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {err}
          </div>
        ) : null}

        {/* OVERVIEW */}
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <StatCard
            title="💼 สัญญาคงค้าง (ACTIVE)"
            value={overview ? overview.activeContracts : loading ? "..." : "-"}
            sub="ติดตามความเสี่ยง/ใกล้ครบกำหนดในหน้าสัญญา"
          />
          <StatCard
            title="📦 มูลค่าสต๊อก (ราคาตั้งขาย)"
            value={
              overview ? fmt(overview.stockValuationTarget) : loading ? "..." : "-"
            }
            sub={overview ? `ต้นทุนรวม ~ ${fmt(overview.stockValuationCost)}` : ""}
          />
          <StatCard
            title="💰 กำไรวันนี้ (จาก Cashbook.profit)"
            value={overview ? fmt(overview.profitToday) : loading ? "..." : "-"}
            sub="ถ้ากำไรไม่ขึ้น ให้ตรวจการบันทึก profit ใน cashbook"
          />
          <StatCard
            title="🧾 รายได้ค่าบริการเดือนนี้"
            value={
              overview ? fmt(overview.serviceFeeThisMonth) : loading ? "..." : "-"
            }
            sub="รวมรายการที่ contractId != null และ profit > 0"
          />
        </div>

        {/* 4 CARDS */}
        <div className="mt-6 grid gap-4 md:grid-cols-4">
          {/* Promotion */}
          <div className="rounded-2xl bg-white p-5 shadow">
            <Pill color="purple">Promotion Strategy</Pill>
            <div className="mt-3 text-sm text-slate-600">
              แนะนำโปรโมชันสำหรับสินค้าที่ค้างสต๊อกนาน
            </div>

            <div className="mt-4 rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Dead Stock Alert</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">
                {loading ? "-" : deadStockCount}
              </div>
              <div className="text-xs text-slate-500">รายการเกิน {deadDays} วัน</div>
            </div>

            <div className="mt-4 space-y-2">
              {(cards?.promotion?.deadStock || []).slice(0, 3).map((x) => (
                <div key={x.id} className="rounded-xl border p-3">
                  <div className="text-sm font-semibold">{x.name}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    ค้าง {x.ageDays} วัน • คงเหลือ {x.qty} • ตั้งขาย {fmt(x.targetPrice)}
                  </div>
                  <div className="mt-2 text-xs">
                    Suggested Discount:{" "}
                    <span className="font-semibold">{x.suggestedDiscountPct}%</span>{" "}
                    → แนะนำขาย{" "}
                    <span className="font-semibold">{fmt(x.suggestedPrice)}</span>
                  </div>
                </div>
              ))}

              {!loading && !(cards?.promotion?.deadStock?.length) ? (
                <div className="text-xs text-slate-500">
                  ยังไม่พบ dead stock ในเงื่อนไขนี้
                </div>
              ) : null}
            </div>

            <div className="mt-3 text-xs text-slate-500">
              Bundle Deal: {cards?.promotion?.bundleDeal?.note || "—"}
            </div>
          </div>

          {/* Acquisition */}
          <div className="rounded-2xl bg-white p-5 shadow">
            <Pill color="green">Stock Acquisition</Pill>
            <div className="mt-3 text-sm text-slate-600">
              โฟกัสรุ่นที่รับมาแล้วขายออกไวที่สุด
            </div>

            <div className="mt-4 space-y-2">
              {(cards?.acquisition?.topWanted || []).map((x, idx) => (
                <div
                  key={x.name}
                  className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"
                >
                  <div className="text-sm">
                    <span className="mr-2 text-xs text-slate-500">#{idx + 1}</span>
                    {x.name}
                  </div>
                  <div className="text-xs font-semibold text-emerald-700">
                    ขายออก {x.soldCount} ครั้ง
                  </div>
                </div>
              ))}
              {!loading && !(cards?.acquisition?.topWanted?.length) ? (
                <div className="text-xs text-slate-500">
                  ยังไม่มีข้อมูลขายพอ (แนะนำให้บันทึกขายให้ครบ)
                </div>
              ) : null}
            </div>

            <div className="mt-3 text-xs text-slate-500">
              {cards?.acquisition?.overpricedWarning?.note || ""}
            </div>
          </div>

          {/* SEO */}
          <div className="rounded-2xl bg-white p-5 shadow">
            <Pill color="blue">SEO / Marketing</Pill>
            <div className="mt-3 text-sm text-slate-600">เชื่อมยอดขายกับช่องทางลูกค้า</div>

            <div className="mt-4 rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Best Channel</div>
              <div className="mt-2 text-xs text-slate-600">
                {cards?.seo?.bestChannel?.note || "—"}
              </div>
            </div>

            <div className="mt-3 rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Keyword Trends</div>
              <div className="mt-2 text-xs text-slate-600">
                {cards?.seo?.keywordTrends?.note || "—"}
              </div>
            </div>
          </div>

          {/* Growth */}
          <div className="rounded-2xl bg-white p-5 shadow">
            <Pill color="orange">Growth Plan</Pill>
            <div className="mt-3 text-sm text-slate-600">แผนขยายบริการจากพฤติกรรมลูกค้า</div>

            <div className="mt-4 rounded-xl bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Repeat Rate</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">
                {loading ? "-" : `${cards?.growth?.repeatRate ?? 0}%`}
              </div>
              <div className="text-xs text-slate-500">
                ลูกค้ากลับมาใช้บริการซ้ำ (proxy จากจำนวนสัญญา)
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {(cards?.growth?.newOpportunity || []).slice(0, 3).map((x, i) => (
                <div key={i} className="rounded-xl border p-3 text-sm">
                  {x}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* AI Chat Assistant (MVP placeholder) */}
        <div className="mt-6 rounded-2xl bg-white p-6 shadow">
          <div className="text-lg font-semibold text-slate-900">
            💬 AI Chat Assistant (Phase ถัดไป)
          </div>
          <div className="mt-1 text-sm text-slate-600">
            ปุ่ม “เริ่มวิเคราะห์ข้อมูล” ตอนนี้ดึง insight จากฐานข้อมูลจริงแล้ว — ถ้าต้องการให้ถามภาษาคนกับข้อมูลร้าน
            (เช่น “เดือนนี้กำไรจาก iPhone เท่าไหร่?”) ผมจะทำ endpoint แชทที่เรียก Gemini + query DB แบบปลอดภัยให้เป็น
            Phase ต่อไป
          </div>
        </div>
      </div>
    </div>
  );
}
