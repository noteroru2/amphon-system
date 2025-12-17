// src/pages/contracts/AdjustPrincipalPage.tsx
import React, { useEffect, useMemo, useState, FormEvent } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { apiFetch } from "../../lib/api";
import { getFinancialFromContract } from "../../utils/contractFinancial";
import { calculateFee } from "../../utils/feeCalculator";

type Contract = {
  id: number;
  code: string;
  principal?: number;
  termDays?: number;
  feeConfig?: {
    total?: number;
  };
};

const money = (v: any) => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
};

export const AdjustPrincipalPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [cutAmount, setCutAmount] = useState<number>(0);

  // ---------- load contract ----------
  useEffect(() => {
    if (!id) return;

    const fetchContract = async () => {
      try {
        setLoading(true);
        setErrorMsg(null);

        const c = await apiFetch<Contract>(`/contracts/${id}`);
        setContract(c);
        setCutAmount(0);
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

  const principalBefore = fin.principal || 0;
  const termDays = fin.termDays || 15;

  const newPrincipal = Math.max(principalBefore - (cutAmount || 0), 0);

  const newFee = useMemo(
    () => calculateFee(newPrincipal, termDays),
    [newPrincipal, termDays]
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!cutAmount || cutAmount <= 0) {
      alert("กรุณากรอกจำนวนเงินที่จะตัดต้นให้ถูกต้อง");
      return;
    }
    if (!contract?.id) {
      alert("ไม่พบข้อมูลสัญญา");
      return;
    }
    if (cutAmount > principalBefore) {
      alert("จำนวนที่ต้องการตัดมากกว่าวงเงินปัจจุบัน");
      return;
    }

    const ok = window.confirm(
      `ยืนยันตัดต้น ${money(cutAmount)} บาท จากสัญญา ${contract.code} ใช่หรือไม่?\n\n` +
        `หลังจากนี้ principal จะลดลง และระบบจะบันทึก Cashbook ทันที`
    );
    if (!ok) return;

    try {
      setSubmitting(true);

      await apiFetch(`/contracts/${id}/cut-principal`, {
        method: "POST",
        body: JSON.stringify({ cutAmount }),
      });

      // กลับไปหน้ารายละเอียดสัญญา
      navigate(`/app/contracts/${id}`);
    } catch (err) {
      console.error("ตัดต้นไม่สำเร็จ", err);
      alert("ไม่สามารถบันทึกการตัดต้นได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  };

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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            ตัดทุนประกัน (Cut Principal)
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
              ทุนเดิมของสัญญา
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-[11px] text-slate-500">วงเงินเดิม</div>
                <div className="font-semibold">
                  {money(principalBefore)} ฿
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">ระยะเวลา</div>
                <div className="font-semibold">{termDays} วัน</div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm text-xs">
            <h2 className="mb-2 text-sm font-semibold">
              ระบุจำนวนตัดต้น
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-[11px] text-slate-600">
                  จำนวนเงินที่ตัด (บาท)
                </label>
                <input
                  type="number"
                  value={cutAmount || ""}
                  onChange={(e) =>
                    setCutAmount(Number(e.target.value || 0))
                  }
                  className="mt-1 w-full rounded-xl border px-3 py-2 text-xs"
                />
              </div>
              <div>
                <div className="text-[11px] text-slate-600">
                  ทุนใหม่หลังตัด
                </div>
                <div className="text-xl font-semibold text-emerald-600">
                  {money(newPrincipal)} ฿
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ขวา */}
        <aside>
          <section className="sticky top-4 rounded-2xl bg-slate-900 p-4 text-slate-50 text-xs">
            <h2 className="mb-3 text-sm font-semibold">
              เปรียบเทียบค่าบริการ
            </h2>

            <div className="space-y-2">
              <div className="flex justify-between">
                <span>ค่าบริการเดิม</span>
                <span>{money(fin.fee?.total)} ฿</span>
              </div>
              <div className="flex justify-between">
                <span>ค่าบริการใหม่</span>
                <span>{money(newFee.total)} ฿</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-3 w-full rounded-xl bg-red-600 py-2 text-sm text-white disabled:opacity-60"
            >
              {submitting ? "กำลังบันทึก..." : "ยืนยันตัดต้น"}
            </button>
          </section>
        </aside>
      </form>
    </div>
  );
};

export default AdjustPrincipalPage;
