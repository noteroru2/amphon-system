// frontend/src/pages/admin/CashbookPage.tsx
import { useMemo, useState } from "react";
import useSWR from "swr";
import { api, getApiErrorMessage } from "../../lib/api";


type CashbookEntry = {
  id: number;
  type: "IN" | "OUT";
  category?: string | null;
  amount: number;
  description?: string | null;
  createdAt: string;
  contractId?: number | null;
  contractCode?: string | null;
  inventoryItemId?: number | null;
  inventoryTitle?: string | null;
  inventoryInfo?: string | null;
  profit?: number;
};

type CashbookResponse = {
  month: string; // "2025-12"
  summary: {
    totalIn: number;
    totalOut: number;
    netCash: number;
    totalProfit: number;
    principalOut: number;
    principalIn: number;
    profit: number; // alias จาก backend (เท่ากับ totalProfit)
  };
  entries: CashbookEntry[];
};

const fetcher = (url: string) => api.get(url).then((r) => r.data);

function formatBaht(v: number) {
  return Number(v || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function monthLabel(monthStr: string) {
  if (!monthStr) return "-";
  const [yearStr, monthNum] = monthStr.split("-");
  const year = Number(yearStr);
  const month = Number(monthNum);

  const monthsTh = [
    "",
    "ม.ค.",
    "ก.พ.",
    "มี.ค.",
    "เม.ย.",
    "พ.ค.",
    "มิ.ย.",
    "ก.ค.",
    "ส.ค.",
    "ก.ย.",
    "ต.ค.",
    "พ.ย.",
    "ธ.ค.",
  ];

  return `${monthsTh[month]} ${year + 543}`;
}

function parseSelectedMonthToYearMonth(selectedMonth: string) {
  // selectedMonth จาก <input type="month"> => "YYYY-MM"
  const [yStr, mStr] = (selectedMonth || "").split("-");
  const year = Number.parseInt(yStr, 10);
  const month = Number.parseInt(mStr, 10);
  return {
    year: Number.isNaN(year) ? null : year,
    month: Number.isNaN(month) ? null : month,
  };
}

export function CashbookPage() {
  const defaultMonth = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }, []);

  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonth);

  const { year, month } = useMemo(
    () => parseSelectedMonthToYearMonth(selectedMonth),
    [selectedMonth]
  );

  const swrKey = useMemo(() => {
    // ใช้รูปแบบที่ backend รองรับแน่นอน: year&month
    if (!year || !month) return null;
    return `/api/cashbook?year=${year}&month=${month}`;
  }, [year, month]);

  const { data, error, isLoading } = useSWR<CashbookResponse>(swrKey, fetcher);

  const summary = data?.summary || {
    totalIn: 0,
    totalOut: 0,
    netCash: 0,
    totalProfit: 0,
    principalOut: 0,
    principalIn: 0,
    profit: 0,
  };

  const entries = data?.entries || [];

  const errorMessage = error ? getApiErrorMessage(error) : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            บัญชีการเงิน (Cashbook)
          </h1>
          <p className="text-xs text-slate-500">
            สรุปเงินเข้า–ออกตามสัญญาฝากดูแล ตัดต้น ไถ่ถอน และตัดหลุด
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <label className="text-slate-600">เลือกเดือน:</label>
          <input
            type="month"
            className="rounded-lg border border-slate-300 px-2 py-1 text-xs outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {/* เงินเข้า (ทั้งหมด) */}
        <div className="rounded-2xl bg-emerald-50 p-3 text-xs">
          <div className="text-[11px] text-emerald-700">
            ยอดเงินเข้า (IN ทั้งหมด)
          </div>
          <div className="mt-1 text-lg font-semibold text-emerald-700">
            {formatBaht(summary.totalIn)} ฿
          </div>
          <div className="mt-1 text-[10px] text-emerald-500">
            รวมทั้งเงินต้นที่ลูกค้าจ่ายคืน และค่าบริการทั้งหมด
          </div>
        </div>

        {/* เงินออก (ทั้งหมด) */}
        <div className="rounded-2xl bg-rose-50 p-3 text-xs">
          <div className="text-[11px] text-rose-700">
            ยอดเงินออก (OUT ทั้งหมด)
          </div>
          <div className="mt-1 text-lg font-semibold text-rose-700">
            {formatBaht(summary.totalOut)} ฿
          </div>
          <div className="mt-1 text-[10px] text-rose-500">
            เช่น จ่ายเงินให้ลูกค้าตอนทำสัญญาใหม่, ตัดต้น ฯลฯ
          </div>
        </div>

        {/* กระแสเงินสดสุทธิ + กำไร */}
        <div className="rounded-2xl bg-slate-900 p-3 text-xs text-slate-50">
          <div className="text-[11px] text-slate-300">
            กระแสเงินสดสุทธิ (IN - OUT)
          </div>
          <div className="mt-1 text-lg font-semibold text-emerald-300">
            {formatBaht(summary.netCash)} ฿
          </div>
          <div className="mt-1 text-[10px] text-slate-400">
            กำไรจากค่าบริการทั้งหมด: {formatBaht(summary.profit)} ฿ • เดือน:{" "}
            {monthLabel(data?.month || selectedMonth)}
          </div>
        </div>
      </div>

      {/* Table */}
      <section className="rounded-2xl bg-white p-4 text-xs shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800">
            รายการเคลื่อนไหวเงินสด
          </h2>
          {isLoading && (
            <span className="text-[11px] text-slate-400">กำลังโหลดข้อมูล...</span>
          )}
          {error && (
            <span className="text-[11px] text-red-500">
              โหลดข้อมูลไม่สำเร็จ{errorMessage ? `: ${errorMessage}` : ""}
            </span>
          )}
        </div>

        {entries.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-[11px] text-slate-400">
            ยังไม่มีรายการเงินสดในเดือนนี้
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-100">
            <table className="min-w-full border-collapse text-[11px]">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-100">
                  <th className="px-3 py-2 text-left font-medium text-slate-500">
                    วันที่เวลา
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">
                    ประเภท
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">
                    รายการ
                  </th>
                  <th className="px-3 py-2 text-right font-medium text-slate-500">
                    จำนวนเงิน
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-slate-500">
                    อ้างอิง
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-slate-50 hover:bg-slate-50/80"
                  >
                    <td className="px-3 py-2 align-top text-[11px] text-slate-600">
                      {formatDateTime(e.createdAt)}
                    </td>
                    <td className="px-3 py-2 align-top text-[11px]">
                      <span
                        className={
                          e.type === "IN"
                            ? "rounded-full bg-emerald-50 px-2 py-[2px] text-[10px] font-medium text-emerald-700"
                            : "rounded-full bg-rose-50 px-2 py-[2px] text-[10px] font-medium text-rose-700"
                        }
                      >
                        {e.type === "IN" ? "เงินเข้า" : "เงินออก"}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top text-[11px] text-slate-700">
                      <div className="font-medium">
                        {e.category || "ไม่ระบุประเภท"}
                      </div>
                      {e.description && (
                        <div className="mt-[2px] text-[10px] text-slate-500">
                          {e.description}
                        </div>
                      )}
                      {typeof e.profit === "number" && e.profit !== 0 && (
                        <div className="mt-[2px] text-[10px] text-slate-500">
                          กำไร (profit): {formatBaht(e.profit)} ฿
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top text-right text-[11px]">
                      <span
                        className={
                          e.type === "IN"
                            ? "font-semibold text-emerald-700"
                            : "font-semibold text-rose-700"
                        }
                      >
                        {formatBaht(e.amount)} ฿
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top text-[11px] text-slate-600">
                      {e.contractCode && (
                        <div className="text-[10px] text-slate-500">
                          สัญญา: {e.contractCode}
                        </div>
                      )}
                      {e.inventoryTitle && (
                        <div className="text-[10px] text-slate-500">
                          สินค้า: {e.inventoryTitle}
                          {e.inventoryInfo ? ` • ${e.inventoryInfo}` : ""}
                        </div>
                      )}
                      {!e.contractId && !e.inventoryTitle && (
                        <span className="text-[11px] text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default CashbookPage;
