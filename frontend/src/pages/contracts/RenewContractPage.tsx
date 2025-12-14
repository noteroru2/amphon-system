// src/pages/contracts/RenewContractPage.tsx
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

export const RenewContractPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // state สำหรับสัญญาใหม่
  const [newPrincipal, setNewPrincipal] = useState<number>(0);
  const [newTermDays, setNewTermDays] = useState<15 | 30>(15);

  useEffect(() => {
    if (!id) return;

    const fetchContract = async () => {
      try {
        setLoading(true);
        setErrorMsg(null);
        const res = await axios.get(`/api/contracts/${id}`);
        const c = res.data;
        setContract(c);

        const fin = getFinancialFromContract(c);
        setNewPrincipal(fin.principal || 0);
        setNewTermDays(fin.termDays === 30 ? 30 : 15);
      } catch (err) {
        console.error("โหลดสัญญาไม่สำเร็จ", err);
        setErrorMsg("ไม่สามารถโหลดข้อมูลสัญญาได้");
      } finally {
        setLoading(false);
      }
    };

    fetchContract();
  }, [id]);

  const oldFin = useMemo(
    () => getFinancialFromContract(contract),
    [contract]
  );

  const newFee = useMemo(
    () => calculateFee(newPrincipal || 0, newTermDays),
    [newPrincipal, newTermDays]
  );
  const newFeeTotal = newFee.total || 0;

  // ส่วนต่างทุน new - old
  const principalDiff = (newPrincipal || 0) - (oldFin.principal || 0);

  const handleSubmit = async (e: FormEvent) => {
  e.preventDefault();
 const ok = window.confirm(
    `ยืนยันต่อสัญญา ${contract.code} ใช่หรือไม่?\n\n` +
    `ระบบจะสร้างสัญญาเล่มใหม่, ปิดเล่มเดิม และลง Cashbook ค่าบริการรอบใหม่ทันที`
  );
  if (!ok) return;

  try {
    setSubmitting(true);

    const payload = {
      newPrincipal,
      termDays: newTermDays,
      feeConfig: newFee,
    };

    const res = await axios.post(`/api/contracts/${id}/renew`, payload);
    const newContract = res.data;

    if (newContract && newContract.id) {
      // ไปหน้าสัญญาใหม่ (เลขใหม่)
      navigate(`/contracts/${newContract.id}`);
    } else {
      // fallback กลับสัญญาเดิม
      navigate(`/contracts/${id}`);
    }
  } catch (err) {
    console.error("ต่อสัญญาไม่สำเร็จ", err);
    alert("ไม่สามารถบันทึกการต่อสัญญาได้ กรุณาลองใหม่อีกครั้ง");
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
            ต่อสัญญาฝากดูแล (Renew Contract)
          </h1>
          <p className="text-xs text-slate-500">
            เลขที่สัญญาเดิม: {contract.code || "-"}
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
        {/* ซ้าย: สรุปสัญญาเดิม + ป้อนสัญญาใหม่ */}
        <div className="space-y-4 lg:col-span-2">
          {/* กล่องสัญญาเดิม */}
          <section className="rounded-2xl bg-white p-4 shadow-sm text-xs">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">
              1. สัญญาเดิม
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-[11px] text-slate-500">เลขที่สัญญา</div>
                <div className="font-semibold text-slate-900">
                  {contract.code || "-"}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">
                  ลูกค้า
                </div>
                <div className="font-semibold text-slate-900">
                  {contract.customer?.name || "-"}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">
                  วงเงินประกันเดิม
                </div>
                <div className="font-semibold text-slate-900">
                  {money(oldFin.principal)} ฿
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">
                  ระยะเวลาฝากเดิม
                </div>
                <div className="font-semibold text-slate-900">
                  {oldFin.termDays} วัน
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">
                  ค่าบริการรอบเดิม (หักไปแล้ว)
                </div>
                <div className="font-semibold text-slate-900">
                  {money(oldFin.fee.total)} ฿
                </div>
              </div>
            </div>
          </section>

          {/* กล่องระบุเงื่อนไขสัญญาใหม่ */}
          <section className="rounded-2xl bg-white p-4 shadow-sm text-xs">
            <h2 className="mb-2 text-sm font-semibold text-slate-800">
              2. เงื่อนไขสัญญาใหม่
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-[11px] text-slate-600">
                  วงเงินประกันใหม่ (บาท)
                </label>
                <input
                  type="number"
                  value={newPrincipal || ""}
                  onChange={(e) =>
                    setNewPrincipal(Number(e.target.value || 0))
                  }
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                />
              </div>
              <div>
                <div className="text-[11px] text-slate-600 mb-1">
                  ระยะเวลาฝากใหม่
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setNewTermDays(15)}
                    className={`flex-1 rounded-xl px-3 py-2 text-xs ${
                      newTermDays === 15
                        ? "bg-red-600 text-white"
                        : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    15 วัน
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewTermDays(30)}
                    className={`flex-1 rounded-xl px-3 py-2 text-xs ${
                      newTermDays === 30
                        ? "bg-red-600 text-white"
                        : "bg-slate-100 text-slate-800"
                    }`}
                  >
                    30 วัน
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl bg-slate-50 p-3">
              <div className="text-[11px] text-slate-500">
                ส่วนต่างทุน (new - old)
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">
                {principalDiff >= 0 ? "+" : "-"}{money(Math.abs(principalDiff))} ฿
              </div>
              <div className="mt-1 text-[11px] text-slate-500">
                {principalDiff > 0
                  ? "ลูกค้าได้รับเงินเพิ่มจากร้าน"
                  : principalDiff < 0
                  ? "ลูกค้าคืนเงินบางส่วนให้ร้าน"
                  : "ทุนเท่าเดิม ไม่ต้องมีเงินรับ-จ่ายเพิ่ม"}
              </div>
            </div>
          </section>
        </div>

        {/* ขวา: สรุปค่าบริการรอบใหม่ */}
        <aside>
          <section className="sticky top-4 rounded-2xl bg-slate-900 p-4 text-slate-50 shadow-lg text-xs">
            <h2 className="mb-3 text-sm font-semibold">
              ค่าบริการรอบใหม่ (ประมาณการ)
            </h2>

            <div className="space-y-3">
              <div>
                <div className="text-[11px] text-slate-300">
                  วงเงินประกันใหม่
                </div>
                <div className="text-2xl font-semibold text-emerald-400">
                  {money(newPrincipal)} ฿
                </div>
              </div>

              <div className="rounded-xl bg-slate-800 p-3">
                <div className="mb-1 text-[11px] text-slate-200">
                  รายละเอียดค่าบริการ
                </div>
                <dl className="space-y-1 text-[11px] text-slate-300">
                  <Row label="ค่าเอกสาร" value={newFee.docFee} />
                  <Row
                    label="ค่าพื้นที่เก็บรักษา"
                    value={newFee.storageFee}
                  />
                  <Row label="ค่าดูแลรักษา" value={newFee.careFee} />
                </dl>
                <div className="mt-2 border-t border-slate-700 pt-2 text-[11px]">
                  รวมค่าบริการรอบใหม่:&nbsp;
                  <span className="font-semibold text-red-300">
                    {money(newFeeTotal)} บาท
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="mt-2 w-full rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {submitting ? "กำลังบันทึก..." : "ยืนยันต่อสัญญา"}
              </button>
            </div>
          </section>
        </aside>
      </form>
    </div>
  );
};

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd>{money(value)} ฿</dd>
    </div>
  );
}

export default RenewContractPage;
