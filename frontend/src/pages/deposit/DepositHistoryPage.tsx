// src/pages/deposit/DepositHistoryPage.tsx
import React, { useState, useMemo } from "react";
import useSWR from "swr";
import axios from "axios";
import { Link } from "react-router-dom";

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

type ContractStatus =
  | "ACTIVE"
  | "REDEEMED"
  | "FORFEITED"
  | "RENEWED"
  | "ROLLED"
  | string;

type Customer = {
  name: string;
  phone?: string;
  lineId?: string;
};

type Asset = {
  modelName?: string;
  serial?: string;
  storageCode?: string;
};

type ContractActionLog = {
  id: number;
  action: string;
  amount: number;
  createdAt: string;
};

type Contract = {
  id: number;
  code: string;
  status: ContractStatus;
  createdAt?: string;
  startDate?: string;
  dueDate?: string;
  updatedAt?: string;
  previousContractId?: number | null;
  customer?: Customer;
  asset?: Asset;
  principal: number;
  type?: string;
  logs?: ContractActionLog[];
};

type MonthOption = {
  value: string;
  label: string;
};

export function DepositHistoryPage() {
  const { data, error } = useSWR<Contract[]>("/api/contracts", fetcher);
  const [search, setSearch] = useState("");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");

  const contracts = useMemo<Contract[]>(() => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    if ((data as any).items && Array.isArray((data as any).items)) {
      return (data as any).items;
    }
    return [];
  }, [data]);

  // --- หา set ของสัญญา "เดิม" ที่มีเล่มใหม่ต่อจากมัน ---
  const rolledIds = useMemo<Set<number>>(() => {
    const s = new Set<number>();
    contracts.forEach((c) => {
      if (c.previousContractId) {
        s.add(c.previousContractId);
      }
    });
    return s;
  }, [contracts]);

  // --- สร้าง list เดือน (จาก createdAt) ---
  const monthOptions = useMemo<MonthOption[]>(() => {
    const map = new Map<string, string>();

    for (const c of contracts) {
      if (!c.createdAt) continue;
      const d = new Date(c.createdAt);
      if (Number.isNaN(d.getTime())) continue;

      const key =
        d.getFullYear().toString() +
        "-" +
        String(d.getMonth() + 1).padStart(2, "0");

      if (!map.has(key)) {
        const label = d.toLocaleDateString("th-TH", {
          month: "long",
          year: "numeric",
        });
        map.set(key, label);
      }
    }

    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([value, label]) => ({ value, label }));
  }, [contracts]);

  if (error) {
    console.error("Error loading deposit history:", error);
    return (
      <div className="p-4 text-center text-xs text-red-500">
        ไม่สามารถโหลดประวัติสัญญาได้ กรุณาลองใหม่อีกครั้ง
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 text-xs text-slate-500">
        กำลังโหลดประวัติสัญญา...
      </div>
    );
  }

  const formatDate = (value?: string | null) => {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("th-TH", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  // --- หมายเหตุ ---
  const renderNote = (c: Contract, rolledIds: Set<number>): string => {
  const logs = (c.logs || []).slice().sort((a, b) =>
    a.createdAt < b.createdAt ? -1 : 1
  );
  const latest = logs[logs.length - 1];

  const formatAmount = (amt: number) =>
    amt ? `${amt.toLocaleString()} บาท` : "";

  const isRolledSource = rolledIds.has(c.id);

  // 1) สัญญาเดิมที่ถูกต่อเล่มใหม่
  if (isRolledSource) {
    return `ปิดสัญญา (มีเล่มใหม่) วันที่ ${formatDate(
      c.updatedAt || c.createdAt
    )}`;
  }

  if (!logs.length) {
    // fallback แบบเดิมถ้ายังไม่มี log
    if (c.status === "ACTIVE" && !c.previousContractId) {
      return `ทำสัญญาใหม่ วันที่ ${formatDate(c.createdAt)}`;
    }
    if (c.status === "REDEEMED") {
      return `ไถ่ถอน วันที่ ${formatDate(c.updatedAt || c.createdAt)}`;
    }
    if (c.status === "FORFEITED") {
      return `ตัดหลุด วันที่ ${formatDate(c.updatedAt || c.createdAt)}`;
    }
    return "";
  }

  // 2) หา log ตัดต้นล่าสุด (ถ้ามี)
  const latestCut = [...logs]
    .reverse()
    .find((l) => l.action === "CUT_PRINCIPAL");

  if (
    latestCut &&
    c.status === "ACTIVE" &&
    !c.previousContractId // ยังเป็นเล่มแรก
  ) {
    return `ปรับวงเงิน (ตัดต้น) ${formatAmount(
      latestCut.amount
    )} ล่าสุด วันที่ ${formatDate(latestCut.createdAt)}`;
  }

  // 3) แปล action จาก log ล่าสุด
  switch (latest.action) {
    case "NEW_CONTRACT":
      return `ทำสัญญาใหม่ ต้น ${formatAmount(
        latest.amount
      )} วันที่ ${formatDate(latest.createdAt)}`;

    case "RENEW_CONTRACT":
      return `ต่อสัญญาใหม่ ต้น ${formatAmount(
        latest.amount
      )} วันที่ ${formatDate(latest.createdAt)}`;

    case "REDEEM":
      return `ไถ่ถอน ${formatAmount(
        latest.amount
      )} วันที่ ${formatDate(latest.createdAt)}`;

    case "FORFEIT":
      return `ตัดหลุด ${formatAmount(
        latest.amount
      )} วันที่ ${formatDate(latest.createdAt)}`;

    case "CUT_PRINCIPAL":
      return `ปรับวงเงิน (ตัดต้น) ${formatAmount(
        latest.amount
      )} วันที่ ${formatDate(latest.createdAt)}`;

    default:
      return "";
  }
};


  // --- ฟิลเตอร์ ---
  const filtered = contracts
    .filter((c) => !c.type || c.type === "DEPOSIT")
    .filter((c) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        c.code.toLowerCase().includes(q) ||
        (c.customer?.name || "").toLowerCase().includes(q) ||
        (c.asset?.modelName || "").toLowerCase().includes(q) ||
        (c.asset?.serial || "").toLowerCase().includes(q) ||
        (c.asset?.storageCode || "").toLowerCase().includes(q)
      );
    })
    .filter((c) => {
      if (selectedMonth === "all") return true;
      if (!c.createdAt) return false;
      const d = new Date(c.createdAt);
      if (Number.isNaN(d.getTime())) return false;
      const key =
        d.getFullYear().toString() +
        "-" +
        String(d.getMonth() + 1).padStart(2, "0");
      return key === selectedMonth;
    })
    .sort(
      (a, b) =>
        new Date(b.createdAt || "").getTime() -
        new Date(a.createdAt || "").getTime()
    );

  const renderStatus = (c: Contract) => {
    const base =
      "inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium";
    const isRolledSource = rolledIds.has(c.id);

    if (isRolledSource) {
      // สัญญาเดิมที่มีเล่มใหม่ต่อ
      return (
        <span className={`${base} bg-amber-50 text-amber-700`}>
          ปิดสัญญา (มีเล่มต่อ)
        </span>
      );
    }

    switch (c.status) {
      case "ACTIVE":
        return (
          <span className={`${base} bg-emerald-50 text-emerald-700`}>
            กำลังดำเนินการ
          </span>
        );
      case "REDEEMED":
        return (
          <span className={`${base} bg-sky-50 text-sky-700`}>
            ไถ่ถอนแล้ว
          </span>
        );
      case "FORFEITED":
        return (
          <span className={`${base} bg-red-50 text-red-700`}>ตัดหลุด</span>
        );
      default:
        return (
          <span className={`${base} bg-slate-50 text-slate-600`}>
            {c.status || "-"}
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            ประวัติสัญญาฝากดูแลทั้งหมด
          </h1>
          <p className="text-xs text-slate-500">
            แสดงรายการสัญญาใหม่ ต่อสัญญา ไถ่ถอน ตัดหลุด และการปรับยอดทั้งหมด
            แยกดูรายเดือนได้
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
          >
            <option value="all">ทุกเดือน</option>
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา (เลขที่สัญญา, ชื่อลูกค้า, รุ่น, Serial, กล่องเก็บ)"
            className="w-72 rounded-full border border-slate-300 px-3 py-1.5 text-xs text-slate-700 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
          />
          <Link
            to="/deposit/list"
            className="rounded-full border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            ← กลับหน้ารายการปัจจุบัน
          </Link>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-[11px] text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">เลขที่สัญญา</th>
              <th className="px-4 py-3 text-left">สถานะ</th>
              <th className="px-4 py-3 text-left">ลูกค้า</th>
              <th className="px-4 py-3 text-left">ทรัพย์สิน</th>
              <th className="px-4 py-3 text-center">กล่องเก็บ</th>
              <th className="px-4 py-3 text-center">วันที่เริ่ม</th>
              <th className="px-4 py-3 text-center">วันครบกำหนด</th>
              <th className="px-4 py-3 text-right">เงินต้น (Principal)</th>
              <th className="px-4 py-3 text-left">หมายเหตุ</th>
              <th className="px-4 py-3 text-center">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={10}
                  className="px-4 py-6 text-center text-xs text-slate-400"
                >
                  ไม่พบสัญญาตามเงื่อนไขที่ค้นหา / เดือนที่เลือก
                </td>
              </tr>
            )}

            {filtered.map((c) => (
              <tr
                key={c.id}
                className="border-t border-slate-100 hover:bg-slate-50/70"
              >
                <td className="px-4 py-3 align-top">
                  <div className="font-mono text-[11px] text-slate-800">
                    {c.code}
                  </div>
                </td>
                <td className="px-4 py-3 align-top">{renderStatus(c)}</td>
                <td className="px-4 py-3 align-top">
                  <div className="font-medium text-slate-800">
                    {c.customer?.name || "-"}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {c.customer?.phone || ""}
                  </div>
                </td>
                <td className="px-4 py-3 align-top">
                  <div>{c.asset?.modelName || "-"}</div>
                  <div className="text-[11px] text-slate-500">
                    SN: {c.asset?.serial || "-"}
                  </div>
                </td>
                <td className="px-4 py-3 text-center align-top">
                  {c.asset?.storageCode || "-"}
                </td>
                <td className="px-4 py-3 text-center text-[11px] text-slate-600 align-top">
                  {formatDate(c.startDate || c.createdAt)}
                </td>
                <td className="px-4 py-3 text-center text-[11px] text-slate-600 align-top">
                  {formatDate(c.dueDate)}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-800 align-top">
                  {(c.principal || 0).toLocaleString()} ฿
                </td>
                <td className="px-4 py-3 align-top text-[11px] text-slate-600">
                  {renderNote(c, rolledIds)}
                </td>
                <td className="px-4 py-3 text-center align-top">
                  <Link
                    to={`/contracts/${c.id}`}
                    className="rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-slate-800"
                  >
                    รายละเอียด
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
