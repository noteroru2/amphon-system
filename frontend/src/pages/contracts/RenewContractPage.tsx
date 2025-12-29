// src/pages/contracts/RenewContractPage.tsx
import React, { useEffect, useMemo, useState, FormEvent } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { apiFetch } from "../../lib/api";
import { getFinancialFromContract } from "../../utils/contractFinancial";
import { calculateFee } from "../../utils/feeCalculator";

type Contract = {
  id: number;
  code: string;
  customer?: { name?: string };
  principal?: number;
  termDays?: number;
};

const money = (v: any) => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString();
};

function roundUpTo10(n: number) {
  const x = Number(n || 0);
  if (!Number.isFinite(x) || x <= 0) return 0;
  return Math.ceil(x / 10) * 10;
}

export const RenewContractPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ✅ รองรับ 7/15/30
  const [newPrincipal, setNewPrincipal] = useState<number>(0);
  const [newTermDays, setNewTermDays] = useState<7 | 15 | 30>(15);

  // ---------- โหลดสัญญาเดิม ----------
  useEffect(() => {
    if (!id) return;

    const fetchContract = async () => {
      try {
        setLoading(true);
        setErrorMsg(null);

        const c = await apiFetch<Contract>(`/contracts/${id}`);
        setContract(c);

        const fin = getFinancialFromContract(c);
        setNewPrincipal(fin.principal || 0);

        const td = Number(fin.termDays || 15);
        setNewTermDays(td === 7 || td === 30 ? (td as 7 | 30) : 15);
      } catch (err) {
        console.error("โหลดสัญญาไม่สำเร็จ", err);
        setErrorMsg("ไม่สามารถโหลดข้อมูลสัญญาได้");
      } finally {
        setLoading(false);
      }
    };

    fetchContract();
  }, [id]);

  const oldFin = useMemo(() => getFinancialFromContract(contract), [contract]);

  /**
   * ✅ ค่าบริการรอบใหม่ (รองรับ 7 วัน)
   * - ใช้ calculateFee(principal, 15) เป็นฐาน
   * - 7 วัน = total/2 แล้วปัดขึ้นหลัก 10
   * - breakdown (doc/storage/care) จะสเกลตามสัดส่วนของ total เพื่อให้ไม่เพี้ยน
   */
  const newFee = useMemo(() => {
    const p = Number(newPrincipal || 0);
    if (p <= 0) return { docFee: 0, storageFee: 0, careFee: 0, total: 0 };

    // base 15 วัน (ของเดิมคุณ)
    const fee15 = calculateFee(p, 15);

    if (newTermDays === 15) return fee15;

    if (newTermDays === 30) {
      // ถ้าสูตร 30 วันของคุณถูกอยู่แล้ว ใช้ตรงๆ
      return calculateFee(p, 30);
    }

    // ✅ 7 วัน: total = 15/2 แล้วปัดขึ้น 10
    const total7 = roundUpTo10(Number(fee15.total || 0) / 2);

    // สเกล breakdown ตามสัดส่วน เพื่อให้รวมแล้วได้ total7
    const baseTotal15 = Number(fee15.total || 0) || 0;
    if (baseTotal15 <= 0) {
      // กันหาร 0: fallback เป็น 0 ทั้งหมด
      return { docFee: 0, storageFee: 0, careFee: 0, total: 0 };
    }

    const ratio = total7 / baseTotal15;

    let docFee = Math.round((Number(fee15.docFee || 0) * ratio));
    let storageFee = Math.round((Number(fee15.storageFee || 0) * ratio));
    let careFee = Math.round((Number(fee15.careFee || 0) * ratio));

    // ปรับเศษให้รวมเท่ากับ total7
    let sum = docFee + storageFee + careFee;
    const diff = total7 - sum;
    careFee += diff; // โยนส่วนต่างไปที่ careFee

    // กันติดลบ
    if (docFee < 0) docFee = 0;
    if (storageFee < 0) storageFee = 0;
    if (careFee < 0) careFee = 0;

    return { docFee, storageFee, careFee, total: total7 };
  }, [newPrincipal, newTermDays]);

  const newFeeTotal = Number(newFee.total || 0);

  const principalDiff = (newPrincipal || 0) - (oldFin.principal || 0);

  // ---------- submit ----------
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!contract) return;

    const ok = window.confirm(
      `ยืนยันต่อสัญญา ${contract.code} ใช่หรือไม่?\n\n` +
        `ระบบจะสร้างสัญญาเล่มใหม่, ปิดเล่มเดิม และลง Cashbook ค่าบริการรอบใหม่ทันที\n` +
        `เงื่อนไขใหม่: ${newTermDays} วัน • ค่าบริการรวม ${money(newFeeTotal)} บาท`
    );
    if (!ok) return;

    try {
      setSubmitting(true);

      // ✅ แก้ payload ให้ backend อ่านถูก
      // backend: { termDays, feeConfig, principal }
      const payload = {
        principal: newPrincipal,
        termDays: newTermDays,
        feeConfig: newFee,
      };

      const newContract = await apiFetch<{ id: number }>(
        `/contracts/${contract.id}/renew`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      navigate(`/app/contracts/${newContract.id}`);
    } catch (err) {
      console.error("ต่อสัญญาไม่สำเร็จ", err);
      alert("ไม่สามารถบันทึกการต่อสัญญาได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- UI ----------
  if (loading) {
    return <div className="p-4 text-xs text-slate-500">กำลังโหลดข้อมูลสัญญา...</div>;
  }

  if (!contract || errorMsg) {
    return <div className="p-4 text-xs text-red-500">{errorMsg || "ไม่พบข้อมูลสัญญา"}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">ต่อสัญญาฝากดูแล</h1>
          <p className="text-xs text-slate-500">เลขที่สัญญาเดิม: {contract.code}</p>
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
            <h2 className="mb-2 text-sm font-semibold">สัญญาเดิม</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="text-[11px] text-slate-500">ลูกค้า</div>
                <div className="font-semibold">{contract.customer?.name || "-"}</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-500">วงเงินเดิม</div>
                <div className="font-semibold">{money(oldFin.principal)} ฿</div>
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm text-xs">
            <h2 className="mb-2 text-sm font-semibold">เงื่อนไขใหม่</h2>

            <label className="text-[11px] text-slate-600">วงเงินใหม่</label>
            <input
              type="number"
              value={newPrincipal}
              onChange={(e) => setNewPrincipal(Number(e.target.value || 0))}
              className="mt-1 w-full rounded-xl border px-3 py-2 text-xs"
            />

            <div className="mt-3 flex gap-2">
              {[7, 15, 30].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setNewTermDays(d as 7 | 15 | 30)}
                  className={`flex-1 rounded-xl px-3 py-2 text-xs ${
                    newTermDays === d ? "bg-red-600 text-white" : "bg-slate-100"
                  }`}
                >
                  {d} วัน
                </button>
              ))}
            </div>

            <div className="mt-4 text-sm font-semibold">
              ส่วนต่างทุน: {principalDiff >= 0 ? "+" : "-"}
              {money(Math.abs(principalDiff))} ฿
            </div>
          </section>
        </div>

        {/* ขวา */}
        <aside>
          <section className="sticky top-4 rounded-2xl bg-slate-900 p-4 text-slate-50">
            <h2 className="mb-3 text-sm font-semibold">ค่าบริการรอบใหม่</h2>

            <Row label="ค่าเอกสาร" value={Number(newFee.docFee || 0)} />
            <Row label="ค่าพื้นที่" value={Number(newFee.storageFee || 0)} />
            <Row label="ค่าดูแล" value={Number(newFee.careFee || 0)} />

            <div className="mt-2 border-t pt-2">รวม: {money(newFeeTotal)} บาท</div>

            <button
              type="submit"
              disabled={submitting}
              className="mt-3 w-full rounded-xl bg-red-600 py-2 text-white disabled:opacity-70"
            >
              {submitting ? "กำลังบันทึก..." : "ยืนยันต่อสัญญา"}
            </button>
          </section>
        </aside>
      </form>
    </div>
  );
};

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-xs">
      <span>{label}</span>
      <span>{money(value)} ฿</span>
    </div>
  );
}

export default RenewContractPage;
