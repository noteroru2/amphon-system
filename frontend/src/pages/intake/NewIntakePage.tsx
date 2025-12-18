// src/pages/intake/NewIntakePage.tsx
import React, { useEffect, useMemo, useState, ChangeEvent, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";

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
  unitPrice: string;   // ✅ ต่อชิ้น
  targetPrice: string; // ✅ ต่อชิ้น

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

  const setPreviewSafe = (setter: (v: string | null) => void, prev: string | null, next: string) => {
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
  const unitNum = useMemo(() => Math.max(0, toNum(form.unitPrice || "0")), [form.unitPrice]);
  const targetNum = useMemo(() => Math.max(0, toNum(form.targetPrice || "0")), [form.targetPrice]);

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
    if (!unitNum || unitNum <= 0) return "กรุณาระบุราคาต่อชิ้นให้ถูกต้อง";

    // ถ้าคุณอยากบังคับรูป เปิด 2 บรรทัดนี้
    // if (!productFiles || productFiles.length === 0) return "กรุณาอัปโหลดรูปสินค้าขั้นต่ำ 1 รูป";
    // if (!idCardFiles || idCardFiles.length === 0) return "กรุณาอัปโหลดรูปบัตรประชาชนอย่างน้อย 1 รูป";

    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const msg = validate();
    if (msg) return alert(msg);

    const ok = window.confirm(
      `ยืนยันรับซื้อเข้า (PURCHASE)\nจำนวน ${qtyNum} ชิ้น\nต้นทุนรวม ${money(totalCost)} บาท ?`
    );
    if (!ok) return;

    try {
      setSubmitting(true);

      const fd = new FormData();

      // ผู้ขาย
      fd.append("sellerName", form.sellerName.trim());
      fd.append("sellerIdCard", form.sellerIdCard.trim());
      fd.append("sellerPhone", form.sellerPhone.trim());
      fd.append("sellerAddress", form.sellerAddress.trim());
      fd.append("sellerLineId", form.sellerLineId.trim());

      // สินค้า
      fd.append("brandModel", form.brandModel.trim());
      fd.append("serial", form.serial.trim());
      fd.append("condition", form.condition.trim());
      fd.append("accessories", form.accessories.trim());

      // ตัวเลข
      fd.append("quantity", String(qtyNum));
      fd.append("unitPrice", String(unitNum));             // ✅ ต่อชิ้น
      fd.append("purchaseTotal", String(totalCost));       // ✅ รวม
      if (targetNum > 0) fd.append("targetPrice", String(targetNum));

      fd.append("notes", form.notes || "");
      fd.append("sourceType", "PURCHASE");                 // ✅ สำคัญ

      // รูปหลักฐาน
      if (productFiles) Array.from(productFiles).forEach((f) => fd.append("productPhotos", f));
      if (idCardFiles) Array.from(idCardFiles).forEach((f) => fd.append("idCardPhotos", f));
      if (contractFiles) Array.from(contractFiles).forEach((f) => fd.append("contractPhotos", f));

      // ✅ ยิงให้ตรง backend intake.js
      await api.post("/api/intake", fd);

      alert("บันทึกการรับซื้อสินค้าเรียบร้อย");
      navigate("/app/customers"); // ไปดูว่าลูกค้ามาขายขึ้นหรือยัง
    } catch (err: any) {
      console.error("POST /api/intake error", err);
      const msg2 = err?.response?.data?.message || err?.response?.data?.error || "บันทึกไม่สำเร็จ";
      alert(msg2);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      {/* UI เดิมของคุณได้เลย (ตัดทอนในคำตอบเพื่อสั้น) */}
      {/* ให้คง JSX ทั้งหมดของคุณไว้เหมือนเดิม แค่ใช้ handleSubmit/validate ใหม่ */}
      {/* ... */}
      <div className="mx-auto max-w-6xl px-4 py-6">
        <form onSubmit={handleSubmit} className="rounded-2xl bg-white p-6 shadow-sm">
          {/* (วาง JSX เดิมของคุณทั้งหมด) */}
          <button
            type="submit"
            className="rounded-full bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            disabled={submitting}
          >
            {submitting ? "กำลังบันทึก..." : "ยืนยันการรับซื้อ"}
          </button>

          <div className="mt-3 text-[11px] text-slate-500">
            * ต้นทุนต่อชิ้น = unitPrice, ต้นทุนรวม = qty * unitPrice
          </div>
        </form>
      </div>
    </div>
  );
};

export default NewIntakePage;
