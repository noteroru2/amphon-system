import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import useSWR from "swr";
import { apiFetch } from "../../lib/api";

type Customer = {
  name: string;
  phone?: string;
};

type Asset = {
  modelName?: string;
  serial?: string;
  storageCode?: string;
};

type ContractStatus = "ACTIVE" | "REDEEMED" | "FORFEITED" | "RENEWED" | string;

type Contract = {
  id: number;
  code: string;
  status: ContractStatus;
  createdAt?: string;
  dueDate?: string;

  customer?: Customer | null;

  // backend shape ใหม่
  asset?: Asset | null;

  // legacy fallback (กันพัง)
  itemTitle?: string;
  itemSerial?: string;
  storageCode?: string;

  principal?: number;
  securityDeposit?: number;
  type?: string; // DEPOSIT / CONSIGNMENT
};

const swrFetcher = (url: string) => apiFetch<any>(url);

export function DepositListPage() {
  // ✅ BASE_URL ลงท้าย /api แล้ว ดังนั้นยิง "/contracts"
  const { data, error } = useSWR("/contracts", swrFetcher);
  const [search, setSearch] = useState("");

  const list: Contract[] = useMemo(() => {
    if (Array.isArray(data)) return data;
    if (Array.isArray((data as any)?.items)) return (data as any).items;
    return [];
  }, [data]);

  const activeContracts = useMemo<Contract[]>(() => {
    const q = search.trim().toLowerCase();

    const onlyDeposit = list.filter((c) => !c.type || c.type === "DEPOSIT");
    const onlyActive = onlyDeposit.filter((c) => !c.status || c.status === "ACTIVE");

    const filtered = !q
      ? onlyActive
      : onlyActive.filter((c) => {
          const code = (c.code || "").toLowerCase();
          const name = (c.customer?.name || "").toLowerCase();
          const model = (c.asset?.modelName || c.itemTitle || "").toLowerCase();
          const serial = (c.asset?.serial || c.itemSerial || "").toLowerCase();
          const box = (c.asset?.storageCode || c.storageCode || "").toLowerCase();

          return (
            code.includes(q) ||
            name.includes(q) ||
            model.includes(q) ||
            serial.includes(q) ||
            box.includes(q)
          );
        });

    // sort: ใกล้ครบกำหนดที่สุดขึ้นก่อน (invalid date ไปท้าย)
    return [...filtered].sort((a, b) => {
      const da = new Date(a.dueDate || a.createdAt || "").getTime();
      const db = new Date(b.dueDate || b.createdAt || "").getTime();
      const aBad = Number.isNaN(da);
      const bBad = Number.isNaN(db);
      if (aBad && bBad) return 0;
      if (aBad) return 1;
      if (bBad) return -1;
      return da - db;
    });
  }, [list, search]);

  if (error) {
    console.error("โหลดรายการรับฝากผิดพลาด:", error);
    return (
      <div className="p-4 text-center text-xs text-red-500">
        ไม่สามารถโหลดรายการรับฝากได้: {String((error as any)?.message || error)}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 text-xs text-slate-500">
        กำลังโหลดรายการรับฝาก...
      </div>
    );
  }

  const calcDueInfo = (dueDate?: string, createdAt?: string) => {
  const base = dueDate || createdAt;
  if (!base) return { text: "-", isOver: false };

  const tz = "Asia/Bangkok";

  // แปลง Date -> YYYY-MM-DD ตามเวลาไทย (ตัดเวลาออก)
  const toThaiYMD = (value: Date) =>
    new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(value); // "YYYY-MM-DD"

  // แปลง YYYY-MM-DD -> day number (นับเป็นจำนวนวันแบบคงที่)
  const toDayNumber = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map(Number);
    return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
  };

  const due = new Date(base);
  if (Number.isNaN(due.getTime())) return { text: "-", isOver: false };

  const todayYMD = toThaiYMD(new Date());
  const dueYMD = toThaiYMD(due);

  const diffDays = toDayNumber(dueYMD) - toDayNumber(todayYMD);

  if (diffDays < 0) return { text: `เลยกำหนด ${Math.abs(diffDays)} วัน`, isOver: true };
  if (diffDays === 0) return { text: "ครบกำหนดวันนี้", isOver: true };
  return { text: `เหลือ ${diffDays} วัน`, isOver: false };
};


  const formatDate = (value?: string) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};


  const getPrincipal = (c: Contract) => {
    if (typeof c.principal === "number") return c.principal;
    if (typeof c.securityDeposit === "number") return c.securityDeposit;
    return 0;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            รายการรับฝาก (กำลังดำเนินอยู่)
          </h1>
          <p className="text-xs text-slate-500">
            สัญญาฝากดูแลทรัพย์ที่ยัง ACTIVE และเรียงใกล้ครบกำหนดก่อน
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา (เลขที่, ลูกค้า, รุ่น, Serial, กล่อง)"
            className="w-72 rounded-full border px-3 py-1.5 text-xs"
          />

          <Link
            to="/app/deposit/history"
            className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-900"
          >
            ประวัติทั้งหมด
          </Link>

          <Link
            to="/app/deposit/new"
            className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white"
          >
            + รับฝากใหม่
          </Link>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-[11px] text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">เลขที่สัญญา</th>
              <th className="px-4 py-3 text-left">ลูกค้า</th>
              <th className="px-4 py-3 text-left">ทรัพย์สิน</th>
              <th className="px-4 py-3 text-center">กล่อง</th>
              <th className="px-4 py-3 text-center">ครบกำหนด</th>
              <th className="px-4 py-3 text-center">เหลือ/เลยกำหนด</th>
              <th className="px-4 py-3 text-right">เงินต้น</th>
              <th className="px-4 py-3 text-center">จัดการ</th>
            </tr>
          </thead>

          <tbody>
            {activeContracts.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-400">
                  ยังไม่มีสัญญาที่กำลังดำเนินอยู่
                </td>
              </tr>
            )}

            {activeContracts.map((c) => {
              const dueInfo = calcDueInfo(c.dueDate, c.createdAt);
              const principal = getPrincipal(c);

              return (
                <tr key={c.id} className="border-t hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium">{c.code}</td>

                  <td className="px-4 py-3">
                    <div className="font-medium">{c.customer?.name || "-"}</div>
                    <div className="text-[11px] text-slate-500">{c.customer?.phone || ""}</div>
                  </td>

                  <td className="px-4 py-3">
                    <div>{c.asset?.modelName || c.itemTitle || "-"}</div>
                    <div className="text-[11px] text-slate-500">
                      SN: {c.asset?.serial || c.itemSerial || "-"}
                    </div>
                  </td>

                  <td className="px-4 py-3 text-center">
                    {c.asset?.storageCode || c.storageCode || "-"}
                  </td>

                  <td className="px-4 py-3 text-center text-[11px]">
                    {formatDate(c.dueDate)}
                  </td>

                  <td className="px-4 py-3 text-center">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] ${
                        dueInfo.isOver ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {dueInfo.text}
                    </span>
                  </td>

                  <td className="px-4 py-3 text-right font-semibold">
                    {principal.toLocaleString()} ฿
                  </td>

                  <td className="px-4 py-3 text-center">
                    <Link
                      to={`/app/contracts/${c.id}`}
                      className="rounded-full bg-slate-900 px-3 py-1.5 text-[11px] text-white"
                    >
                      รายละเอียด
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DepositListPage;
