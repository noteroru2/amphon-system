import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

function fmtMoney(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString("th-TH") + " ฿";
}

function fmtDate(d?: any) {
  if (!d) return "-";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleDateString("th-TH");
}

// m = "YYYY-MM-01"
function fmtMonthLabel(m: string) {
  if (!m) return "-";
  const d = new Date(m);
  if (Number.isNaN(d.getTime())) return m;
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "short" });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-6">
      <div className="mb-3 text-lg font-semibold">{title}</div>
      {children}
    </div>
  );
}

export default function AdminStatsPage() {
  const now = new Date();

  const [mode, setMode] = useState<"month" | "year">("month");
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [data, setData] = useState<any>(null);
  const [series, setSeries] = useState<any>(null);

  const years = useMemo(() => {
    const y = now.getFullYear();
    return Array.from({ length: 6 }, (_, i) => y - i);
  }, [now]);

  const fetchStats = async () => {
    try {
      setErr("");
      setLoading(true);

      const res = await axios.get("/api/admin/stats", {
        params: mode === "year" ? { mode, year } : { mode, year, month },
      });
      setData(res.data);

      const s = await axios.get("/api/admin/stats/series", {
        params: { mode: "month", year },
      });
      setSeries(s.data);
    } catch (e: any) {
      console.error(e);
      setErr(e?.response?.data?.message || e?.message || "โหลดสถิติไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ===== safe getters (กัน key mismatch) =====
  const overview = data?.overview || {};
  const trade = data?.trade || {};
  const deposit = data?.deposit || {};

  // 1) Summary
  const activeContractsCount = overview?.activeContractsCount ?? data?.activeContractsCount ?? 0;
  const latest = overview?.latestActiveContract ?? data?.latestActiveContract ?? null;

  // ✅ totals: รองรับทั้ง root และ overview
  const totalIn =
    data?.totalIn ?? overview?.totalIn ?? overview?.total_in ?? data?.total_in ?? 0;
  const totalOut =
    data?.totalOut ?? overview?.totalOut ?? overview?.total_out ?? data?.total_out ?? 0;
  const totalProfit =
    data?.totalProfit ?? overview?.totalProfit ?? overview?.total_profit ?? data?.total_profit ?? 0;

  // 2) Deposit
  const depositPaid =
    deposit?.paidPrincipal ?? data?.depositPaid ?? 0;
  const depositContractsCreated =
    deposit?.contractsCreated ?? data?.depositContractsCreated ?? 0;
  const depositServiceFeeIncome =
    deposit?.serviceFeeIncome ?? data?.serviceFeeIncome ?? 0;

  // 3) Trade
  const buyInCount = trade?.buyInCount ?? data?.buyInCount ?? 0;
  const saleCount = trade?.saleCount ?? data?.saleCount ?? 0;

  // กำไรซื้อขาย “ขายปกติ”
  const normalSaleProfit =
    trade?.normalSaleProfit ?? data?.normalSaleProfit ?? 0;

  // ฝากขาย
  const consCommission =
    trade?.consignmentCommission ?? data?.consignmentCommission ?? 0;
  const consVat =
    trade?.consignmentVat ?? data?.consignmentVat ?? 0;

  // label
  const rangeLabel = useMemo(() => {
    if (mode === "year") return `ช่วงที่เลือก: ปี ${year}`;
    return `ช่วงที่เลือก: เดือน ${month} / ${year}`;
  }, [mode, month, year]);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-6xl px-8 py-8">
        {/* Header + Filters */}
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">สรุปยอด / การเงิน (Admin Stats)</h1>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
              className="rounded border bg-white px-3 py-2 text-sm"
            >
              <option value="month">รายเดือน</option>
              <option value="year">รายปี</option>
            </select>

            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded border bg-white px-3 py-2 text-sm"
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>

            {mode === "month" ? (
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                className="rounded border bg-white px-3 py-2 text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    เดือน {m}
                  </option>
                ))}
              </select>
            ) : null}

            <button
              onClick={fetchStats}
              className="rounded bg-slate-900 px-4 py-2 text-sm text-white hover:opacity-90"
            >
              ดูสรุป
            </button>
          </div>
        </div>

        <div className="mb-6 text-sm text-slate-500">{rangeLabel}</div>

        {err ? (
          <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {err}
          </div>
        ) : null}

        {/* ==================== 1) สรุปรวม ==================== */}
        <Section title="1) สรุปรวม">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl bg-white p-6 shadow">
              <div className="text-sm text-slate-500">สัญญาคงค้าง (ACTIVE)</div>
              <div className="mt-2 text-3xl font-semibold">{activeContractsCount}</div>
              <div className="mt-3 text-xs text-slate-500">
                ล่าสุด:{" "}
                {latest ? (
                  <span className="text-slate-700">
                    {latest.code} • {latest.customer?.name || "-"} • {fmtDate(latest.createdAt)}
                  </span>
                ) : (
                  "-"
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow">
              <div className="text-sm text-slate-500">
                ยอดเงินเข้า {mode === "month" ? "เดือนนี้" : "ปีนี้"} (ทั้งหมด)
              </div>
              <div className="mt-2 text-3xl font-semibold">{fmtMoney(totalIn)}</div>
              <div className="mt-3 text-xs text-slate-500">*sum(CashbookEntry.amount) type=IN</div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow">
              <div className="text-sm text-slate-500">
                ยอดเงินจ่ายออก {mode === "month" ? "เดือนนี้" : "ปีนี้"} (ทั้งหมด)
              </div>
              <div className="mt-2 text-3xl font-semibold">{fmtMoney(totalOut)}</div>
              <div className="mt-3 text-xs text-slate-500">*sum(CashbookEntry.amount) type=OUT</div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow">
              <div className="text-sm text-slate-500">
                กำไร {mode === "month" ? "เดือนนี้" : "ปีนี้"}
              </div>
              <div className="mt-2 text-3xl font-semibold">{fmtMoney(totalProfit)}</div>
              <div className="mt-3 text-xs text-slate-500">*sum(CashbookEntry.profit) ทั้งหมดในช่วง</div>
            </div>
          </div>
        </Section>

        {/* ==================== 2) ฝากดูแล ==================== */}
        <Section title="2) สรุปบริการรับฝากดูแลทรัพย์">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-white p-6 shadow">
              <div className="text-sm text-slate-500">จ่ายออก (principal) ช่วงที่เลือก</div>
              <div className="mt-2 text-3xl font-semibold">{fmtMoney(depositPaid)}</div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow">
              <div className="text-sm text-slate-500">จำนวนสัญญาฝากดูแลที่สร้าง (ช่วงที่เลือก)</div>
              <div className="mt-2 text-3xl font-semibold">{depositContractsCreated}</div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow">
              <div className="text-sm text-slate-500">รายได้ค่าบริการฝากดูแล (ช่วงที่เลือก)</div>
              <div className="mt-2 text-3xl font-semibold">{fmtMoney(depositServiceFeeIncome)}</div>
              <div className="mt-3 text-xs text-slate-500">*จาก Cashbook (contractId + หมวดค่าบริการ)</div>
            </div>
          </div>

          {deposit?.debug ? (
            <div className="mt-3 rounded-2xl bg-white p-4 text-xs text-slate-600 shadow">
              debug deposit: {JSON.stringify(deposit.debug)}
            </div>
          ) : null}

          <div className="mt-4 rounded-2xl bg-white p-6 shadow">
            <div className="mb-3 text-lg font-semibold">สรุปรายเดือน (ฝากดูแล)</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2">เดือน</th>
                    <th className="px-3 py-2">จ่ายไป (principal)</th>
                    <th className="px-3 py-2">จำนวนสัญญา</th>
                  </tr>
                </thead>
                <tbody>
                  {(series?.depositSeries || []).map((r: any, i: number) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2">{fmtMonthLabel(r.m)}</td>
                      <td className="px-3 py-2">{fmtMoney(Number(r.deposit_paid || 0))}</td>
                      <td className="px-3 py-2">{Number(r.contracts_created || 0)}</td>
                    </tr>
                  ))}
                  {!series?.depositSeries?.length ? (
                    <tr>
                      <td colSpan={3} className="px-3 py-6 text-center text-slate-500">
                        ยังไม่มีข้อมูล
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </Section>

        {/* ==================== 3) รับซื้อ / ขาย / ฝากขาย ==================== */}
        <Section title="3) สรุปบริการรับซื้อ / ขาย / ฝากขาย">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-white p-6 shadow">
              <div className="text-sm text-slate-500">จำนวนครั้งรับซื้อ (ช่วงที่เลือก)</div>
              <div className="mt-2 text-3xl font-semibold">{buyInCount}</div>
              <div className="mt-3 text-xs text-slate-500">*นับจาก Cashbook category=INVENTORY_BUY_IN (type=OUT)</div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow">
              <div className="text-sm text-slate-500">จำนวนครั้งขาย (ช่วงที่เลือก)</div>
              <div className="mt-2 text-3xl font-semibold">{saleCount}</div>
              <div className="mt-3 text-xs text-slate-500">*นับจาก Cashbook category=INVENTORY_SALE (type=IN)</div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow">
              <div className="text-sm text-slate-500">กำไรซื้อขาย (ช่วงที่เลือก)</div>
              <div className="mt-2 text-3xl font-semibold">{fmtMoney(normalSaleProfit)}</div>
              <div className="mt-3 text-xs text-slate-500">
                *รวม profit ของ “ขายปกติ” (ไม่รวมฝากขาย)
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl bg-white p-6 shadow">
              <div className="text-sm text-slate-500">ฝากขาย: คอมมิชชั่น (ช่วงที่เลือก)</div>
              <div className="mt-2 text-3xl font-semibold">{fmtMoney(consCommission)}</div>
              <div className="mt-3 text-sm text-slate-600">VAT 7%: {fmtMoney(consVat)}</div>
              <div className="mt-2 text-xs text-slate-500">
                *คำนวณจากรายการ INVENTORY_SALE ที่ inventoryItem.consignmentContractId != null
              </div>
            </div>

            <div className="rounded-2xl bg-white p-6 shadow">
              <div className="mb-2 text-lg font-semibold">หมายเหตุ</div>
              <div className="text-sm text-slate-600">
                ถ้าคุณอยาก “แยกค่าฝากขายออกเป็น 2 ส่วน” (คอมฯ + VAT) แบบบันทึกแยกแถวใน Cashbook
                ควรเพิ่ม category เช่น <b>CONSIGNMENT_COMMISSION_FEE</b> และ <b>CONSIGNMENT_VAT</b> ได้
                แต่ตอนนี้หน้าแสดงผลคำนวณให้แล้วจาก commission รวม
              </div>
            </div>
          </div>

          {trade?.debug ? (
            <div className="mt-3 rounded-2xl bg-white p-4 text-xs text-slate-600 shadow">
              debug trade: {JSON.stringify(trade.debug)}
            </div>
          ) : null}
        </Section>

        {loading ? <div className="mt-4 text-sm text-slate-500">กำลังโหลด...</div> : null}
      </div>
    </div>
  );
}
