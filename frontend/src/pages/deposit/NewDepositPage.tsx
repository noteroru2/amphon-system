import React, { useState, useEffect, useRef, FormEvent, ChangeEvent } from "react";
import { useNavigate } from "react-router-dom";
import { calculateFee } from "../../utils/feeCalculator";
import { apiFetch } from "../../lib/api";

type FeeBreakdown = {
  docFee: number;
  storageFee: number;
  careFee: number;
  total: number;
};

type CustomerState = {
  name: string;
  idCard: string;
  phone: string;
  lineId: string;
  address: string;
  
};

type AssetState = {
  modelName: string;
  serial: string;
  condition: string;
  accessories: string;
  storageCode: string;
};

type FinancialState = {
  principal: number;
  termDays: 15 | 30;
  feeBreakdown: FeeBreakdown;
  feeTotal: number;
  netReceive: number;
};

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string); // "data:image/...;base64,..."
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const NewDepositPage: React.FC = () => {
  const navigate = useNavigate();

  const [customer, setCustomer] = useState<CustomerState>({
    name: "",
    idCard: "",
    phone: "",
    lineId: "",
    address: "",
   
  });

  const [asset, setAsset] = useState<AssetState>({
    modelName: "",
    serial: "",
    condition: "",
    accessories: "",
    storageCode: "",
  });

  const [images, setImages] = useState<string[]>([]);

  const [financial, setFinancial] = useState<FinancialState>(() => {
    const base: FeeBreakdown = { docFee: 0, storageFee: 0, careFee: 0, total: 0 };
    return {
      principal: 0,
      termDays: 15,
      feeBreakdown: base,
      feeTotal: 0,
      netReceive: 0,
    };
  });

  const [showSuccess, setShowSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const idCardInputRef = useRef<HTMLInputElement | null>(null);

  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // ---------- โหลดเลขกล่อง AUTO ----------
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<{ storageCode?: string; nextStorageCode?: string }>(
          "/contracts/next-storage-code"
        );
        const code = res?.storageCode || res?.nextStorageCode || "A-001";
        setAsset((prev) => ({
          ...prev,
          storageCode: prev.storageCode || code,
        }));
      } catch (err) {
        console.error("โหลดเลขกล่องเก็บไม่สำเร็จ", err);
      }
    })();
  }, []);

  // ---------- คิดค่าบริการ ----------
  const recalcFinancial = (principal: number, termDays: 15 | 30) => {
    const breakdown = calculateFee(principal, termDays);
    const feeTotal = breakdown.total;
    const netReceive = Math.max(principal - feeTotal, 0);

    setFinancial({
      principal,
      termDays,
      feeBreakdown: breakdown,
      feeTotal,
      netReceive,
    });
  };

  const handlePrincipalChange = (value: number) => {
    recalcFinancial(value, financial.termDays);
  };

  const handleTermChange = (days: 15 | 30) => {
    recalcFinancial(financial.principal, days);
  };

  // ---------- อัพโหลดรูปทรัพย์สิน ----------
  const handleImagesChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !files.length) return;

    const dataUrls: string[] = [];

    for (const file of Array.from(files)) {
      try {
        const dataUrl = await fileToDataUrl(file);
        dataUrls.push(dataUrl);
      } catch (err) {
        console.error("แปลงรูปเป็น base64 ไม่สำเร็จ", err);
      }
    }

    setImages((prev) => [...prev, ...dataUrls]);
    e.target.value = "";
  };

  // ---------- สแกนบัตร ปชช. ----------
  const handleIdCardFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setScanError(null);
      setScanLoading(true);

      const dataUrl = await fileToDataUrl(file);
      const [, base64Part] = dataUrl.split(",");
      const pureBase64 = base64Part || dataUrl;

      const payload = {
        imageBase64: pureBase64,
        imageDataUrl: dataUrl,
        mimeType: file.type,
        fileName: file.name,
      };

      const res = await apiFetch<any>("/ai/ocr-idcard", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const payloadRes = (res && (res.data || res)) || {};

      const name =
        payloadRes.name || payloadRes.fullName || payloadRes.full_name || customer.name;

      const idCard =
        payloadRes.idCard ||
        payloadRes.idCardNumber ||
        payloadRes.citizenId ||
        customer.idCard;

      const address =
        payloadRes.address ||
        payloadRes.fullAddress ||
        payloadRes.addressFull ||
        customer.address;

      setCustomer((prev) => ({
        ...prev,
        name: name || prev.name,
        idCard: idCard || prev.idCard,
        address: address || prev.address,
      }));
    } catch (err: any) {
      console.error("OCR /ai/ocr-idcard error", err);
      setScanError(err?.message ? `อ่านบัตรไม่สำเร็จ: ${err.message}` : "ไม่สามารถอ่านบัตรได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setScanLoading(false);
      e.target.value = "";
    }
  };

  // ---------- บันทึกสัญญา ----------
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    const ok = window.confirm(
      `ยืนยันทำสัญญาใหม่ใช่หรือไม่?\n\n` +
        `ระบบจะสร้างสัญญาฝากดูแล, ลง Cashbook (เงินจ่ายสุทธิ), และบันทึกข้อมูลลูกค้าและทรัพย์สินทันที`
    );
    if (!ok) return;

    try {
      setSubmitting(true);
      setShowSuccess(false);

      let storageCode = asset.storageCode.trim();
      if (!storageCode) {
        const resCode = await apiFetch<{ storageCode?: string; nextStorageCode?: string }>(
          "/contracts/next-storage-code"
        );
        storageCode = resCode?.storageCode || resCode?.nextStorageCode || "A-001";
      }

      const payload = {
        type: "DEPOSIT",
        customer,
        asset: { ...asset, storageCode },
        financial: {
          principal: financial.principal,
          termDays: financial.termDays,
          feeBreakdown: financial.feeBreakdown,
        },
        images,
      };

      console.log(">>> [NewDeposit] payload:", payload);

      const created = await apiFetch<{ id: number }>("/contracts", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setShowSuccess(true);

      if (created?.id) {
        // ✅ ตาม blueprint: /app/...
        navigate(`/app/contracts/${created.id}`);
      } else {
        navigate("/app/deposit/list");
      }
    } catch (err: any) {
      console.error("บันทึกสัญญาไม่สำเร็จ", err);
      alert(err?.message || "ไม่สามารถบันทึกสัญญาได้ กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- UI ----------
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">
            ทำสัญญาฝากดูแล (New Deposit)
          </h1>
          <p className="text-xs text-slate-500">
            กรอกข้อมูลเพื่อทำสัญญาฝากดูแลทรัพย์สินกับลูกค้า
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-3" autoComplete="off">
        {/* ซ้าย: ข้อมูลลูกค้า + ทรัพย์สิน */}
        <div className="space-y-4 lg:col-span-2">
          {/* ข้อมูลลูกค้า */}
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">
                1. ข้อมูลลูกค้า (ผู้ฝาก)
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => idCardInputRef.current?.click()}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                >
                  {scanLoading ? "กำลังสแกนบัตร..." : "สแกนบัตร ปชช."}
                </button>
                <input
                  ref={idCardInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleIdCardFile}
                />
              </div>
            </div>

            {scanError && <p className="mb-2 text-[11px] text-red-600">{scanError}</p>}

            <div className="grid gap-3 md:grid-cols-2">
              <TextInput
                label="ชื่อ-นามสกุล"
                value={customer.name}
                onChange={(v) => setCustomer({ ...customer, name: v })}
                placeholder="เช่น นายสมชาย ใจดี"
              />
              <TextInput
                label="เลขบัตรประชาชน"
                value={customer.idCard}
                onChange={(v) => setCustomer({ ...customer, idCard: v })}
                placeholder="13 หลัก"
              />
              <TextInput
                label="เบอร์โทรศัพท์"
                value={customer.phone}
                onChange={(v) => setCustomer({ ...customer, phone: v })}
                placeholder="เช่น 081-234-5678"
              />
              <TextInput
                label="Line ID"
                value={customer.lineId}
                onChange={(v) => setCustomer({ ...customer, lineId: v })}
                placeholder="เช่น @customer"
              />
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-[2fr,1fr]">
              <TextArea
                label="ที่อยู่ติดต่อ"
                value={customer.address}
                onChange={(v) => setCustomer({ ...customer, address: v })}
                placeholder="ที่อยู่ตามที่สามารถติดต่อได้"
              />
              
            </div>
          </section>

          {/* ข้อมูลทรัพย์สิน */}
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">
              2. รายละเอียดทรัพย์สิน (ASSET)
            </h2>

            <div className="grid gap-3 md:grid-cols-2">
              <TextInput
                label="ชื่อทรัพย์สิน / รุ่น"
                value={asset.modelName}
                onChange={(v) => setAsset({ ...asset, modelName: v })}
                placeholder="เช่น iPhone 15 Pro Max"
              />
              <TextInput
                label="SERIAL NUMBER / IMEI"
                value={asset.serial}
                onChange={(v) => setAsset({ ...asset, serial: v })}
                placeholder="เลข Serial หรือ IMEI"
              />
              <TextInput
                label="สภาพสินค้า"
                value={asset.condition}
                onChange={(v) => setAsset({ ...asset, condition: v })}
                placeholder="เช่น จอมีรอยเล็กน้อย ตัวเครื่องสวย"
              />
              <TextInput
                label="อุปกรณ์ที่มาด้วย"
                value={asset.accessories}
                onChange={(v) => setAsset({ ...asset, accessories: v })}
                placeholder="เช่น สายชาร์จ, หัวชาร์จ, กล่อง"
              />
              <TextInput
                label="กล่อง/เลขที่เก็บ (AUTO)"
                value={asset.storageCode}
                onChange={(v) => setAsset({ ...asset, storageCode: v })}
                placeholder="เช่น A-001"
              />
            </div>

            {/* อัพโหลดรูปหลายรูป */}
            <div className="mt-4">
              <label className="mb-1 block text-[11px] font-medium text-slate-700">
                รูปภาพสินค้า (เก็บเป็นหลักฐาน)
              </label>
              <div className="flex flex-wrap items-start gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-24 w-24 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 text-[11px] text-slate-500 hover:bg-slate-50"
                >
                  <span className="text-xl">＋</span>
                  <span>เพิ่มรูป</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleImagesChange}
                />
                {images.map((src, idx) => (
                  <div
                    key={idx}
                    className="relative h-24 w-24 overflow-hidden rounded-xl border border-slate-200"
                  >
                    <img src={src} alt={`asset-${idx}`} className="h-full w-full object-cover" />
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-slate-400">
                สามารถเพิ่มได้หลายรูป เช่น รอบตัวเครื่อง, รอยตำหนิ, รูปหน้าจอ
              </p>
            </div>
          </section>
        </div>

        {/* ขวา: กล่องคำนวณการเงิน */}
        <aside className="space-y-4">
          <section className="sticky top-4 rounded-2xl bg-slate-900 p-4 text-slate-50 shadow-lg">
            <h2 className="mb-3 text-sm font-semibold">ด้านคำนวณยอดเงินฝาก</h2>

            <div className="space-y-3 text-xs">
              <div>
                <label className="mb-1 block text-[11px] text-slate-300">
                  วงเงินประกัน (SECURITY DEPOSIT)
                </label>
                <input
                  type="number"
                  value={financial.principal || ""}
                  onChange={(e) => handlePrincipalChange(Number(e.target.value || 0))}
                  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none ring-red-500 focus:border-red-500 focus:ring-2"
                />
              </div>

              <div className="text-[11px] text-slate-300">ระยะเวลาฝาก (TERM)</div>
              <div className="flex gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => handleTermChange(15)}
                  className={`flex-1 rounded-xl px-3 py-2 ${
                    financial.termDays === 15 ? "bg-red-600 text-white" : "bg-slate-800 text-slate-200"
                  }`}
                >
                  15 วัน
                </button>
                <button
                  type="button"
                  onClick={() => handleTermChange(30)}
                  className={`flex-1 rounded-xl px-3 py-2 ${
                    financial.termDays === 30 ? "bg-red-600 text-white" : "bg-slate-800 text-slate-200"
                  }`}
                >
                  30 วัน (x2)
                </button>
              </div>

              <div className="mt-2 rounded-xl bg-slate-800 p-3">
                <div className="mb-1 text-[11px] font-semibold text-slate-200">
                  หัก ค่าบริการ (Deduction)
                </div>
                <dl className="space-y-1 text-[11px] text-slate-300">
                  <Row label="ค่าเอกสาร" value={financial.feeBreakdown.docFee} />
                  <Row label="ค่าพื้นที่เก็บรักษา" value={financial.feeBreakdown.storageFee} />
                  <Row label="ค่าดูแลรักษา" value={financial.feeBreakdown.careFee} />
                </dl>
                <div className="mt-2 border-t border-slate-700 pt-2 text-[11px] text-slate-200">
                  รวมค่าบริการ:&nbsp;
                  <span className="font-semibold text-red-300">
                    {financial.feeTotal.toLocaleString()} บาท
                  </span>
                </div>
              </div>

              <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-slate-900">
                <div className="text-[11px] text-slate-500">ยอดรับสุทธิ (NET RECEIVE)</div>
                <div className="text-2xl font-semibold text-emerald-600">
                  {financial.netReceive.toLocaleString()} ฿
                </div>
                <div className="mt-1 text-[10px] text-slate-400">
                  * จำนวนเงินที่ลูกค้าได้รับหลังหักค่าบริการทั้งหมดในรอบนี้
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="mt-3 w-full rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-red-700 disabled:opacity-60"
              >
                {submitting ? "กำลังบันทึก..." : "บันทึกสัญญา (CREATE)"}
              </button>
            </div>
          </section>

          {showSuccess && (
            <div className="rounded-2xl bg-emerald-50 p-3 text-xs text-emerald-700">
              บันทึกสัญญาสำเร็จ — ขั้นถัดไปสามารถพิมพ์สัญญา และส่งใบเสร็จดิจิทัลให้ลูกค้าได้
            </div>
          )}
        </aside>
      </form>
    </div>
  );
};

export default NewDepositPage;

// ---------- small components ----------
function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-slate-700">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
      />
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-slate-700">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={4}
        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt>{label}</dt>
      <dd>{value.toLocaleString()} ฿</dd>
    </div>
  );
}
