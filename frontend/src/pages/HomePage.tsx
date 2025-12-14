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
        "hover:-translate-y-0.5 hover:shadow-lg hover:border-slate-300",
        "focus:outline-none focus:ring-2 focus:ring-slate-300"
      )}
    >
      {/* gradient glow */}
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
            เปิดเมนู
            <span className="transition group-hover:translate-x-1">→</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function Section({
  title,
  desc,
  right,
  children,
}: {
  title: string;
  desc?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-7">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          {desc ? <div className="mt-0.5 text-sm text-slate-500">{desc}</div> : null}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function PillLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className={cls(
        "inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition",
        "hover:bg-slate-50 hover:border-slate-300"
      )}
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
      {/* Top hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 -bottom-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />

        <div className="mx-auto max-w-6xl px-6 py-7">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90">
                AMPHON System • STAFF
              </div>
              <h1 className="mt-3 text-2xl font-semibold text-white">หน้าแรกพนักงาน</h1>
              <div className="mt-1 text-sm text-white/70">
                ทางลัดงานหลัก + เช็คลิสต์ช่วยลดพลาด (ทำงานไวขึ้นทันที)
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => navigate("/deposit/new")}
                className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:opacity-95"
              >
                + รับฝากใหม่
              </button>
              <button
                onClick={() => navigate("/consignments/new")}
                className="rounded-2xl border border-white/25 bg-white/10 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-white/15"
              >
                + ฝากขายใหม่
              </button>
            </div>
          </div>

          {/* Mini stats (local) */}
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-3xl border border-white/15 bg-white/10 p-4 text-white">
              <div className="text-xs text-white/70">เป้าหมายวันนี้</div>
              <div className="mt-1 text-lg font-semibold">
                {progress.done}/{progress.total} งาน • {progress.pct}%
              </div>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-white/15">
                <div className="h-full bg-white/70" style={{ width: `${progress.pct}%` }} />
              </div>
            </div>

            <div className="rounded-3xl border border-white/15 bg-white/10 p-4 text-white">
              <div className="text-xs text-white/70">ทางลัด</div>
              <div className="mt-1 text-lg font-semibold">ประเมินราคา → รับฝาก/รับซื้อ</div>
              <div className="mt-1 text-xs text-white/70">ลดเวลาหน้าร้าน + ลดพลาดทุน/ราคา</div>
            </div>

            <div className="rounded-3xl border border-white/15 bg-white/10 p-4 text-white">
              <div className="text-xs text-white/70">คำแนะนำ</div>
              <div className="mt-1 text-lg font-semibold">เช็คช่องเก็บทุกครั้ง</div>
              <div className="mt-1 text-xs text-white/70">สต๊อกไม่เพี้ยน = ค้นหาของไว</div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-6 py-7">
        <Section title="งานหลัก (ทำบ่อยที่สุด)" desc="เปิดงานที่พนักงานใช้ทุกวันใน 1 คลิก">
          <div className="grid gap-4 md:grid-cols-3">
            <QuickCard
              subtitle="งานฝากดูแล"
              title="รายการรับฝาก"
              to="/deposit/list"
              icon="🧾"
              badge="ดูงานค้าง"
              tone="blue"
            />
            <QuickCard
              subtitle="งานฝากขาย"
              title="รายการฝากขาย"
              to="/consignments"
              icon="🏷️"
              badge="ติดตามขาย"
              tone="violet"
            />
            <QuickCard subtitle="สต๊อก" title="คลังสินค้า" to="/inventory" icon="📦" badge="จัดของ" tone="green" />
          </div>
        </Section>

        <Section title="ทางลัด" desc="ทำงานไวขึ้น: 2–3 คลิกจบ">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">เริ่มงานเร็ว</div>
                  <div className="mt-0.5 text-xs text-slate-500">แนะนำสำหรับหน้าร้าน</div>
                </div>
                <Badge>Quick Start</Badge>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Link
                  to="/price-check"
                  className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
                >
                  ประเมินราคา
                </Link>
                <PillLink to="/intake/new">รับสินค้าเข้าร้าน</PillLink>
                <PillLink to="/inventory/bulk-sell">ขายหลายรายการ</PillLink>
              </div>

              <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-xs text-slate-600">
                ทิป: ถ้าลูกค้ายังไม่ชัวร์ราคา → “ประเมินราคา” ก่อน แล้วค่อยทำ “รับฝาก/รับซื้อ”
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">ค้นหา/ติดตาม</div>
                  <div className="mt-0.5 text-xs text-slate-500">หาไว ลดเวลาถามกัน</div>
                </div>
                <Badge>Follow Up</Badge>
              </div>

              <div className="mt-4 grid gap-2">
                <PillLink to="/deposit/history">ประวัติสัญญารับฝาก</PillLink>
                <PillLink to="/deposit/list">สัญญากำลังดำเนินอยู่</PillLink>
              </div>

              <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-xs text-slate-600">
                ทิป: งาน “ต่อสัญญา/ตัดต้น/ไถ่ถอน” → เข้า “รายการรับฝาก” แล้วเลือกสัญญา
              </div>
            </div>
          </div>
        </Section>

        <Section
          title="เป้าหมายวันนี้ (ฝึกให้ทำงานเป็นระบบ)"
          desc="เช็คลิสต์ช่วยคุมคุณภาพงานพนักงาน"
          right={
            <div className="text-sm text-slate-700">
              ทำแล้ว <b>{progress.done}</b>/<b>{progress.total}</b> • {progress.pct}%
            </div>
          }
        >
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div className="h-full bg-slate-900" style={{ width: `${progress.pct}%` }} />
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {[
                {
                  key: "priceCheck",
                  label: "ประเมินราคาอย่างน้อย 1 รายการ",
                  hint: "กรอกข้อมูลให้ครบ เพื่อให้ราคาสมเหตุสมผล",
                  to: "/price-check",
                },
                {
                  key: "newDeposit",
                  label: "สร้างสัญญารับฝากใหม่ 1 สัญญา (ถ้ามีลูกค้า)",
                  hint: "ตรวจรูป/ข้อมูลลูกค้าให้ครบก่อนบันทึก",
                  to: "/deposit/new",
                },
                {
                  key: "intake",
                  label: "รับสินค้าเข้าร้าน (กรณีซื้อเข้า/นำเข้าคลัง)",
                  hint: "กรอกทุน/จำนวน/ช่องเก็บ เพื่อสต๊อกไม่เพี้ยน",
                  to: "/intake/new",
                },
                {
                  key: "stockReview",
                  label: "ตรวจสต๊อก/ช่องเก็บ 1 รอบ",
                  hint: "ช่วยให้หยิบของไว ลดของหาย",
                  to: "/inventory",
                },
              ].map((it: any) => (
                <div
                  key={it.key}
                  className="group rounded-2xl border border-slate-200 p-4 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={(check as any)[it.key]}
                      onChange={(e) => setCheck((prev) => ({ ...prev, [it.key]: e.target.checked }))}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900">{it.label}</div>
                      <div className="mt-1 text-xs text-slate-600">{it.hint}</div>
                      <Link
                        to={it.to}
                        className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-900 hover:underline"
                      >
                        ไปทำเลย <span className="transition group-hover:translate-x-1">→</span>
                      </Link>
                    </div>
                  </label>
                </div>
              ))}
            </div>

            <div className="mt-4 text-xs text-slate-500">
              *เช็คลิสต์นี้เป็นแนวทางฝึก/ควบคุมคุณภาพงานพนักงาน (ไม่เกี่ยวกับบัญชี)
            </div>
          </div>
        </Section>

        <div className="mt-7 rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm">
          หากต้องดู “ภาพรวมร้าน/สรุปยอด/การเงิน” ให้ไปที่เมนู <b>ADMIN → สรุปยอด/การเงิน</b>
        </div>
      </div>
    </div>
  );
}
