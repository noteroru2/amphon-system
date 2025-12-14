// src/pages/contracts/ForfeitContractPage.tsx
import React, { useEffect, useMemo, useState, FormEvent } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { getFinancialFromContract } from "../../utils/contractFinancial";

type Contract = any;

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

  useEffect(() => {
    if (!id) return;

    const fetchContract = async () => {
      try {
        setLoading(true);
        setErrorMsg(null);
        const res = await axios.get(`/api/contracts/${id}`);
        setContract(res.data);
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

  const cost = fin.principal;
  const targetPrice = fin.principal + fin.fee.total;

  const images: string[] =
    contract.asset?.images ||
    contract.asset?.photos ||
    contract.images ||
    [];

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!id || submitting) return;

    if (
      !window.confirm(
        "ยืนยันตัดหลุดสัญญานี้? ทรัพย์สินจะถูกโอนเข้าคลังสินค้า"
      )
    ) {
      return;
    }

    try {
      setSubmitting(true);
      const res = await axios.post(`/api/contracts/${id}/forfeit`, {});
      const updated = res.data || contract;

      navigate("/deposit/list");
    } catch (err) {
      console.error("ตัดหลุดไม่สำเร็จ", err);
      alert("ไม่สามารถบันทึกการตัดหลุดได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  };

  const assetTitle =
    contract.asset?.modelName || (contract as any).itemTitle || "-";
  const assetSerial =
    contract.asset?.serial || (contract as any).itemSerial || "-";
  const storageCode =
    contract.asset?.storageCode || (contract as any).storageCode || "-";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            ยืนยันตัดหลุดสัญญา (Forfeit Contract)
          </h1>
          <p className="text-xs text-slate-500">
            เลขที่สัญญา: {contract.code || "-"}
          </p>
        </div>
        <Link
          to={`/contracts/${contract.id}`}
          className="rounded-full border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
        >
          ← กลับไปหน้ารายละเอียด
        </Link>
      </div>

      <form
        onSubmit={handleSubmit}
        className="grid gap-4 lg:grid-cols-3"
      >
        {/* ซ้าย: รายละเอียดทรัพย์ + รูป + คำเตือน */}
        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-2xl bg-white p-4 shadow-sm text-xs">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">
              1. รายละเอียดทรัพย์สินที่จะตัดหลุด
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-[11px] text-slate-500">
                  ทรัพย์สิน
                </div>
                <div className="font-semibold text-slate-900">
                  {assetTitle}
                </div>
                <div className="text-[11px] text-slate-500">
                  SN: {assetSerial}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">
                  กล่องเก็บ
                </div>
                <div className="font-semibold text-slate-900">
                  {storageCode}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm text-xs">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">
              2. รูปภาพประกอบสัญญา
            </h2>
            {images.length === 0 ? (
              <p className="text-[11px] text-slate-400">
                ยังไม่มีรูปภาพแนบในสัญญานี้
              </p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {images.map((src, idx) => (
                  <div
                    key={idx}
                    className="h-24 w-24 overflow-hidden rounded-xl border border-slate-200"
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
            <div className="mb-1 font-semibold">คำเตือนสำคัญ</div>
            <p>
              เมื่อกด{" "}
              <span className="font-semibold">ยืนยันตัดหลุด</span>{" "}
              สถานะสัญญาจะเปลี่ยนเป็น{" "}
              <span className="font-semibold">FORFEITED</span> และสินค้าจะถูก
              บันทึกเข้าคลังสินค้า (Inventory) พร้อมต้นทุน และราคาขายเป้าหมาย
              สำหรับขายต่อหน้าร้าน
            </p>
          </section>
        </div>

        {/* ขวา: การเงิน (Cost / Target Price) */}
        <aside>
          <section className="sticky top-4 rounded-2xl bg-slate-900 p-4 text-slate-50 shadow-lg text-xs">
            <h2 className="mb-3 text-sm font-semibold">
              ต้นทุนและราคาขายเป้าหมาย
            </h2>
            <div className="space-y-3">
              <div>
                <div className="text-[11px] text-slate-300">
                  ต้นทุนสินค้า (Cost)
                </div>
                <div className="mt-1 text-2xl font-semibold text-emerald-400">
                  {money(cost)} ฿
                </div>
                <div className="mt-1 text-[10px] text-slate-400">
                  ใช้จากวงเงินประกัน (principal) ที่ร้านจ่ายให้ลูกค้า
                </div>
              </div>

              <div className="rounded-xl bg-slate-800 p-3">
                <div className="text-[11px] text-slate-300">
                  ราคาขายเป้าหมาย (Target Price)
                </div>
                <div className="mt-1 text-xl font-semibold text-slate-50">
                  {money(targetPrice)} ฿
                </div>
                <div className="mt-1 text-[10px] text-slate-400">
                  = ต้นทุน + ค่าบริการที่ควรได้รับ (โดยประมาณ)
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 w-full rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {submitting
                  ? "กำลังบันทึกการตัดหลุด..."
                  : "ยืนยันตัดหลุดสัญญา"}
              </button>
            </div>
          </section>
        </aside>
      </form>
    </div>
  );
};

export default ForfeitContractPage;
