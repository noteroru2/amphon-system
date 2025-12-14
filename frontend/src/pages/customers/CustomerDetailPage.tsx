import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";

type Segment = "BUYER" | "CONSIGNOR" | "DEPOSITOR";

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

export default function CustomerDetailPage() {
  const id = Number(window.location.pathname.split("/").pop());

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
      const res = await axios.get(`/api/customers/${id}`);
      setCustomer(res.data.customer);
      setDepositContracts(res.data.depositContracts || []);
      setInventoryItemsBought(res.data.inventoryItemsBought || []);
      setConsignments(res.data.consignments || []);
      setSalesOrders(res.data.salesOrders || []);
    } catch (e: any) {
      console.error(e);
      setErr(e?.response?.data?.message || e?.message || "โหลดรายละเอียดลูกค้าไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (Number.isFinite(id)) fetchData();
    else setErr("customer id ไม่ถูกต้อง");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const badges = useMemo(() => {
    const s = customer?.segments || [];
    return {
      buyer: s.includes("BUYER"),
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
          <a href="/customers" className="text-sm text-slate-600 underline">
            ← กลับหน้าลูกค้า
          </a>
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
        <div className="mb-4 flex items-center justify-between">
          <div>
            <a href="/customers" className="text-sm text-slate-600 underline">
              ← กลับหน้าลูกค้า
            </a>
            <h1 className="mt-2 text-xl font-semibold">{customer.name}</h1>

            <div className="mt-2 flex flex-wrap gap-2">
              {badges.buyer ? (
                <span className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700">มาซื้อ</span>
              ) : null}
              {badges.consignor ? (
                <span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">ขาย/ฝากขาย</span>
              ) : null}
              {badges.depositor ? (
                <span className="rounded bg-sky-50 px-2 py-1 text-xs text-sky-700">ฝากดูแล</span>
              ) : null}
              {!customer.segments?.length ? (
                <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">ยังไม่จัดกลุ่ม</span>
              ) : null}
            </div>
          </div>

          <div className="flex gap-2">
            <a href={`/customers`} className="rounded bg-white px-3 py-2 text-sm shadow hover:bg-slate-50">
              รายการลูกค้า
            </a>
          </div>
        </div>

        {/* ข้อมูลส่วนตัว */}
        <div className="rounded bg-white p-4 shadow">
          <h2 className="mb-3 font-semibold">ข้อมูลส่วนตัว</h2>
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <div className="text-xs text-slate-500">โทร</div>
              <div className="text-sm">{customer.phone || "-"}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">เลขบัตร</div>
              <div className="text-sm">{customer.idCard || "-"}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">LINE</div>
              <div className="text-sm">{customer.lineId || "-"}</div>
            </div>
            <div className="md:col-span-3">
              <div className="text-xs text-slate-500">ที่อยู่</div>
              <div className="text-sm">{customer.address || "-"}</div>
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
            <div className="text-xs text-slate-500">มาซื้อ (Inventory)</div>
            <div className="text-xl font-semibold">{inventoryItemsBought.length}</div>
          </div>
          <div className="rounded bg-white p-4 shadow">
            <div className="text-xs text-slate-500">ฝากขาย/ขาย</div>
            <div className="text-xl font-semibold">{consignments.length}</div>
          </div>
          <div className="rounded bg-white p-4 shadow">
            <div className="text-xs text-slate-500">Sales Orders</div>
            <div className="text-xl font-semibold">{salesOrders.length}</div>
          </div>
        </div>

        {/* ฝากดูแล */}
        <div className="mt-4 rounded bg-white shadow">
          <div className="border-b px-4 py-3 font-semibold">ประวัติฝากดูแล</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-4 py-3">รหัส</th>
                  <th className="px-4 py-3">ประเภท</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">เงินต้น</th>
                  <th className="px-4 py-3">ครบกำหนด</th>
                </tr>
              </thead>
              <tbody>
                {depositContracts.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="px-4 py-3">{c.code}</td>
                    <td className="px-4 py-3">{c.type}</td>
                    <td className="px-4 py-3">{c.status}</td>
                    <td className="px-4 py-3">{c.principal}</td>
                    <td className="px-4 py-3">
                      {c.dueDate ? new Date(c.dueDate).toLocaleDateString() : "-"}
                    </td>
                  </tr>
                ))}
                {depositContracts.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={5}>
                      ไม่มีประวัติฝากดูแล
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {/* มาซื้อ */}
        <div className="mt-4 rounded bg-white shadow">
          <div className="border-b px-4 py-3 font-semibold">ประวัติมาซื้อ (Inventory Items Bought)</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-4 py-3">รหัส</th>
                  <th className="px-4 py-3">ชื่อสินค้า</th>
                  <th className="px-4 py-3">Serial</th>
                  <th className="px-4 py-3">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {inventoryItemsBought.map((it: any) => (
                  <tr key={it.id} className="border-t">
                    <td className="px-4 py-3">{it.code || it.id}</td>
                    <td className="px-4 py-3">{it.name || "-"}</td>
                    <td className="px-4 py-3">{it.serial || "-"}</td>
                    <td className="px-4 py-3">{it.status || "-"}</td>
                  </tr>
                ))}
                {inventoryItemsBought.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={4}>
                      ไม่มีประวัติมาซื้อ
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {/* ฝากขาย/ขาย */}
        <div className="mt-4 rounded bg-white shadow">
          <div className="border-b px-4 py-3 font-semibold">ประวัติขาย/ฝากขาย</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-4 py-3">รหัส</th>
                  <th className="px-4 py-3">สินค้า</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3">จำนวน</th>
                  <th className="px-4 py-3">ตั้งขาย</th>
                </tr>
              </thead>
              <tbody>
                {consignments.map((cs: any) => (
                  <tr key={cs.id} className="border-t">
                    <td className="px-4 py-3">{cs.code || cs.id}</td>
                    <td className="px-4 py-3">{cs.itemName || cs.inventoryItem?.name || "-"}</td>
                    <td className="px-4 py-3">{cs.status || "-"}</td>
                    <td className="px-4 py-3">{cs.quantity ?? cs.inventoryItem?.quantity ?? "-"}</td>
                    <td className="px-4 py-3">{cs.targetPrice ?? cs.inventoryItem?.targetPrice ?? "-"}</td>
                  </tr>
                ))}
                {consignments.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={5}>
                      ไม่มีประวัติขาย/ฝากขาย (หรือระบบยังไม่มีตาราง consignments)
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sales orders (ถ้ามี) */}
        <div className="mt-4 rounded bg-white shadow">
          <div className="border-b px-4 py-3 font-semibold">ประวัติการขาย (Sales Orders)</div>
          <div className="px-4 py-4 text-sm text-slate-600">
            {salesOrders.length === 0 ? "ไม่มีข้อมูล (หรือระบบยังไม่มี salesOrder model)" : "มีรายการขาย"}
          </div>
        </div>
      </div>
    </div>
  );
}
