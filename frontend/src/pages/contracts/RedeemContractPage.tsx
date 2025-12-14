// src/pages/contracts/RedeemContractPage.tsx
import React, { useEffect, useMemo, useState, FormEvent } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { getFinancialFromContract } from "../../utils/contractFinancial";
import { printRedemptionReceipt } from "../../utils/printHelpers";

type Contract = any;

const money = (v: any) => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
};

export const RedeemContractPage: React.FC = () => {
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

  // ตามโจทย์: ฟีถูกหักล่วงหน้าตอนทำสัญญา → ไถ่ถอน = คืนเงินต้นอย่างเดียว
  const redeemAmount = fin.principal;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (
    !window.confirm(
      `ยืนยันไถ่ถอนสัญญา ${contract.code} ใช่หรือไม่?\n` +
      `ระบบจะบันทึกเป็น "ไถ่ถอนสำเร็จ" และลง Cashbook ทันที`
     )
    ) {
      return; // ผู้ใช้กดยกเลิก
    }

    try {
      setSubmitting(true);
      const res = await axios.post(`/api/contracts/${id}/redeem`, {});
      const updated = res.data || contract;

      // เปิดใบเสร็จ
      printRedemptionReceipt(updated);

      navigate(`/contracts/${id}`);
    } catch (err) {
      console.error("ไถ่ถอนไม่สำเร็จ", err);
      alert("ไม่สามารถบันทึกการไถ่ถอนได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  };

  const assetTitle =
    contract.asset?.modelName || (contract as any).itemTitle || "-";
  const assetSerial =
    contract.asset?.serial || (contract as any).itemSerial || "-";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            ไถ่ถอนทรัพย์สิน (Redeem)
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
        {/* ซ้าย: สรุปข้อมูลลูกค้า + ทรัพย์สิน */}
        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-2xl bg-white p-4 shadow-sm text-xs">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">
              1. ข้อมูลสัญญา
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-[11px] text-slate-500">
                  ลูกค้า
                </div>
                <div className="font-semibold text-slate-900">
                  {contract.customer?.name || "-"}
                </div>
                <div className="text-[11px] text-slate-500">
                  เบอร์: {contract.customer?.phone || "-"}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">
                  วันครบกำหนด
                </div>
                <div className="font-semibold text-slate-900">
                  {contract.dueDate
                    ? new Date(
                        contract.dueDate
                      ).toLocaleDateString("th-TH")
                    : "-"}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm text-xs">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">
              2. รายการทรัพย์สิน
            </h2>
            <div>
              <div className="text-[11px] text-slate-500">ทรัพย์สิน</div>
              <div className="font-semibold text-slate-900">
                {assetTitle}
              </div>
              <div className="text-[11px] text-slate-500">
                SN: {assetSerial}
              </div>
            </div>
          </section>
        </div>

        {/* ขวา: สรุปยอดเงิน */} 
        <aside>
          <section className="sticky top-4 rounded-2xl bg-slate-900 p-4 text-slate-50 shadow-lg text-xs">
            <h2 className="mb-3 text-sm font-semibold">
              ยอดชำระเพื่อไถ่ถอน
            </h2>

            <div className="space-y-3">
              <div>
                <div className="text-[11px] text-slate-300">
                  เงินต้น (Principal) ที่ต้องคืนร้าน
                </div>
                <div className="mt-1 text-2xl font-semibold text-emerald-400">
                  {money(redeemAmount)} ฿
                </div>
                <div className="mt-1 text-[10px] text-slate-400">
                  * ค่าบริการรอบนี้ถูกหักจากยอดรับสุทธิตั้งแต่ตอนทำสัญญาแล้ว
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 w-full rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {submitting
                  ? "กำลังบันทึกการไถ่ถอน..."
                  : "ยืนยันรับเงินและพิมพ์ใบเสร็จ"}
              </button>
            </div>
          </section>
        </aside>
      </form>
    </div>
  );
};

export default RedeemContractPage;
