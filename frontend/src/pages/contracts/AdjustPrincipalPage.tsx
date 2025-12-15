// src/pages/contracts/AdjustPrincipalPage.tsx
import React, { useEffect, useMemo, useState, FormEvent } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { getFinancialFromContract } from "../../utils/contractFinancial";
import { calculateFee } from "../../utils/feeCalculator";

type Contract = any;

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

  useEffect(() => {
    if (!id) return;

    const fetchContract = async () => {
      try {
        setLoading(true);
        setErrorMsg(null);

        const res = await axios.get(`/api/contracts/${id}`);
        // ✅ กันรูปแบบ payload: contract / {data: contract}
        const c = (res.data && (res.data.data || res.data)) ?? null;

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

  const fin = useMemo(() => getFinancialFromContract(contract), [contract]);

  const newPrincipal = Math.max((fin.principal || 0) - (cutAmount || 0), 0);

  const newFee = useMemo(
    () => calculateFee(newPrincipal, fin.termDays || 15),
    [newPrincipal, fin.termDays]
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
    if (cutAmount > (fin.principal || 0)) {
      alert("จำนวนที่ต้องการตัดมากกว่าวงเงินปัจจุบัน");
      return;
    }

    const ok = window.confirm(
      `ยืนยันตัดต้น ${cutAmount.toLocaleString("th-TH")} บาท จากสัญญา ${
        contract.code
      } ใช่หรือไม่?\n` + `หลังจากนี้ principal จะลดลง และระบบจะลง Cashbook ทันที`
    );
    if (!ok) return;

    try {
      setSubmitting(true);

      const payload = { cutAmount };

      await axios.post(`/api/contracts/${id}/cut-principal`, payload);

      // ✅ FIX: กลับไปหน้ารายละเอียดต้องเป็น /app/...
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
      <div className="p-4 text-xs text-slate-500">กำลังโหลดข้อมูลสัญญา...</div>
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
            เลขที่สัญญา: {contract.code || "-"}
          </p>
        </div>

        {/* ✅ FIX: ลิงก์ต้องเป็น /app/... */}
        <Link
          to={`/app/contracts/${contract.id}`}
          className="rounded-full border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
        >
          ← กลับไปหน้ารายละเอียด
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-3">
        {/* ซ้าย: สรุปทุนเดิม + ตัดต้น */}
        <div className="space-y-4 lg:col-span-2">
          <section className="rounded-2xl bg-white p-4 shadow-sm text-xs">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">
              1. ทุนเดิม และรายละเอียดสัญญา
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-[11px] text-slate-500">วงเงินประกันเดิม</div>
                <div className="font-semibold text-slate-900">
                  {money(fin.principal)} ฿
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">ระยะเวลาฝาก</div>
                <div className="font-semibold text-slate-900">
                  {fin.termDays} วัน
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">ค่าบริการรอบนี้ (เดิม)</div>
                <div className="font-semibold text-slate-900">
                  {money(fin.fee?.total)} ฿
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm text-xs">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">
              2. ระบุจำนวนตัดทุน
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-[11px] text-slate-600">
                  จำนวนที่ต้องการตัดทุน (บาท)
                </label>
                <input
                  type="number"
                  value={cutAmount || ""}
                  onChange={(e) => setCutAmount(Number(e.target.value || 0))}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                />
                <div className="mt-1 text-[10px] text-slate-400">
                  เมื่อตัดทุนแล้ว ลูกค้าจะได้รับเงินจำนวนนี้คืนไป
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-600 mb-1">
                  ทุนใหม่หลังตัด (New Principal)
                </div>
                <div className="text-xl font-semibold text-emerald-600">
                  {money(newPrincipal)} ฿
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ขวา: เปรียบเทียบค่าบริการเดิม/ใหม่ */}
        <aside>
          <section className="sticky top-4 rounded-2xl bg-slate-900 p-4 text-slate-50 shadow-lg text-xs">
            <h2 className="mb-3 text-sm font-semibold">เปรียบเทียบค่าบริการ</h2>

            <div className="space-y-3">
              <div className="rounded-xl bg-slate-800 p-3">
                <div className="mb-1 text-[11px] text-slate-300">เดิม (ก่อนตัดทุน)</div>
                <div className="flex justify-between text-[11px]">
                  <span>ค่าบริการรวม</span>
                  <span>{money(fin.fee?.total)} ฿</span>
                </div>
              </div>

              <div className="rounded-xl bg-slate-800 p-3">
                <div className="mb-1 text-[11px] text-slate-300">ใหม่ (หลังตัดทุน)</div>
                <div className="flex justify-between text-[11px]">
                  <span>ค่าบริการรวม</span>
                  <span>{money(newFee.total)} ฿</span>
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 p-3 text-slate-900">
                <div className="text-[11px] text-slate-500">
                  ลูกค้าได้รับเงินคืน (จากการตัดทุน)
                </div>
                <div className="mt-1 text-xl font-semibold text-emerald-600">
                  {money(cutAmount)} ฿
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 w-full rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {submitting ? "กำลังบันทึกการตัดทุน..." : "ยืนยันตัดทุนและบันทึก"}
              </button>
            </div>
          </section>
        </aside>
      </form>
    </div>
  );
};

export default AdjustPrincipalPage;
