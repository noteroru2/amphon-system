import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { arrayFromApi } from "../../lib/arrayFromApi";
import { Link } from "react-router-dom";

type Segment = "BUYER" | "CONSIGNOR" | "DEPOSITOR";

type CustomerRow = {
  id: number;
  name: string;
  idCard?: string | null;
  phone?: string | null;
  lineId?: string | null;
  address?: string | null;
  segments: Segment[]; // ต้องเป็น array เสมอ
};

function maskIdCard(v?: string | null) {
  if (!v) return "-";
  const s = v.replace(/\s/g, "");
  if (s.length < 6) return s;
  return s.slice(0, 1) + "-xxxx-xxxxx-xx-" + s.slice(-1);
}

// ✅ normalize แถวลูกค้าให้ปลอดภัย (กัน segments ไม่ใช่ array)
function normalizeCustomerRow(x: any): CustomerRow {
  return {
    id: Number(x?.id ?? 0),
    name: String(x?.name ?? ""),
    idCard: x?.idCard ?? null,
    phone: x?.phone ?? null,
    lineId: x?.lineId ?? null,
    address: x?.address ?? null,
    segments: Array.isArray(x?.segments) ? x.segments : [],
  };
}

export default function CustomersPage() {
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"ALL" | Segment>("ALL");
  const [err, setErr] = useState("");

  const fetchData = async (query = "") => {
    try {
      setErr("");
      setLoading(true);

      const res = await axios.get("/api/customers", {
        params: query ? { q: query } : undefined,
      });

      // ✅ normalize response ให้เป็น array เสมอ
      const list = arrayFromApi<any>(res.data).map(normalizeCustomerRow);
      setRows(list);
    } catch (e: any) {
      console.error(e);
      setErr(e?.response?.data?.message || e?.message || "โหลดข้อมูลลูกค้าไม่สำเร็จ");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData("");
  }, []);

  const safeRows = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);

  const counts = useMemo(() => {
    const all = safeRows.length;
    const buyer = safeRows.filter((r) => r.segments.includes("BUYER")).length;
    const consignor = safeRows.filter((r) => r.segments.includes("CONSIGNOR")).length;
    const depositor = safeRows.filter((r) => r.segments.includes("DEPOSITOR")).length;
    return { all, buyer, consignor, depositor };
  }, [safeRows]);

  const filtered = useMemo(() => {
    if (tab === "ALL") return safeRows;
    return safeRows.filter((r) => r.segments.includes(tab));
  }, [safeRows, tab]);

  const onSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetchData(q.trim());
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">ลูกค้าทั้งหมด</h1>
        </div>

        <form onSubmit={onSearch} className="mb-4 flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ค้นหา: ชื่อ / โทร / เลขบัตร / LINE"
            className="w-full rounded border px-3 py-2"
          />
          <button className="rounded bg-slate-900 px-4 py-2 text-white">ค้นหา</button>
        </form>

        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab("ALL")}
            className={`rounded px-3 py-2 text-sm shadow ${tab === "ALL" ? "bg-slate-900 text-white" : "bg-white"}`}
          >
            ทั้งหมด ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => setTab("BUYER")}
            className={`rounded px-3 py-2 text-sm shadow ${tab === "BUYER" ? "bg-slate-900 text-white" : "bg-white"}`}
          >
            ลูกค้ามาซื้อ ({counts.buyer})
          </button>
          <button
            type="button"
            onClick={() => setTab("CONSIGNOR")}
            className={`rounded px-3 py-2 text-sm shadow ${tab === "CONSIGNOR" ? "bg-slate-900 text-white" : "bg-white"}`}
          >
            ลูกค้ามาขาย/ฝากขาย ({counts.consignor})
          </button>
          <button
            type="button"
            onClick={() => setTab("DEPOSITOR")}
            className={`rounded px-3 py-2 text-sm shadow ${tab === "DEPOSITOR" ? "bg-slate-900 text-white" : "bg-white"}`}
          >
            ลูกค้ามาฝากดูแล ({counts.depositor})
          </button>
        </div>

        {err ? (
          <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
        ) : null}

        <div className="rounded bg-white shadow">
          <div className="border-b px-4 py-3 text-sm text-slate-600">
            {loading ? "กำลังโหลด..." : `แสดง ${filtered.length} รายการ`}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-4 py-3">ชื่อ</th>
                  <th className="px-4 py-3">โทร</th>
                  <th className="px-4 py-3">เลขบัตร</th>
                  <th className="px-4 py-3">กลุ่ม</th>
                  <th className="px-4 py-3">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-4 py-3 font-medium">{r.name || "-"}</td>
                    <td className="px-4 py-3">{r.phone || "-"}</td>
                    <td className="px-4 py-3">{maskIdCard(r.idCard)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {r.segments.includes("BUYER") ? (
                          <span className="rounded bg-emerald-50 px-2 py-1 text-xs text-emerald-700">มาซื้อ</span>
                        ) : null}
                        {r.segments.includes("CONSIGNOR") ? (
                          <span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">ขาย/ฝากขาย</span>
                        ) : null}
                        {r.segments.includes("DEPOSITOR") ? (
                          <span className="rounded bg-sky-50 px-2 py-1 text-xs text-sky-700">ฝากดูแล</span>
                        ) : null}
                        {r.segments.length === 0 ? (
                          <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">ยังไม่จัดกลุ่ม</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Link
                        to={`/app/customers/${r.id}`}
                        className="rounded bg-slate-900 px-3 py-2 text-xs text-white hover:opacity-90"
                      >
                        ดูรายละเอียด
                      </Link>
                    </td>
                  </tr>
                ))}

                {!loading && filtered.length === 0 ? (
                  <tr>
                    <td className="px-4 py-6 text-center text-slate-500" colSpan={5}>
                      ไม่พบข้อมูล
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          หมายเหตุ: กลุ่ม “ขาย/ฝากขาย” จะขึ้นเมื่อระบบมีข้อมูล consignment หรือ inventory source ที่ผูกกับลูกค้า
        </div>
      </div>
    </div>
  );
}
