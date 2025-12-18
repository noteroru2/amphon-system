import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";


type ConditionKey = "90_95" | "80_89" | "70_79" | "UNKNOWN";
type AccessoriesKey = "FULL_BOX" | "BODY_ONLY" | "WITH_CHARGER" | "UNKNOWN";

type AiQuick = {
  targetPrice: number;
  appraisedMin: number;
  appraisedMax: number;
  confidence: number;
  stats?: { similarCount: number; basedOn: string };
};

function cls(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function money(n: number) {
  return Number(n || 0).toLocaleString("th-TH") + " ฿";
}

function roundTo100(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n / 100) * 100;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function getPolicy(condition: ConditionKey, accessories: AccessoriesKey) {
  const conditionFactor =
    condition === "90_95" ? 1.0 : condition === "80_89" ? 0.92 : condition === "70_79" ? 0.82 : 0.88;

  const accessoriesFactor =
    accessories === "FULL_BOX" ? 1.0 : accessories === "WITH_CHARGER" ? 0.96 : accessories === "BODY_ONLY" ? 0.9 : 0.95;

  const buyRatio = clamp(0.55 * conditionFactor * accessoriesFactor, 0.45, 0.7);
  const pawnRatio = clamp(0.75 * conditionFactor, 0.6, 0.85);

  return { buyRatio, pawnRatio };
}

type QuickCardProps = {
  title: string;
  subtitle: string;
  to: string;
  icon?: React.ReactNode;
  badge?: string;
  tone?: "dark" | "blue" | "green" | "orange" | "violet";
};

function ToneIconWrap({ tone, children }: { tone: QuickCardProps["tone"]; children: React.ReactNode }) {
  const toneCls =
    tone === "dark"
      ? "bg-slate-900/10 text-slate-900"
      : tone === "blue"
      ? "bg-blue-600/10 text-blue-700"
      : tone === "green"
      ? "bg-emerald-600/10 text-emerald-700"
      : tone === "orange"
      ? "bg-orange-600/10 text-orange-700"
      : "bg-violet-600/10 text-violet-700";

  return (
    <div className={cls("flex h-12 w-12 items-center justify-center rounded-2xl", toneCls)}>
      <div className="text-xl leading-none">{children}</div>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm">
      {children}
    </span>
  );
}

function QuickCard({ title, subtitle, to, icon, badge, tone = "dark" }: QuickCardProps) {
  const borderTone =
    tone === "dark"
      ? "from-slate-900/10"
      : tone === "blue"
      ? "from-blue-600/15"
      : tone === "green"
      ? "from-emerald-600/15"
      : tone === "orange"
      ? "from-orange-600/15"
      : "from-violet-600/15";

  return (
    <Link
      to={to}
      className={cls(
        "group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition",
        "hover:-translate-y-0.5 hover:shadow-lg hover:border-slate-300"
      )}
    >
      <div
        className={cls(
          "pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-gradient-to-br to-transparent opacity-0 blur-2xl transition",
          borderTone,
          "group-hover:opacity-100"
        )}
      />
      <div className="relative flex items-start gap-4">
        <ToneIconWrap tone={tone}>{icon ?? "➜"}</ToneIconWrap>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-slate-500">{subtitle}</div>
            {badge ? <Badge>{badge}</Badge> : null}
          </div>

          <div className="mt-1 truncate text-lg font-semibold text-slate-900">{title}</div>

          <div className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            เปิดเมนู <span className="transition group-hover:translate-x-1">→</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function PillLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 hover:border-slate-300"
    >
      {children}
    </Link>
  );
}

export default function EmployeeHomePage() {
  const navigate = useNavigate();

  // ✅ Quick AI price check on home
  const [qName, setQName] = useState("");
  const [qCondition, setQCondition] = useState<ConditionKey>("90_95");
  const [qAcc, setQAcc] = useState<AccessoriesKey>("FULL_BOX");
  const [qLoading, setQLoading] = useState(false);
  const [qErr, setQErr] = useState("");
  const [qAi, setQAi] = useState<AiQuick | null>(null);

  const policy = useMemo(() => getPolicy(qCondition, qAcc), [qCondition, qAcc]);

  const quickComputed = useMemo(() => {
    const sell = roundTo100(qAi?.targetPrice || qAi?.appraisedMax || 0);
    const buy = roundTo100(sell * policy.buyRatio);
    const pawn = roundTo100(buy * policy.pawnRatio);
    return { sell, buy, pawn };
  }, [qAi, policy.buyRatio, policy.pawnRatio]);

  const runQuickAi = async () => {
    try {
      setQErr("");
      setQAi(null);
      if (!qName.trim()) return;

      setQLoading(true);

      const res = await api.post(
        "/api/ai/price-suggest",
        {
          name: qName.trim(),
          condition:
            qCondition === "90_95"
              ? "สภาพ 90-95%"
              : qCondition === "80_89"
              ? "สภาพ 80-89%"
              : qCondition === "70_79"
              ? "สภาพ 70-79%"
              : "ไม่ระบุ",
          accessories:
            qAcc === "FULL_BOX"
              ? "ครบกล่อง"
              : qAcc === "WITH_CHARGER"
              ? "มีสายชาร์จ"
              : qAcc === "BODY_ONLY"
              ? "ตัวเครื่องอย่างเดียว"
              : "ไม่ระบุ",
          desiredMarginPct: 10,
          policy: { buyRatio: policy.buyRatio, pawnRatio: policy.pawnRatio },
        },
        { headers: { "Content-Type": "application/json" } }
      );

      const d = res.data?.data ?? res.data;
      if (d?.ok === false) throw new Error(d?.message || "AI not ok");
      const x = d?.data ?? d;

      setQAi({
        targetPrice: Number(x?.targetPrice ?? 0),
        appraisedMin: Number(x?.appraisedMin ?? 0),
        appraisedMax: Number(x?.appraisedMax ?? 0),
        confidence: Number(x?.confidence ?? 0),
        stats: x?.stats
          ? { similarCount: Number(x.stats.similarCount ?? 0), basedOn: String(x.stats.basedOn ?? "") }
          : undefined,
      });
    } catch (e: any) {
      console.error(e);
      setQErr(e?.response?.data?.message || e?.message || "วิเคราะห์ราคาไม่สำเร็จ");
    } finally {
      setQLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Hero */}
      <div className="bg-slate-900 text-white">
        <div className="mx-auto max-w-6xl px-6 py-6 flex justify-between">
          <div>
            <h1 className="text-2xl font-semibold">หน้าแรกพนักงาน</h1>
            <p className="text-sm text-white/70">ทางลัดงานหลัก</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => navigate("/app/deposit/new")} className="rounded-xl bg-white px-4 py-2 text-slate-900 font-semibold">
              + รับฝากใหม่
            </button>
            <button onClick={() => navigate("/app/consignments/new")} className="rounded-xl border border-white/30 px-4 py-2 font-semibold">
              + ฝากขายใหม่
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-7">
        <div className="grid gap-4 md:grid-cols-3">
          <QuickCard subtitle="งานฝากดูแล" title="รายการรับฝาก" to="/app/deposit/list" icon="🧾" tone="blue" />
          <QuickCard subtitle="งานฝากขาย" title="รายการฝากขาย" to="/app/consignments" icon="🏷️" tone="violet" />
          <QuickCard subtitle="สต๊อก" title="คลังสินค้า" to="/app/inventory" icon="📦" tone="green" />
        </div>

        <div className="mt-6 flex gap-2 flex-wrap">
          <PillLink to="/app/price-check">ประเมินราคา (เต็มหน้า)</PillLink>
          <PillLink to="/app/intake/new">รับสินค้าเข้าร้าน</PillLink>
          <PillLink to="/app/inventory/bulk-sell">ขายหลายรายการ</PillLink>
        </div>

        {/* ✅ Quick AI box */}
        <div className="mt-6 rounded-3xl bg-white p-5 shadow-sm border border-slate-200">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-semibold text-slate-900">ประเมินราคาด่วน (AI + อ้างอิงในระบบ)</div>
              <div className="text-xs text-slate-500">พิมพ์รุ่น → กดวิเคราะห์ → ได้ราคา SELL/BUY/PAWN ทันที</div>
            </div>
            <button
              onClick={() => navigate("/app/price-check")}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              เปิดหน้าเต็ม →
            </button>
          </div>

          {qErr ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{qErr}</div>
          ) : null}

          <div className="mt-4 grid gap-3 md:grid-cols-12">
            <div className="md:col-span-6">
              <div className="text-xs font-semibold text-slate-700">ชื่อสินค้า / รุ่น</div>
              <input
                value={qName}
                onChange={(e) => setQName(e.target.value)}
                placeholder="เช่น iPhone 13 Pro Max 256GB"
                className="mt-1 w-full rounded-2xl border px-4 py-3 text-sm"
              />
            </div>

            <div className="md:col-span-3">
              <div className="text-xs font-semibold text-slate-700">สภาพ</div>
              <select
                value={qCondition}
                onChange={(e) => setQCondition(e.target.value as ConditionKey)}
                className="mt-1 w-full rounded-2xl border bg-white px-4 py-3 text-sm"
              >
                <option value="90_95">90-95%</option>
                <option value="80_89">80-89%</option>
                <option value="70_79">70-79%</option>
                <option value="UNKNOWN">ไม่ระบุ</option>
              </select>
            </div>

            <div className="md:col-span-3">
              <div className="text-xs font-semibold text-slate-700">อุปกรณ์</div>
              <select
                value={qAcc}
                onChange={(e) => setQAcc(e.target.value as AccessoriesKey)}
                className="mt-1 w-full rounded-2xl border bg-white px-4 py-3 text-sm"
              >
                <option value="FULL_BOX">ครบกล่อง</option>
                <option value="WITH_CHARGER">มีสายชาร์จ</option>
                <option value="BODY_ONLY">ตัวเครื่อง</option>
                <option value="UNKNOWN">ไม่ระบุ</option>
              </select>
            </div>

            <div className="md:col-span-12 flex items-center justify-between flex-wrap gap-2">
              <button
                onClick={runQuickAi}
                disabled={qLoading || !qName.trim()}
                className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {qLoading ? "กำลังวิเคราะห์..." : "🔎 วิเคราะห์ราคา"}
              </button>

              {qAi?.stats?.similarCount ? (
                <div className="text-xs text-slate-500">
                  อ้างอิงในระบบ: {qAi.stats.similarCount} รายการ ({qAi.stats.basedOn})
                  {qAi.confidence ? ` · มั่นใจ ${qAi.confidence}%` : ""}
                </div>
              ) : (
                <div className="text-xs text-slate-500">
                  {qAi ? `มั่นใจ ${qAi.confidence || 0}%` : "—"}
                </div>
              )}
            </div>

            {/* results */}
            <div className="md:col-span-12 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border bg-slate-50 p-4">
                <div className="text-xs font-semibold text-slate-600">SELL</div>
                <div className="mt-1 text-2xl font-extrabold text-slate-900">{money(quickComputed.sell)}</div>
              </div>
              <div className="rounded-2xl border bg-emerald-50 p-4">
                <div className="text-xs font-semibold text-emerald-700">BUY OUT</div>
                <div className="mt-1 text-2xl font-extrabold text-emerald-700">{money(quickComputed.buy)}</div>
              </div>
              <div className="rounded-2xl border bg-amber-50 p-4">
                <div className="text-xs font-semibold text-amber-700">PAWN</div>
                <div className="mt-1 text-2xl font-extrabold text-amber-700">{money(quickComputed.pawn)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
