// src/pages/intake/NewIntakePage.tsx
import React, { useEffect, useMemo, useState, ChangeEvent, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api"; // axios instance ชี้ backend

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

type BuyInForm = {
  sellerName: string;
  sellerIdCard: string;
  sellerPhone: string;
  sellerAddress: string;
  sellerLineId: string;

  brandModel: string;
  serial: string;
  condition: string;
  accessories: string;

  quantity: string;
  unitPrice: string;   // ราคาต่อชิ้น
  targetPrice: string; // ราคาตั้งขายต่อชิ้น

  notes: string;
};

type EvidenceType = "product" | "idcard" | "contract";

const toNum = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const NewIntakePage: React.FC = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState<BuyInForm>({
    sellerName: "",
    sellerIdCard: "",
    sellerPhone: "",
    sellerAddress: "",
    sellerLineId: "",

    brandModel: "",
    serial: "",
    condition: "",
    accessories: "",

    quantity: "1",
    unitPrice: "",
    targetPrice: "",

    notes: "",
  });

  // รูปยังเก็บไว้เป็น “หลักฐานใน UI” ได้ แต่ intake แบบใหม่ยังไม่ส่งขึ้น backend
  const [productFiles, setProductFiles] = useState<FileList | null>(null);
  const [idCardFiles, setIdCardFiles] = useState<FileList | null>(null);
  const [contractFiles, setContractFiles] = useState<FileList | null>(null);

  const [productPreview, setProductPreview] = useState<string | null>(null);
  const [idCardPreview, setIdCardPreview] = useState<string | null>(null);
  const [contractPreview, setContractPreview] = useState<string | null>(null);

  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    return () => {
      if (productPreview) URL.revokeObjectURL(productPreview);
      if (idCardPreview) URL.revokeObjectURL(idCardPreview);
      if (contractPreview) URL.revokeObjectURL(contractPreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const setPreviewSafe = (
    setter: (v: string | null) => void,
    prev: string | null,
    next: string
  ) => {
    if (prev) URL.revokeObjectURL(prev);
    setter(next);
  };

  const handleFileChange =
    (type: EvidenceType) => async (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const first = files[0];
      const url = URL.createObjectURL(first);

      if (type === "product") {
        setProductFiles(files);
        setPreviewSafe(setProductPreview, productPreview, url);
        return;
      }

      if (type === "idcard") {
        setIdCardFiles(files);
        setPreviewSafe(setIdCardPreview, idCardPreview, url);

        // OCR ทันทีจากรูปแรก
        runOcrIdCard(first).catch((err) => console.error("runOcrIdCard error:", err));
        return;
      }

      setContractFiles(files);
      setPreviewSafe(setContractPreview, contractPreview, url);
    };

  const runOcrIdCard = async (file: File) => {
    try {
      setOcrError(null);
      setOcrLoading(true);

      const dataUrl = await fileToBase64(file);
      const [, base64Part] = dataUrl.split(",");
      const pureBase64 = base64Part || dataUrl;

      const payload = {
        imageBase64: pureBase64,
        imageDataUrl: dataUrl,
        mimeType: file.type,
        fileName: file.name,
      };

      const res = await api.post("/api/ai/ocr-idcard", payload, {
        headers: { "Content-Type": "application/json" },
      });

      const d = (res.data && (res.data.data || res.data)) || {};

      const name = d.name || d.fullName || d.full_name || "";
      const idCard = d.idCard || d.id_card || d.idCardNumber || d.citizenId || "";
      const address = d.address || d.fullAddress || d.addressFull || "";

      setForm((prev) => ({
        ...prev,
        sellerName: name || prev.sellerName,
        sellerIdCard: idCard || prev.sellerIdCard,
        sellerAddress: address || prev.sellerAddress,
      }));
    } catch (err: any) {
      console.error("/api/ai/ocr-idcard error", err);
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        "ไม่สามารถอ่านบัตรได้ กรุณาลองใหม่อีกครั้ง";
      setOcrError(msg);
    } finally {
      setOcrLoading(false);
    }
  };

  const qtyNum = useMemo(() => Math.max(1, Math.floor(toNum(form.quantity || "1"))), [form.quantity]);
  const unitNum = useMemo(() => toNum(form.unitPrice || "0"), [form.unitPrice]);
  const targetNum = useMemo(() => toNum(form.targetPrice || "0"), [form.targetPrice]);

  // ✅ cost ใน schema เป็น “ทุนรวมของ lot”
  const totalCost = useMemo(() => {
    const x = qtyNum * unitNum;
    return Number.isFinite(x) ? x : 0;
  }, [qtyNum, unitNum]);

  const money = (n: number) => Number(n || 0).toLocaleString("th-TH");

  const validate = (): string | null => {
    if (!form.sellerName.trim()) return "กรุณากรอกชื่อ-นามสกุลผู้ขาย";
    if (!form.sellerIdCard.trim() && !form.sellerPhone.trim())
      return "กรุณากรอกเลขบัตรประชาชน หรือ เบอร์โทร (อย่างน้อย 1 อย่าง)";
    if (!form.brandModel.trim()) return "กรุณากรอกชื่อสินค้า / รุ่น (Brand/Model)";

    if (!qtyNum || qtyNum <= 0) return "กรุณาระบุจำนวนที่รับซื้อให้ถูกต้อง";
    if (!unitNum || unitNum <= 0) return "กรุณาระบุราคาต่อชิ้น (ต้นทุนต่อชิ้น) ให้ถูกต้อง";

    // ✅ รูปหลักฐาน: ตอนนี้ไม่บังคับ เพราะ intake endpoint ใหม่เป็น JSON
    // ถ้าคุณอยากบังคับเหมือนเดิม เปิด 2 บรรทัดนี้กลับได้
    // if (!productFiles || productFiles.length === 0) return "กรุณาอัปโหลดรูปสินค้าขั้นต่ำ 1 รูป";
    // if (!idCardFiles || idCardFiles.length === 0) return "กรุณาอัปโหลดรูปบัตรประชาชนผู้ขายอย่างน้อย 1 รูป";

    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const msg = validate();
    if (msg) return alert(msg);

    const ok = window.confirm(
      `ยืนยันรับซื้อสินค้าเข้า (PURCHASE)\nจำนวน ${qtyNum} ชิ้น\nต้นทุนรวม ${money(totalCost)} บาท ?`
    );
    if (!ok) return;

    try {
      setSubmitting(true);

      // ✅ payload ให้ตรง backend /api/inventory/intake (JSON)
      const payload = {
        seller: {
          name: form.sellerName.trim(),
          idCard: form.sellerIdCard.trim() || undefined,
          phone: form.sellerPhone.trim() || undefined,
          address: form.sellerAddress.trim() || undefined,
          lineId: form.sellerLineId.trim() || undefined,
        },
        item: {
          name: form.brandModel.trim(),
          serial: form.serial.trim() || undefined,
          condition: form.condition.trim() || undefined,
          accessories: form.accessories.trim() || undefined,
          storageLocation: undefined, // ถ้าคุณมีช่อง storage ให้ใส่ได้
        },
        pricing: {
          cost: totalCost,                  // ✅ ทุนรวม
          targetPrice: targetNum || undefined, // ✅ ราคาตั้งขายต่อชิ้น (optional)
          appraisedPrice: undefined,
        },
        meta: {
          quantity: qtyNum, // ถ้าคุณอยากให้ backend เซฟ quantity ด้วย (ต้องแก้ backend ให้รองรับ)
          unitPrice: unitNum,
          notes: form.notes || "",
        },
      };

      // ✅ ยิง endpoint ใหม่ (สำคัญมาก)
      await api.post("/api/inventory/intake", payload, {
        headers: { "Content-Type": "application/json" },
      });

      alert("บันทึกการรับซื้อสินค้าเรียบร้อย (ผูกลูกค้าแล้ว)");
      navigate("/app/customers"); // แนะนำให้ไปดูผลที่แท็บลูกค้าเลย
    } catch (err: any) {
      console.error("POST /api/inventory/intake error", err);
      const msg2 =
        err?.response?.data?.message ||
        err?.response?.data?.error ||
        "ไม่สามารถบันทึกการรับเข้าได้ กรุณาลองใหม่";
      alert(msg2);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">รับซื้อสินค้า (Buy In)</h1>
            <p className="text-sm text-slate-500">
              บันทึกการรับซื้อสินค้าเข้าสต๊อก พร้อมผูกผู้ขายเข้ากับลูกค้า (ทำให้แท็บ “มาขาย” ขึ้นแน่นอน)
            </p>
          </div>
          <button
            type="button"
            className="text-sm text-sky-600 underline-offset-2 hover:underline"
            onClick={() => navigate("/app/inventory")}
          >
            ไปที่คลังสินค้า →
          </button>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-6 shadow-sm">
          <div className="grid gap-6 md:grid-cols-2">
            {/* ผู้ขาย */}
            <section>
              <h2 className="mb-4 text-base font-semibold text-slate-800">
                1. ข้อมูลผู้ขาย (ลูกค้า)
              </h2>

              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-600">บัตรประชาชนผู้ขาย</span>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  {ocrLoading && <span>กำลังอ่านบัตร...</span>}
                  {ocrError && <span className="text-red-500">* {ocrError}</span>}
                </div>
              </div>

              <div className="mb-4">
                <label className="mb-1 block text-xs font-medium text-slate-700">รูปบัตรประชาชน (ไม่บังคับ)</label>
                <div className="flex items-center gap-3">
                  <label className="flex h-24 w-24 cursor-pointer items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500 hover:bg-slate-100">
                    <span>+ เพิ่มรูป</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileChange("idcard")}
                    />
                  </label>

                  {idCardPreview && (
                    <img
                      src={idCardPreview}
                      alt="ID card preview"
                      className="h-24 w-32 rounded-lg object-cover shadow-sm"
                    />
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">ชื่อ-นามสกุล</label>
                  <input
                    name="sellerName"
                    value={form.sellerName}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    placeholder="เช่น นายอำพล พ่วงสุข"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">เลขบัตรประชาชน (แนะนำ)</label>
                  <input
                    name="sellerIdCard"
                    value={form.sellerIdCard}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    placeholder="134xxxxxxxxxx"
                  />
                  <div className="mt-1 text-[11px] text-slate-500">
                    * ใช้ idCard จะ upsert ได้ชัวร์ที่สุด
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">เบอร์โทรศัพท์</label>
                    <input
                      name="sellerPhone"
                      value={form.sellerPhone}
                      onChange={handleChange}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      placeholder="08x-xxx-xxxx"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">Line ID (ถ้ามี)</label>
                    <input
                      name="sellerLineId"
                      value={form.sellerLineId}
                      onChange={handleChange}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">ที่อยู่</label>
                  <textarea
                    name="sellerAddress"
                    value={form.sellerAddress}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    rows={3}
                  />
                </div>
              </div>
            </section>

            {/* สินค้า */}
            <section>
              <h2 className="mb-4 text-base font-semibold text-slate-800">2. ข้อมูลสินค้า</h2>

              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    ชื่อสินค้า / รุ่น (Brand/Model)
                  </label>
                  <input
                    name="brandModel"
                    value={form.brandModel}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    placeholder="เช่น MacBook Air M1"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">
                      Serial No. / IMEI
                    </label>
                    <input
                      name="serial"
                      value={form.serial}
                      onChange={handleChange}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      placeholder="SN / IMEI"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700">สภาพสินค้า</label>
                    <input
                      name="condition"
                      value={form.condition}
                      onChange={handleChange}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      placeholder="เช่น 95% มีรอยมุมเล็กน้อย"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700">อุปกรณ์ที่ได้รับ</label>
                  <input
                    name="accessories"
                    value={form.accessories}
                    onChange={handleChange}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    placeholder="เช่น กล่อง, ที่ชาร์จ, เคส"
                  />
                </div>

                <div className="mt-2">
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    รูปภาพสินค้า (ไม่บังคับในเวอร์ชันนี้)
                  </label>
                  <div className="flex items-center gap-3">
                    <label className="flex h-24 w-24 cursor-pointer items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500 hover:bg-slate-100">
                      <span>+ เพิ่มรูป</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleFileChange("product")}
                      />
                    </label>

                    {productPreview && (
                      <img
                        src={productPreview}
                        alt="Product preview"
                        className="h-24 w-32 rounded-lg object-cover shadow-sm"
                      />
                    )}

                    {productFiles && productFiles.length > 1 && (
                      <div className="text-xs text-slate-500">
                        เลือกแล้ว {productFiles.length} รูป
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-slate-700">
                    รูปสัญญา / หลักฐานอื่น ๆ (ไม่บังคับ)
                  </label>
                  <div className="flex items-center gap-3">
                    <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500 hover:bg-slate-100">
                      <span>+ เพิ่มรูป</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleFileChange("contract")}
                      />
                    </label>

                    {contractPreview && (
                      <img
                        src={contractPreview}
                        alt="Contract preview"
                        className="h-20 w-28 rounded-lg object-cover shadow-sm"
                      />
                    )}

                    {contractFiles && contractFiles.length > 1 && (
                      <div className="text-xs text-slate-500">
                        เลือกแล้ว {contractFiles.length} รูป
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Pricing */}
          <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <h2 className="mb-3 text-base font-semibold text-slate-800">3. ราคา (Pricing)</h2>

            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700">จำนวน (Qty)</label>
                <input
                  name="quantity"
                  value={form.quantity}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  placeholder="1"
                  inputMode="numeric"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-red-600">
                  ราคาต่อชิ้น (Purchase / ชิ้น)
                </label>
                <input
                  name="unitPrice"
                  value={form.unitPrice}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-red-300 px-3 py-2 text-right text-sm font-semibold text-red-700 shadow-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-400"
                  placeholder="0"
                  inputMode="numeric"
                />
                <p className="mt-1 text-[11px] text-slate-500">* ต้นทุนที่ร้านจ่ายต่อ 1 ชิ้น</p>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-emerald-700">
                  ราคาตั้งขายต่อชิ้น (Target)
                </label>
                <input
                  name="targetPrice"
                  value={form.targetPrice}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-emerald-300 px-3 py-2 text-right text-sm font-semibold text-emerald-700 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                  placeholder="0"
                  inputMode="numeric"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="md:w-2/3">
                <label className="mb-1 block text-xs font-medium text-slate-600">หมายเหตุเพิ่มเติม</label>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  rows={3}
                />
              </div>

              <div className="md:w-1/3">
                <div className="rounded-xl bg-white px-4 py-3 text-right shadow-inner">
                  <div className="text-xs text-slate-500">ราคารวมซื้อเข้า (ทั้งหมด)</div>
                  <div className="text-2xl font-semibold text-red-600">
                    {money(totalCost)} <span className="text-base">บาท</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <div className="mt-6 flex flex-col items-center justify-between gap-3 border-t border-slate-200 pt-4 md:flex-row">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center justify-center rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              disabled={submitting}
            >
              ยกเลิก
            </button>

            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
              disabled={submitting}
            >
              {submitting ? "กำลังบันทึก..." : "ยืนยันการรับซื้อ"}
            </button>
          </div>

          <div className="mt-3 text-[11px] text-slate-500">
            * เวอร์ชันนี้โฟกัส “ผูกผู้ขายกับลูกค้าให้แท็บมาขายขึ้นแน่นอน” (รูปหลักฐานยังไม่อัปโหลดขึ้นระบบ)
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewIntakePage;
