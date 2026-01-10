// frontend/src/pages/customers/CustomerDetailPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, getApiErrorMessage } from "../../lib/api";

type Segment = "BUYER" | "SELLER" | "CONSIGNOR" | "DEPOSITOR";

type Customer = {
  id: number;
  name: string;
  idCard?: string | null;
  phone?: string | null;
  lineId?: string | null;
  lineUserId?: string | null;
  address?: string | null;
  createdAt?: string;
  updatedAt?: string;
  segments: Segment[];
};

type Counts = {
  depositContracts?: number;
  inventoryBought?: number;
  inventorySold?: number;
  consignments?: number;
};

const normalizeSegments = (s: any): Segment[] => {
  if (!Array.isArray(s)) return [];
  const allowed = new Set<Segment>(["BUYER", "SELLER", "CONSIGNOR", "DEPOSITOR"]);
  return s
    .map((x) => String(x || "").trim().toUpperCase())
    .filter((x) => allowed.has(x as Segment)) as Segment[];
};

const fmtMoney = (n: any) => {
  const x = Number(n ?? 0);
  if (!Number.isFinite(x)) return "-";
  return x.toLocaleString();
};

const fmtDate = (v?: string) => {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const arr = <T,>(v: any): T[] => (Array.isArray(v) ? (v as T[]) : []);

export default function CustomerDetailPage() {
  const params = useParams();
  const id = Number(params.id);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [counts, setCounts] = useState<Counts>({});

  const [depositContracts, setDepositContracts] = useState<any[]>([]);
  const [inventoryItemsBought, setInventoryItemsBought] = useState<any[]>([]);
  const [inventoryItemsSold, setInventoryItemsSold] = useState<any[]>([]);
  const [consignments, setConsignments] = useState<any[]>([]);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);

  const fetchData = async () => {
    try {
      setErr("");
      setLoading(true);

      const res = await api.get(`/api/customers/${id}`);
      const data = res?.data || {};
      const c = data?.customer;

      if (!c) throw new Error("ไม่พบ customer ใน response");

      setCustomer({
        ...c,
        segments: normalizeSegments(c?.segments),
      });

      setCounts(data?.counts || {});

      const lists = data?.lists || {};

      // ✅ ใช้ length เป็นตัวตัดสินใจ fallback (สำคัญมาก)
      const depositFromLists = arr<any>(lists.depositContracts);
      const depositFromOld = arr<any>(data.depositContracts);
      const deposit = depositFromLists.length ? depositFromLists : depositFromOld;

      const boughtFromLists = arr<any>(lists.inventoryBought);
      const boughtFromOld = arr<any>(data.inventoryItemsBought);
      const bought = boughtFromLists.length ? boughtFromLists : boughtFromOld;

      const soldFromLists = arr<any>(lists.inventorySold);
      const soldFromOld = arr<any>(data.inventoryItemsSold);
      const sold = soldFromLists.length ? soldFromLists : soldFromOld;

      const consFromLists = arr<any>(lists.consignments);
      const consFromOld = arr<any>(data.consignments);
      const cons = consFromLists.length ? consFromLists : consFromOld;

      setDepositContracts(deposit);
      setInventoryItemsBought(bought);
      setInventoryItemsSold(sold);
      setConsignments(cons);
      setSalesOrders(arr<any>(data.salesOrders));
    } catch (e: any) {
      console.error(e);
      setErr(getApiErrorMessage(e) || "โหลดรายละเอียดลูกค้าไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (Number.isFinite(id)) fetchData();
    else setErr("customer id ไม่ถูกต้อง");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const badges = useMemo(() => {
    const s = customer?.segments || [];
    return {
      buyer: s.includes("BUYER"),
      seller: s.includes("SELLER"),
      consignor: s.includes("CONSIGNOR"),
      depositor: s.includes("DEPOSITOR"),
    };
  }, [customer]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100">
        <div className="mx-auto max-w-6xl px-6 py-6">กำลังโหลด...</div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="min-h-screen bg-slate-100">
        <div className="mx-auto max-w-6xl px-6 py-6">
          <Link to="/app/customers" className="text-sm text-slate-600 underline">
            ← กลับหน้าลูกค้า
          </Link>
          <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {err}
          </div>
        </div>
      </div>
    );
  }

  if (!customer) return null;

  const depositCount = counts.depositContracts ?? depositContracts.length;
  const boughtCount = counts.inventoryBought ?? inventoryItemsBought.length;
  const soldCount = counts.inventorySold ?? inventoryItemsSold.length;
  const consignCount = counts.consignments ?? consignments.length;

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-6">
        {/* Header */}
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link to="/app/customers" className="text-sm text-slate-600 underline">
              ← กลับหน้าลูกค้า
            </Link>
            <h1 className="mt-2 text-xl font-semibold">{customer.name}</h1>

            <div className="mt-2 flex flex-wrap gap-2">
              {badges.buyer && (
                <span className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700">มาซื้อ</span>
              )}
              {badges.seller && (
                <span className="rounded bg-orange-50 px-2 py-1 text-xs text-orange-700">มาขาย</span>
              )}
              {badges.consignor && (
                <span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">ฝากขาย</span>
              )}
              {badges.depositor && (
                <span className="rounded bg-sky-50 px-2 py-1 text-xs text-sky-700">ฝากดูแล</span>
              )}
              {!customer.segments.length && (
                <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">ยังไม่จัดกลุ่ม</span>
              )}
            </div>

            <div className="mt-3 space-y-1 text-xs text-slate-600">
              <div>บัตรประชาชน: {customer.idCard || "-"}</div>
              <div>โทร: {customer.phone || "-"}</div>
              <div>LINE: {customer.lineId || customer.lineUserId || "-"}</div>
              <div>ที่อยู่: {customer.address || "-"}</div>
              <div className="text-[11px] text-slate-400">
                สร้างเมื่อ: {fmtDate(customer.createdAt)} • อัปเดต: {fmtDate(customer.updatedAt)}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Link
              to={`/app/deposit/new?customerId=${customer.id}`}
              className="rounded-full bg-red-600 px-4 py-2 text-xs font-medium text-white"
            >
              + รับฝากใหม่
            </Link>
          </div>
        </div>

        {/* Summary counts */}
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">ฝากดูแล</div>
            <div className="text-xl font-semibold">{depositCount}</div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">มาซื้อ</div>
            <div className="text-xl font-semibold">{boughtCount}</div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">มาขาย</div>
            <div className="text-xl font-semibold">{soldCount}</div>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="text-xs text-slate-500">ฝากขาย</div>
            <div className="text-xl font-semibold">{consignCount}</div>
          </div>
        </div>

        {/* ฝากดูแล */}
        <div className="mt-6 rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">ฝากดูแล (ล่าสุด)</h2>
            <Link to={`/app/deposit?customerId=${customer.id}`} className="text-xs text-blue-600 underline">
              ดูทั้งหมด
            </Link>
          </div>

          {depositContracts.length === 0 ? (
            <div className="mt-3 text-xs text-slate-500">ไม่มีรายการฝากดูแล</div>
          ) : (
            <div className="mt-3 divide-y">
              {depositContracts.map((c: any) => (
                <Link
                  key={c.id}
                  to={`/app/contracts/${c.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-3 hover:bg-slate-50"
                >
                  <div>
                    <div className="text-sm font-medium">{c.code}</div>
                    <div className="text-xs text-slate-500">
                      {c.assetModel || "-"} • SN {c.assetSerial || "-"} • กล่อง {c.storageCode || "-"}
                    </div>
                    <div className="text-[11px] text-slate-400">ครบกำหนด: {fmtDate(c.dueDate)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">{fmtMoney(c.principal)} ฿</div>
                    <div className="text-xs text-slate-500">{String(c.status || "")}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* มาซื้อ */}
        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">มาซื้อ (ล่าสุด)</h2>
            <Link to={`/app/inventory?buyerCustomerId=${customer.id}`} className="text-xs text-blue-600 underline">
              ดูทั้งหมด
            </Link>
          </div>

          {inventoryItemsBought.length === 0 ? (
            <div className="mt-3 text-xs text-slate-500">ไม่มีรายการซื้อ</div>
          ) : (
            <div className="mt-3 divide-y">
              {inventoryItemsBought.map((it: any) => (
                <Link
                  key={it.id}
                  to={`/app/inventory/${it.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-3 hover:bg-slate-50"
                >
                  <div>
                    <div className="text-sm font-medium">{it.code || `#${it.id}`}</div>
                    <div className="text-xs text-slate-500">
                      {it.name} • SN {it.serial || "-"}
                    </div>
                    <div className="text-[11px] text-slate-400">วันที่: {fmtDate(it.createdAt)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">{fmtMoney(it.sellingPrice)} ฿</div>
                    <div className="text-xs text-slate-500">{String(it.status || "")}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* มาขายให้ร้าน */}
        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">มาขายให้ร้าน (ล่าสุด)</h2>
            <Link to={`/app/inventory?sellerCustomerId=${customer.id}`} className="text-xs text-blue-600 underline">
              ดูทั้งหมด
            </Link>
          </div>

          {inventoryItemsSold.length === 0 ? (
            <div className="mt-3 text-xs text-slate-500">ไม่มีรายการขายให้ร้าน</div>
          ) : (
            <div className="mt-3 divide-y">
              {inventoryItemsSold.map((it: any) => (
                <Link
                  key={it.id}
                  to={`/app/inventory/${it.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-3 hover:bg-slate-50"
                >
                  <div>
                    <div className="text-sm font-medium">{it.code || `#${it.id}`}</div>
                    <div className="text-xs text-slate-500">
                      {it.name} • SN {it.serial || "-"}
                    </div>
                    <div className="text-[11px] text-slate-400">วันที่: {fmtDate(it.createdAt)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">ทุน {fmtMoney(it.cost)} ฿</div>
                    <div className="text-xs text-slate-500">{String(it.status || "")}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* ฝากขาย */}
        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">ฝากขาย (ล่าสุด)</h2>
            <Link to={`/app/consignments?customerId=${customer.id}`} className="text-xs text-blue-600 underline">
              ดูทั้งหมด
            </Link>
          </div>

          {consignments.length === 0 ? (
            <div className="mt-3 text-xs text-slate-500">ไม่มีรายการฝากขาย</div>
          ) : (
            <div className="mt-3 divide-y">
              {consignments.map((cs: any) => {
                const inv = cs.inventoryItem;
                const to = inv?.id ? `/app/inventory/${inv.id}` : `/app/consignments/${cs.id}`;

                return (
                  <Link
                    key={cs.id}
                    to={to}
                    className="flex items-center justify-between gap-3 rounded-lg px-2 py-3 hover:bg-slate-50"
                  >
                    <div>
                      <div className="text-sm font-medium">{cs.code || `#${cs.id}`}</div>
                      <div className="text-xs text-slate-500">
                        {cs.itemName || inv?.name || "-"} • SN {cs.serial || inv?.serial || "-"}
                      </div>
                      <div className="text-[11px] text-slate-400">วันที่: {fmtDate(cs.createdAt)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold">ตั้งขาย {fmtMoney(cs.targetPrice)} ฿</div>
                      <div className="text-xs text-slate-500">{String(cs.status || "")}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Sales Orders */}
        <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Sales Orders</h2>
            <span className="text-xs text-slate-400">ยังไม่เปิดใช้งาน</span>
          </div>

          {salesOrders.length === 0 ? (
            <div className="mt-3 text-xs text-slate-500">ไม่มีรายการ</div>
          ) : (
            <div className="mt-3 text-xs text-slate-600">TODO</div>
          )}
        </div>
      </div>
    </div>
  );
}
