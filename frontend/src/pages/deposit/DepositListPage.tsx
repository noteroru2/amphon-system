// src/pages/deposit/DepositListPage.tsx
import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import useSWR from "swr";
import axios from "axios";

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

type Customer = {
  name: string;
  phone?: string;
};

type Asset = {
  modelName?: string;
  serial?: string;
  storageCode?: string;
};

type ContractStatus = "ACTIVE" | "REDEEMED" | "FORFEITED" | string;

type Contract = {
  id: number;
  code: string;
  status: ContractStatus;
  createdAt: string;
  dueDate: string;
  customer?: Customer;
  asset?: Asset;
  principal: number;
  type?: string; // DEPOSIT / CONSIGNMENT ฯลฯ
};

export function DepositListPage() {
  // ดึงสัญญาทั้งหมดมา filter ที่ฝั่งหน้าเว็บ
  const { data, error } = useSWR<Contract[]>("/api/contracts", fetcher);
  const [search, setSearch] = useState("");

  const activeContracts = useMemo<Contract[]>(() => {
    if (!data) return [];

    const list: Contract[] = Array.isArray(data)
      ? data
      : (data as any).items || [];

    const onlyDeposit = list.filter(
      (c) => !c.type || c.type === "DEPOSIT"
    );

    const onlyActive = onlyDeposit.filter(
      (c) => !c.status || c.status === "ACTIVE"
    );

    // filter ตามคำค้นหา
    const q = search.trim().toLowerCase();
    const filtered = !q
      ? onlyActive
      : onlyActive.filter((c) => {
          return (
            c.code.toLowerCase().includes(q) ||
            (c.customer?.name || "").toLowerCase().includes(q) ||
            (c.asset?.modelName || "").toLowerCase().includes(q) ||
            (c.asset?.serial || "").toLowerCase().includes(q) ||
            (c.asset?.storageCode || "").toLowerCase().includes(q)
          );
        });

    // sort ตามวันครบกำหนด — ใกล้ครบก่อน
    const sorted = [...filtered].sort((a, b) => {
      const da = new Date(a.dueDate || a.createdAt).getTime();
      const db = new Date(b.dueDate || b.createdAt).getTime();
      if (Number.isNaN(da) && Number.isNaN(db)) return 0;
      if (Number.isNaN(da)) return 1;
      if (Number.isNaN(db)) return -1;
      return da - db; // น้อยกว่า = ใกล้ครบก่อน
    });

    return sorted;
  }, [data, search]);

  if (error) {
    console.error("โหลดรายการรับฝากผิดพลาด:", error);
    return (
      <div className="p-4 text-center text-xs text-red-500">
        ไม่สามารถโหลดรายการรับฝากได้ กรุณาลองใหม่อีกครั้ง
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

  const calcDueInfo = (dueDate: string) => {
    if (!dueDate) return { text: "-", isOver: false };

    const today = new Date();
    const due = new Date(dueDate);
    if (Number.isNaN(due.getTime())) {
      return { text: "-", isOver: false };
    }

    const diffMs = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { text: `เลยกำหนด ${Math.abs(diffDays)} วัน`, isOver: true };
    }
    if (diffDays === 0) {
      return { text: "ครบกำหนดวันนี้", isOver: true };
    }
    return { text: `เหลือ ${diffDays} วัน`, isOver: false };
  };

  const formatDate = (value: string) => {
    if (!value) return "-";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("th-TH", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
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
            จัดการสัญญาฝากดูแลทรัพย์ที่ยังไม่ครบกำหนด หรือยังไม่ตัดหลุด
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* ช่องค้นหา */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหา (เลขที่สัญญา, ชื่อลูกค้า, รุ่น, Serial, กล่องเก็บ)"
            className="w-72 rounded-full border border-slate-300 px-3 py-1.5 text-xs outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
          />

          {/* ปุ่มไปหน้าประวัติทั้งหมด */}
          <Link
            to="/deposit/history"
            className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-200"
          >
            ประวัติทั้งหมด
          </Link>

          {/* ปุ่มไปหน้าสร้างสัญญาใหม่ */}
          <Link
            to="/deposit/new"
            className="rounded-full bg-red-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-red-700"
          >
            + รับฝากใหม่
          </Link>
        </div>
      </div>

      {/* ตารางรายการ */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <table className="min-w-full text-xs">
          <thead className="bg-slate-50 text-[11px] text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left">เลขที่สัญญา</th>
              <th className="px-4 py-3 text-left">ลูกค้า</th>
              <th className="px-4 py-3 text-left">ทรัพย์สิน</th>
              <th className="px-4 py-3 text-center">กล่องเก็บ</th>
              <th className="px-4 py-3 text-center">วันครบกำหนด</th>
              <th className="px-4 py-3 text-center">สถานะวันครบกำหนด</th>
              <th className="px-4 py-3 text-right">เงินต้น (Principal)</th>
              <th className="px-4 py-3 text-center">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {activeContracts.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-6 text-center text-xs text-slate-400"
                >
                  ยังไม่มีสัญญาที่กำลังดำเนินอยู่
                </td>
              </tr>
            )}

            {activeContracts.map((c) => {
              const dueInfo = calcDueInfo(c.dueDate);
              return (
                <tr
                  key={c.id}
                  className="border-t border-slate-100 hover:bg-slate-50/80"
                >
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {c.code}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">
                      {c.customer?.name || "-"}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {c.customer?.phone || ""}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div>{c.asset?.modelName || "-"}</div>
                    <div className="text-[11px] text-slate-500">
                      SN: {c.asset?.serial || "-"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {c.asset?.storageCode || "-"}
                  </td>
                  <td className="px-4 py-3 text-center text-[11px] text-slate-600">
                    {formatDate(c.dueDate)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        dueInfo.isOver
                          ? "bg-red-50 text-red-700"
                          : "bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {dueInfo.text}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {(c.principal || 0).toLocaleString()} ฿
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Link
                      to={`/contracts/${c.id}`}
                      className="rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-slate-800"
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
