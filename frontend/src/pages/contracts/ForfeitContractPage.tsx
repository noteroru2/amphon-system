// src/pages/contracts/ForfeitContractPage.tsx
import React, { useEffect, useMemo, useState, FormEvent } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { apiFetch } from "../../lib/api";
import { getFinancialFromContract } from "../../utils/contractFinancial";

type Contract = {
  id: number;
  code: string;
  customer?: {
    name?: string;
  };
  asset?: {
    modelName?: string;
    serial?: string;
    storageCode?: string;
  };
  itemTitle?: string;
  itemSerial?: string;
  storageCode?: string;
  images?: string[];
};

const money = (v: any) => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
};

export const ForfeitContractPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ---------- load contract ----------
  useEffect(() => {
    if (!id) return;

    const fetchContract = async () => {
      try {
        setLoading(true);
        setErrorMsg(null);

        const c = await apiFetch<Contract>(`/contracts/${id}`);
        setContract(c);
      } catch (err) {
        console.error("โหลดสัญญาไม่สำเร็จ", err);
        setErrorMsg("ไม่สามารถโหลดข้อมูลสัญญาได้");
      } finally {
        setLoading(false);
      }
    };

    fetchContract();
  }, [id]);

  const fin = useMemo(
    () => getFinancialFromContract(contract),
    [contract]
  );

  if (loading) {
    return (
      <div className="p-4 text-xs text-slate-500">
        กำลังโหลดข้อมูลสัญญา...
      </div>
    );
  }

  if (!contract || errorMsg) {
    return (
      <div className="p-4 text-xs text-red-500">
        {errorMsg || "ไม่พบข้อมูลสัญญา"}
      </div>
    );
  }

  // ---------- business logic ----------
  const cost = fin.principal || 0;
  const targetPrice = cost + (fin.fee?.total || 0);

  const images: string[] = Array.isArray(contract.images)
    ? contract.images.filter((x) => typeof x === "string")
    : [];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!id || submitting) return;

    const ok = window.confirm(
      "ยืนยันตัดหลุดสัญญานี้?\n\nทรัพย์สินจะถูกโอนเข้าคลังสินค้า (Inventory)"
    );
    if (!ok) return;

    try {
      setSubmitting(true);

      await apiFetch(`/contracts/${id}/forfeit`, {
        method: "POST",
      });

      // กลับหน้ารายการรับฝาก
      navigate("/app/deposit/list");
    } catch (err) {
      console.error("ตัดหลุดไม่สำเร็จ", err);
      alert("ไม่สามารถบันทึกการตัดหลุดได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  };

  const assetTitle =
    contract.asset?.modelName || contract.itemTitle || "-";
  const assetSerial =
    contract.asset?.serial || contract.itemSerial || "-";
  const storageCode =
    contract.asset?.storageCode || contract.storageCode || "-";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            ยืนยันตัดหลุดสัญญา
          </h1>
          <p className="text-xs text-slate-500">
            เลขที่สัญญา: {contract.code}
          </p>
        </div>
        <Link
          to={`/app/contracts/${contract.id}`}
          className="rounded-full border px-3 py-1.5 text-xs"
        >
          ← กลับหน้ารายละเอียด
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-3">
        {/* ซ้าย */}
        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-2xl bg-white p-4 shadow-sm text-xs">
            <h2 className="mb-2 text-sm font-semibold">
              รายละเอียดทรัพย์สิน
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-[11px] text-slate-500">ทรัพย์สิน</div>
                <div className="font-semibold">{assetTitle}</div>
                <div className="text-[11px] text-slate-500">
                  SN: {assetSerial}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">กล่องเก็บ</div>
                <div className="font-semibold">{storageCode}</div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm text-xs">
            <h2 className="mb-2 text-sm font-semibold">
              รูปภาพประกอบสัญญา
            </h2>
            {images.length === 0 ? (
              <div className="text-[11px] text-slate-400">
                ยังไม่มีรูปภาพแนบในสัญญานี้
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {images.map((src, idx) => (
                  <div
                    key={idx}
                    className="h-24 w-24 overflow-hidden rounded-xl border"
                  >
                    <img
                      src={src}
                      alt={`asset-${idx}`}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl bg-amber-50 p-4 text-xs text-amber-900">
            <div className="font-semibold mb-1">คำเตือน</div>
            เมื่อยืนยันตัดหลุด สัญญาจะถูกเปลี่ยนเป็น{" "}
            <b>FORFEITED</b> และทรัพย์สินจะถูกสร้างเป็นสินค้าในคลัง
          </section>
        </div>

        {/* ขวา */}
        <aside>
          <section className="sticky top-4 rounded-2xl bg-slate-900 p-4 text-slate-50 shadow-lg text-xs">
            <h2 className="mb-3 text-sm font-semibold">
              ต้นทุนและราคาขายเป้าหมาย
            </h2>

            <div className="text-2xl font-semibold text-emerald-400">
              {money(cost)} ฿
            </div>
            <div className="text-[10px] text-slate-400">
              ต้นทุนจากวงเงินประกัน
            </div>

            <div className="mt-3 rounded-xl bg-slate-800 p-3">
              <div className="text-[11px] text-slate-300">
                ราคาขายเป้าหมาย
              </div>
              <div className="text-xl font-semibold">
                {money(targetPrice)} ฿
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-3 w-full rounded-xl bg-red-600 py-2 text-sm text-white disabled:opacity-60"
            >
              {submitting ? "กำลังบันทึก..." : "ยืนยันตัดหลุดสัญญา"}
            </button>
          </section>
        </aside>
      </form>
    </div>
  );
};

export default ForfeitContractPage;
