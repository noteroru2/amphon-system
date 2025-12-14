// frontend/src/pages/consignment/ConsignmentListPage.tsx
import React, { useEffect, useMemo, useState, ChangeEvent } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

type ConsignmentApiRow = {
  id: number;
  code: string;
  status?: string | null;

  sellerName?: string | null;
  sellerPhone?: string | null;

  itemName?: string | null;
  serial?: string | null;

  netToSeller?: any; // Decimal/string/number
  targetPrice?: any; // Decimal/string/number
  advanceAmount?: any;

  createdAt?: string;

  inventoryItem?: {
    id: number;
    code?: string | null;
    name?: string | null;
    serial?: string | null;
    status?: string | null;
    quantity?: number | null;
    quantityAvailable?: number | null;
    quantitySold?: number | null;
    targetPrice?: any;
    sellingPrice?: any;
  } | null;
};

const toNum = (v: any) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const fmtMoney = (v: any) => toNum(v).toLocaleString();

const fmtDate = (iso?: string) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("th-TH");
};

const isSold = (status?: string | null) => {
  const s = (status || "").toUpperCase();
  return s === "SOLD" || s === "SOLD_OUT";
};

const badge = (status?: string | null) => {
  const s = (status || "").toUpperCase();
  if (s === "ACTIVE" || s === "IN_STOCK" || s === "READY" || s === "READY_FOR_SALE") {
    return { text: "กำลังขาย", cls: "bg-emerald-100 text-emerald-700" };
  }
  if (s === "SOLD" || s === "SOLD_OUT") {
    return { text: "ขายแล้ว", cls: "bg-slate-200 text-slate-700" };
  }
  if (s === "CANCELLED") {
    return { text: "ยกเลิก", cls: "bg-rose-100 text-rose-700" };
  }
  return { text: status || "-", cls: "bg-slate-100 text-slate-500" };
};

export function ConsignmentListPage() {
  const navigate = useNavigate();

  const [rows, setRows] = useState<ConsignmentApiRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

    const fetchList = async () => {
    try {
      setLoading(true);

      const res = await axios.get("/api/consignments");
      const payload = res.data as any;

      // ✅ รองรับได้หลายรูปแบบ: array / {data: []} / {consignments: []} / {items: []}
      const list: ConsignmentApiRow[] =
        Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload?.consignments)
          ? payload.consignments
          : Array.isArray(payload?.items)
          ? payload.items
          : [];

      setRows(list);
    } catch (err) {
      console.error("GET /api/consignments error:", err);
      alert("ไม่สามารถดึงรายการฝากขายได้");
      setRows([]); // ✅ กัน state ค้าง
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    fetchList();
  }, []);

  const handleSearch = (e: ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  // ✅ แสดงเฉพาะ “ยังไม่ขาย”
  const activeRows = useMemo(() => {
    const q = search.trim().toLowerCase();

    return (Array.isArray(rows) ? rows : []).filter(...)

      .filter((r) => {
        // บางระบบ status อาจอยู่ที่ contract หรืออยู่ที่ inventoryItem
        const contractSold = isSold(r.status);
        const invSold = isSold(r.inventoryItem?.status);
        if (contractSold || invSold) return false;

        if (!q) return true;

        const text = [
          r.code,
          r.sellerName,
          r.sellerPhone,
          r.itemName,
          r.serial,
          r.inventoryItem?.code,
          r.inventoryItem?.name,
          r.inventoryItem?.serial,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return text.includes(q);
      })
      .sort((a, b) => {
        // ใหม่สุดก่อน
        const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return db - da;
      });
  }, [rows, search]);

  const countActive = activeRows.length;

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">รายการฝากขาย</h1>
            <p className="text-xs text-slate-500">
              แสดงเฉพาะรายการที่ยังไม่ขายออก ({countActive} รายการ)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => fetchList()}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              disabled={loading}
            >
              {loading ? "กำลังโหลด..." : "รีเฟรช"}
            </button>

            <button
              type="button"
              onClick={() => navigate("/consignments/new")}
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              + เพิ่มสัญญาฝากขาย
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="text-sm font-semibold text-slate-800">ค้นหา</div>
            <input
              value={search}
              onChange={handleSearch}
              placeholder="ค้นหา: เลขสัญญา / ชื่อลูกค้า / ชื่อสินค้า / Serial / รหัสสต๊อก"
              className="w-full md:w-[420px] rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
          <div className="grid grid-cols-12 border-b border-slate-200 px-6 py-3 text-[11px] font-semibold uppercase text-slate-500">
            <div className="col-span-3">สัญญา</div>
            <div className="col-span-3">ลูกค้า</div>
            <div className="col-span-3">สินค้า</div>
            <div className="col-span-1 text-right">คงเหลือ</div>
            <div className="col-span-2 text-right">เงื่อนไข</div>
          </div>

          {loading ? (
            <div className="px-6 py-10 text-center text-sm text-slate-500">กำลังโหลดข้อมูล...</div>
          ) : activeRows.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-slate-500">
              ยังไม่มีรายการฝากขายที่กำลังขายอยู่
            </div>
          ) : (
            <div>
              {activeRows.map((c) => {
                const inv = c.inventoryItem;
                const qtyAvail = Number(inv?.quantityAvailable ?? inv?.quantity ?? 0);
                const statusForBadge = c.status || inv?.status || "ACTIVE";
                const st = badge(statusForBadge);

                const displaySeller = c.sellerName || "-";
                const displayPhone = c.sellerPhone || "";
                const displayItem = c.itemName || inv?.name || "-";
                const displaySerial = c.serial || inv?.serial || "";
                const displayInvCode = inv?.code || "";

                const netToSeller = fmtMoney(c.netToSeller);
                const target = fmtMoney(c.targetPrice ?? inv?.targetPrice);

                return (
                  <div
                    key={c.id}
                    className="grid grid-cols-12 items-center border-t border-slate-100 px-6 py-4 text-sm"
                  >
                    {/* Contract */}
                    <div className="col-span-3">
                      <div className="flex items-center gap-2">
                        <div className="font-semibold text-slate-800">{c.code}</div>
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>
                          {st.text}
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        วันที่สร้าง: {fmtDate(c.createdAt)}
                      </div>
                    </div>

                    {/* Seller */}
                    <div className="col-span-3">
                      <div className="font-medium text-slate-800">{displaySeller}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {displayPhone ? `โทร: ${displayPhone}` : "—"}
                      </div>
                    </div>

                    {/* Item */}
                    <div className="col-span-3">
                      <div className="font-medium text-slate-800">{displayItem}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {displayInvCode && (
                          <span className="mr-2">
                            Stock: <span className="font-mono">{displayInvCode}</span>
                          </span>
                        )}
                        {displaySerial && (
                          <span>
                            SN: <span className="font-mono">{displaySerial}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Qty */}
                    <div className="col-span-1 text-right">
                      <div className="font-semibold text-slate-800">{qtyAvail || 0}</div>
                      <div className="text-[11px] text-slate-500">ชิ้น</div>
                    </div>

                    {/* Money/Terms */}
                    <div className="col-span-2 text-right">
                      <div className="text-xs text-slate-600">
                        ลูกค้าได้สุทธิ/ชิ้น: <span className="font-semibold text-slate-800">{netToSeller}</span>
                      </div>
                      <div className="text-xs text-slate-600">
                        ราคาตั้งขาย/ชิ้น: <span className="font-semibold text-slate-800">{target}</span>
                      </div>

                      <div className="mt-2 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => navigate("/inventory")}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          ไปคลัง
                        </button>

                        {/* เผื่ออนาคตทำ detail */}
                        <button
                           type="button"
                           onClick={(e) => { e.stopPropagation(); navigate(`/consignments/${c.id}`); }}
                           className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                          จัดการ
                          </button>
                      </div>
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
}
