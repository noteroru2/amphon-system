import React, { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

type QuickCardProps = {
  title: string;
  subtitle: string;
  to: string;
  icon?: React.ReactNode;
  badge?: string;
  tone?: "dark" | "blue" | "green" | "orange" | "violet";
};

function cls(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

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

  const [check, setCheck] = useState({
    priceCheck: false,
    newDeposit: false,
    intake: false,
    stockReview: false,
  });

  const progress = useMemo(() => {
    const vals = Object.values(check);
    const done = vals.filter(Boolean).length;
    return { done, total: vals.length, pct: Math.round((done / vals.length) * 100) };
  }, [check]);

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
            <button
              onClick={() => navigate("/app/deposit/new")}
              className="rounded-xl bg-white px-4 py-2 text-slate-900 font-semibold"
            >
              + รับฝากใหม่
            </button>
            <button
              onClick={() => navigate("/app/consignments/new")}
              className="rounded-xl border border-white/30 px-4 py-2 font-semibold"
            >
              + ฝากขายใหม่
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-7">
        <div className="grid gap-4 md:grid-cols-3">
          <QuickCard
            subtitle="งานฝากดูแล"
            title="รายการรับฝาก"
            to="/app/deposit/list"
            icon="🧾"
            tone="blue"
          />
          <QuickCard
            subtitle="งานฝากขาย"
            title="รายการฝากขาย"
            to="/app/consignments"
            icon="🏷️"
            tone="violet"
          />
          <QuickCard
            subtitle="สต๊อก"
            title="คลังสินค้า"
            to="/app/inventory"
            icon="📦"
            tone="green"
          />
        </div>

        <div className="mt-6 flex gap-2">
          <PillLink to="/app/price-check">ประเมินราคา</PillLink>
          <PillLink to="/app/intake/new">รับสินค้าเข้าร้าน</PillLink>
          <PillLink to="/app/inventory/bulk-sell">ขายหลายรายการ</PillLink>
        </div>
      </div>
    </div>
  );
}
