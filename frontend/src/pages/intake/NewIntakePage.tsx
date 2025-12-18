// src/pages/intake/NewIntakePage.tsx
import React, { useState, ChangeEvent, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api"; // ✅ ใช้ api ที่ชี้ backend render

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
  unitPrice: string;
  targetPrice: string;

  notes: string;
};

type EvidenceType = "product" | "idcard" | "contract";

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

  const [productFiles, setProductFiles] = useState<FileList | null>(null);
  const [idCardFiles, setIdCardFiles] = useState<FileList | null>(null);
  const [contractFiles, setContractFiles] = useState<FileList | null>(null);

  const [productPreview, setProductPreview] = useState<string | null>(null);
  const [idCardPreview, setIdCardPreview] = useState<string | null>(null);
  const [contractPreview, setContractPreview] = useState<string | null>(null);

  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleFileChange =
    (type: EvidenceType) => (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      const first = files[0];
      const url = URL.createObjectURL(first);

      if (type === "product") {
        setProductFiles(files);
        setProductPreview(url);
      } else if (type === "idcard") {
        setIdCardFiles(files);
        setIdCardPreview(url);
        runOcrIdCard(first).catch((err) => console.error("runOcrIdCard error:", err));
      } else {
        setContractFiles(files);
        setContractPreview(url);
      }
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

      // ✅ ยิงไป backend จริง
      const res = await api.post("/api/ai/ocr-idcard", payload, {
        headers: { "Content-Type": "application/json" },
      });

      const d = (res.data && (res.data.data || res.data)) || {};

      const name = d.name || d.fullName || d.full_name || form.sellerName;
      const idCard =
        d.idCard || d.id_card || d.idCardNumber || d.citizenId || form.sellerIdCard;
      const address = d.address || d.fullAddress || d.addressFull || form.sellerAddress;

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

  const validate = (): string | null => {
    if (!form.sellerName.trim()) return "กรุณากรอกชื่อ-นามสกุลผู้ขาย";
    if (!form.sellerIdCard.trim()) return "กรุณากรอกเลขบัตรประชาชน (หรือใช้สแกนบัตร)";
    if (!form.brandModel.trim()) return "กรุณากรอกชื่อสินค้า / รุ่น (Brand/Model)";

    if (!productFiles || productFiles.length === 0) return "กรุณาอัปโหลดรูปสินค้าขั้นต่ำ 1 รูป";
    if (!idCardFiles || idCardFiles.length === 0) return "กรุณาอัปโหลดรูปบัตรประชาชนผู้ขายอย่างน้อย 1 รูป";

    const qty = Number(form.quantity || "0");
    const unit = Number(form.unitPrice || "0");
    if (!qty || qty <= 0) return "กรุณาระบุจำนวนที่รับซื้อให้ถูกต้อง";
    if (!unit || unit <= 0) return "กรุณาระบุราคาต่อชิ้น (ต้นทุนต่อชิ้น) ให้ถูกต้อง";

    return null;
  };

  const totalCost = (() => {
    const qty = Number(form.quantity || "0");
    const unit = Number(form.unitPrice || "0");
    if (!Number.isFinite(qty * unit)) return 0;
    return qty * unit;
  })();

  const money = (n: number) => n.toLocaleString();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const msg = validate();
    if (msg) return alert(msg);

    if (!window.confirm(`ยืนยันรับซื้อสินค้าเข้า stk จำนวน ${form.quantity} ชิ้น เป็นเงินรวม ${money(totalCost)} บาทหรือไม่?`)) {
      return;
    }

    try {
      setSubmitting(true);

      const fd = new FormData();

      // ผู้ขาย
      fd.append("sellerName", form.sellerName);
      fd.append("sellerIdCard", form.sellerIdCard);
      fd.append("sellerPhone", form.sellerPhone);
      fd.append("sellerAddress", form.sellerAddress);
      fd.append("sellerLineId", form.sellerLineId);

      // สินค้า
      fd.append("brandModel", form.brandModel);
      fd.append("serial", form.serial);
      fd.append("condition", form.condition);
      fd.append("accessories", form.accessories);

      // การเงิน
      fd.append("quantity", form.quantity);
      fd.append("unitPrice", form.unitPrice);
      fd.append("purchaseTotal", String(totalCost));
      fd.append("targetPrice", form.targetPrice);

      fd.append("notes", form.notes || "");
      fd.append("sourceType", "BUY_IN"); // ✅ ให้ backend ใช้ได้เลย

      // รูปหลักฐาน
      if (productFiles) Array.from(productFiles).forEach((f) => fd.append("productPhotos", f));
      if (idCardFiles) Array.from(idCardFiles).forEach((f) => fd.append("idCardPhotos", f));
      if (contractFiles) Array.from(contractFiles).forEach((f) => fd.append("contractPhotos", f));

      // ✅ ยิงไป backend จริง (ไม่ใช่ Vercel /api)
      await api.post("/api/intake", fd);

      alert("บันทึกการรับซื้อสินค้าเรียบร้อย");
      navigate("/app/inventory"); // ✅ ให้ตรง routing ใหม่
    } catch (err: any) {
      console.error("POST /api/intake error", err);
      const msg = err?.response?.data?.message || "ไม่สามารถบันทึกการรับเข้าได้ กรุณาลองใหม่";
      alert(msg);
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
            <p className="text-sm text-slate-500">บันทึกการรับซื้อสินค้าเข้าสต๊อก พร้อมบันทึกรายจ่ายอัตโนมัติ</p>
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
          {/* ... UI ของคุณเหมือนเดิมทุกอย่าง (ตัดยาวเพื่อไม่ซ้ำ) ... */}
          {/* ✅ โค้ดส่วน UI ที่เหลือใช้ของเดิมคุณได้เลย */}
        </form>
      </div>
    </div>
  );
};

export default NewIntakePage;
