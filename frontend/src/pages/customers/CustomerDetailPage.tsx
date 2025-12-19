import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, getApiErrorMessage } from "../../lib/api";

/** ✅ รองรับ SELLER จาก backend */
type Segment = "BUYER" | "SELLER" | "CONSIGNOR" | "DEPOSITOR";

type Customer = {
  id: number;
  name: string;
  idCard?: string | null;
  phone?: string | null;
  lineId?: string | null;
  lineToken?: string | null;
  address?: string | null;
  createdAt?: string;
  updatedAt?: string;
  segments: Segment[];
};

const normalizeSegments = (s: any): Segment[] => {
  if (!Array.isArray(s)) return [];
  const allowed = new Set<Segment>(["BUYER", "SELLER", "CONSIGNOR", "DEPOSITOR"]);
  return s
    .map((x) => String(x || "").trim().toUpperCase())
    .filter((x) => allowed.has(x as Segment)) as Segment[];
};

export default function CustomerDetailPage() {
  const params = useParams();
  const id = Number(params.id);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [depositContracts, setDepositContracts] = useState<any[]>([]);
  const [inventoryItemsBought, setInventoryItemsBought] = useState<any[]>([]);
  const [consignments, setConsignments] = useState<any[]>([]);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);

  const fetchData = async () => {
    try {
      setErr("");
      setLoading(true);

      const res = await api.get(`/api/customers/${id}`);

      setCustomer({
        ...res.data.customer,
        segments: normalizeSegments(res.data.customer?.segments),
      });
      setDepositContracts(res.data.depositContracts || []);
      setInventoryItemsBought(res.data.inventoryItemsBought || []);
      setConsignments(res.data.consignments || []);
      setSalesOrders(res.data.salesOrders || []);
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
      sellOrConsign: s.includes("SELLER") || s.includes("CONSIGNOR"),
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

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-6">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <Link to="/app/customers" className="text-sm text-slate-600 underline">
              ← กลับหน้าลูกค้า
            </Link>
            <h1 className="mt-2 text-xl font-semibold">{customer.name}</h1>

            <div className="mt-2 flex flex-wrap gap-2">
              {badges.buyer && (
                <span className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
                  มาซื้อ
                </span>
              )}
              {badges.seller && (
                <span className="rounded bg-orange-50 px-2 py-1 text-xs text-orange-700">
                  มาขาย
                </span>
              )}
              {badges.consignor && (
                <span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
                  ฝากขาย
                </span>
              )}
              {badges.depositor && (
                <span className="rounded bg-sky-50 px-2 py-1 text-xs text-sky-700">
                  ฝากดูแล
                </span>
              )}
              {!customer.segments.length && (
                <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
                  ยังไม่จัดกลุ่ม
                </span>
              )}
            </div>
          </div>
        </div>

        {/* สรุปจำนวน */}
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="rounded bg-white p-4 shadow">
            <div className="text-xs text-slate-500">ฝากดูแล</div>
            <div className="text-xl font-semibold">{depositContracts.length}</div>
          </div>
          <div className="rounded bg-white p-4 shadow">
            <div className="text-xs text-slate-500">มาซื้อ</div>
            <div className="text-xl font-semibold">{inventoryItemsBought.length}</div>
          </div>
          <div className="rounded bg-white p-4 shadow">
            <div className="text-xs text-slate-500">ขาย / ฝากขาย</div>
            <div className="text-xl font-semibold">
              {badges.sellOrConsign ? consignments.length || 1 : 0}
            </div>
          </div>
          <div className="rounded bg-white p-4 shadow">
            <div className="text-xs text-slate-500">Sales Orders</div>
            <div className="text-xl font-semibold">{salesOrders.length}</div>
          </div>
        </div>

        {/* ส่วนตารางต่าง ๆ ใช้ของเดิมได้ ไม่ต้องแก้ */}
      </div>
    </div>
  );
}
