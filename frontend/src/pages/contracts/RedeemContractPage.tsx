// src/pages/contracts/RedeemContractPage.tsx
import React, { useEffect, useMemo, useState, FormEvent } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { apiFetch } from "../../lib/api";
import { getFinancialFromContract } from "../../utils/contractFinancial";
import { printRedemptionReceipt } from "../../utils/printHelpers";

type Contract = {
  id: number;
  code: string;
  dueDate?: string;
  customer?: {
    name?: string;
    phone?: string;
  };
  asset?: {
    modelName?: string;
    serial?: string;
  };
  itemTitle?: string;
  itemSerial?: string;
};

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

  // ตามกติกาธุรกิจ: ฟีถูกหักตอนทำสัญญา → ไถ่ถอน = จ่ายเงินต้น
  const redeemAmount = fin.principal || 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const ok = window.confirm(
      `ยืนยันไถ่ถอนสัญญา ${contract.code} ใช่หรือไม่?\n\n` +
        `ระบบจะบันทึกเป็น "ไถ่ถอนสำเร็จ" และลง Cashbook ทันที`
    );
    if (!ok) return;

    try {
      setSubmitting(true);

      const updated = await apiFetch<Contract>(
        `/contracts/${contract.id}/redeem`,
        { method: "POST" }
      );

      // พิมพ์ใบเสร็จ
      printRedemptionReceipt(updated);

      navigate(`/app/contracts/${contract.id}`);
    } catch (err) {
      console.error("ไถ่ถอนไม่สำเร็จ", err);
      alert("ไม่สามารถบันทึกการไถ่ถอนได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  };

  const assetTitle =
    contract.asset?.modelName || contract.itemTitle || "-";
  const assetSerial =
    contract.asset?.serial || contract.itemSerial || "-";

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            ไถ่ถอนทรัพย์สิน
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
              ข้อมูลสัญญา
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-[11px] text-slate-500">ลูกค้า</div>
                <div className="font-semibold">
                  {contract.customer?.name || "-"}
                </div>
                <div className="text-[11px] text-slate-500">
                  เบอร์: {contract.customer?.phone || "-"}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">วันครบกำหนด</div>
                <div className="font-semibold">
                  {contract.dueDate
                    ? new Date(contract.dueDate).toLocaleDateString("th-TH")
                    : "-"}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm text-xs">
            <h2 className="mb-2 text-sm font-semibold">
              ทรัพย์สิน
            </h2>
            <div>
              <div className="font-semibold">{assetTitle}</div>
              <div className="text-[11px] text-slate-500">
                SN: {assetSerial}
              </div>
            </div>
          </section>
        </div>

        {/* ขวา */}
        <aside>
          <section className="sticky top-4 rounded-2xl bg-slate-900 p-4 text-slate-50 shadow-lg text-xs">
            <h2 className="mb-3 text-sm font-semibold">
              ยอดชำระเพื่อไถ่ถอน
            </h2>

            <div className="text-2xl font-semibold text-emerald-400">
              {money(redeemAmount)} ฿
            </div>
            <div className="mt-1 text-[10px] text-slate-400">
              * ค่าบริการถูกหักล่วงหน้าแล้วตอนทำสัญญา
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-3 w-full rounded-xl bg-red-600 py-2 text-sm text-white disabled:opacity-60"
            >
              {submitting
                ? "กำลังบันทึก..."
                : "ยืนยันรับเงินและพิมพ์ใบเสร็จ"}
            </button>
          </section>
        </aside>
      </form>
    </div>
  );
};

export default RedeemContractPage;
