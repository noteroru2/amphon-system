// src/pages/InventoryPage.tsx
import React, { useEffect, useState, ChangeEvent } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

type InventoryItemRow = {
  id: number;
  code: string;
  name: string;
  serial?: string | null;
  status: string;
  sourceType: string;
  cost: number;
  targetPrice: number;
  sellingPrice: number;
  quantityAvailable: number;
  createdAt: string;
};

type TabKey = "ALL" | "READY" | "SOLD";

const statusLabel = (status: string): { text: string; colorClass: string } => {
  const s = status?.toUpperCase() || "";
  if (s === "IN_STOCK" || s === "READY" || s === "READY_FOR_SALE") {
    return { text: "พร้อมขาย", colorClass: "bg-emerald-100 text-emerald-700" };
  }
  if (s === "SOLD" || s === "SOLD_OUT") {
    return { text: "ขายแล้ว", colorClass: "bg-slate-200 text-slate-700" };
  }
  return { text: status || "-", colorClass: "bg-slate-100 text-slate-500" };
};

const sourceLabel = (sourceType: string): string => {
  const s = sourceType?.toUpperCase() || "";
  if (s === "PURCHASE" || s === "BUY_IN") return "รับซื้อ";
  if (s === "FORFEIT") return "ตัดหลุด";
  if (s === "CONSIGNMENT") return "ฝากขาย";
  return "-";
};

const formatMoney = (n: number | null | undefined) =>
  (Number(n ?? 0)).toLocaleString();

const InventoryPage: React.FC = () => {
  const navigate = useNavigate();

  const [items, setItems] = useState<InventoryItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<TabKey>("ALL");
  const [search, setSearch] = useState("");

  const fetchInventory = async () => {
    try {
      setLoading(true);
      const res = await axios.get<InventoryItemRow[]>("/api/inventory");
      setItems(res.data || []);
    } catch (err) {
      console.error("GET /api/inventory error:", err);
      alert("ไม่สามารถดึงข้อมูลคลังสินค้าได้");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInventory();
  }, []);

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  const filteredItems = items.filter((it) => {
    const text =
      (it.name || "") +
      " " +
      (it.serial || "") +
      " " +
      (it.code || "") +
      " " +
      sourceLabel(it.sourceType);

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!text.toLowerCase().includes(q)) return false;
    }

    const st = it.status?.toUpperCase() || "";

    if (tab === "READY") {
      const isReady =
        st === "IN_STOCK" || st === "READY" || st === "READY_FOR_SALE";
      return isReady;
    }
    if (tab === "SOLD") {
      const isSold = st === "SOLD" || st === "SOLD_OUT";
      return isSold;
    }
    return true; // ALL
  });

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">
              คลังสินค้า (Inventory)
            </h1>
            <p className="text-sm text-slate-500">
              จัดการสต๊อกสินค้า เตรียมพร้อมขาย และพิมพ์ใบเสร็จทีหลัง
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/intake/new")}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              + รับซื้อสินค้า (Buy In)
            </button>
            <button
              type="button"
              onClick={() => navigate("/inventory/bulk-sell")}
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              เปิดบิลหลายชิ้น
            </button>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl bg-white shadow-sm">
          {/* Tabs + Search */}
          <div className="flex items-center justify-between border-b border-slate-200 px-6 pt-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTab("ALL")}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  tab === "ALL"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                ทั้งหมด
              </button>
              <button
                type="button"
                onClick={() => setTab("READY")}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  tab === "READY"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                พร้อมขาย
              </button>
              <button
                type="button"
                onClick={() => setTab("SOLD")}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  tab === "SOLD"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                ขายแล้ว
              </button>
            </div>

            <div className="py-3">
              <input
                type="text"
                value={search}
                onChange={handleSearchChange}
                placeholder="ค้นหา (ชื่อสินค้า, Code, Serial)..."
                className="w-64 rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Table header */}
          <div className="grid grid-cols-12 border-b border-slate-200 px-6 py-3 text-xs font-medium text-slate-500">
            <div className="col-span-5">สินค้า</div>
            <div className="col-span-2">สถานะ</div>
            <div className="col-span-2">ที่มา</div>
            <div className="col-span-1 text-center">คงเหลือ</div>
            <div className="col-span-1 text-right">ราคาขาย</div>
            <div className="col-span-1 text-right">จัดการ</div>
          </div>

          {/* Table body */}
          {loading ? (
            <div className="px-6 py-8 text-center text-sm text-slate-500">
              กำลังโหลดข้อมูล...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="px-6 py-8 text-center text-sm text-slate-500">
              ไม่มีรายการสินค้าในคลัง
            </div>
          ) : (
            <div>
              {filteredItems.map((item) => {
                const st = statusLabel(item.status);
                return (
                  <div
                    key={item.id}
                    className="grid grid-cols-12 items-center border-t border-slate-100 px-6 py-4 text-sm"
                  >
                    {/* สินค้า */}
                    <div className="col-span-5">
                      <div className="font-medium text-slate-800">
                        {item.name || "-"}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        <span className="mr-2">
                          Code: <span className="font-mono">{item.code}</span>
                        </span>
                        {item.serial && (
                          <span>
                            SN:{" "}
                            <span className="font-mono">{item.serial}</span>
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[11px] text-slate-400">
                        เข้าเมื่อ:{" "}
                        {item.createdAt
                          ? new Date(
                              item.createdAt
                            ).toLocaleDateString("th-TH")
                          : "-"}
                        {" · "}
                        ทุนต่อชิ้น: {formatMoney(item.cost)} บาท
                      </div>
                    </div>

                    {/* สถานะ */}
                    <div className="col-span-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${st.colorClass}`}
                      >
                        {st.text}
                      </span>
                    </div>

                    {/* ที่มา */}
                    <div className="col-span-2 text-slate-600">
                      {sourceLabel(item.sourceType)}
                    </div>

                    {/* จำนวนคงเหลือ */}
                    <div className="col-span-1 text-center text-slate-700">
                      {item.quantityAvailable ?? 0}
                    </div>

                    {/* ราคาขาย */}
                    <div className="col-span-1 text-right font-semibold text-slate-800">
                      {formatMoney(item.sellingPrice || item.targetPrice)}
                    </div>

                    {/* จัดการ */}
                    <div className="col-span-1 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/inventory/sell/${item.id}`)
                        }
                        className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
                        disabled={
                          item.status?.toUpperCase() === "SOLD" ||
                          item.status?.toUpperCase() === "SOLD_OUT"
                        }
                      >
                        แจ้งขาย
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default InventoryPage;