// frontend/src/pages/consignment/NewConsignmentPage.tsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../../lib/api";

type OCRResult = { name?: string; idCard?: string; address?: string };

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result || ""));
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

function money(n: number) {
  const x = Number(n || 0);
  return x.toLocaleString("th-TH");
}

export default function NewConsignmentPage() {
  const nav = useNavigate();

  // seller
  const [sellerName, setSellerName] = useState("");
  const [sellerIdCard, setSellerIdCard] = useState("");
  const [sellerPhone, setSellerPhone] = useState("");
  const [sellerAddress, setSellerAddress] = useState("");

  // item
  const [itemName, setItemName] = useState("");
  const [serial, setSerial] = useState("");
  const [condition, setCondition] = useState("");
  const [accessories, setAccessories] = useState("");
  const [storageLocation, setStorageLocation] = useState("");

  // pricing
  const [advanceAmount, setAdvanceAmount] = useState<number>(0);
  const [netToSeller, setNetToSeller] = useState<number>(0);
  const [targetPrice, setTargetPrice] = useState<number>(0);
  const [quantity, setQuantity] = useState<number>(1);

  // photos (base64)
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);

  // id card (base64)
  const [idCardPreview, setIdCardPreview] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const commissionPreview = useMemo(() => {
    const gross = Number(targetPrice || 0) * Math.max(1, Number(quantity || 1));
    const payout = Number(netToSeller || 0) * Math.max(1, Number(quantity || 1));
    const fee = gross - payout;
    return { gross, payout, fee };
  }, [targetPrice, netToSeller, quantity]);

  const onPickPhotos = async (files: FileList | null) => {
    if (!files) return;
    const list = Array.from(files);

    const urls = await Promise.all(list.map(readFileAsDataUrl));
    setPhotoPreviews((prev) => [...prev, ...urls]);
  };

  const removePhoto = (idx: number) => {
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== idx));
  };

  const onPickIdCard = async (file: File | null) => {
    if (!file) {
      setIdCardPreview("");
      return;
    }
    const url = await readFileAsDataUrl(file);
    setIdCardPreview(url);
  };

  const runOCR = async () => {
    try {
      setErr("");
      if (!idCardPreview) {
        setErr("กรุณาแนบรูปบัตรประชาชนก่อน");
        return;
      }
      setLoading(true);

      // ✅ ใช้ api
      const res = await api.post("/api/ai/ocr-idcard", {
        imageDataUrl: idCardPreview,
      });

      const d: OCRResult = res.data?.data || res.data || {};
      setSellerName(d.name || sellerName);
      setSellerIdCard(d.idCard || sellerIdCard);
      setSellerAddress(d.address || sellerAddress);
    } catch (e: any) {
      console.error(e);
      setErr(e?.response?.data?.message || e?.message || "สแกนบัตรไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const runPriceAI = async () => {
    try {
      setErr("");
      if (!itemName.trim()) {
        setErr("กรุณากรอกชื่อสินค้า ก่อนประเมินราคา");
        return;
      }
      setLoading(true);

      const res = await api.post("/api/ai/price-suggest", {
        name: itemName,
        spec: serial,
        condition,
        accessories,
        desiredMarginPct: 10,
      });

      if (res.data?.targetPrice != null) setTargetPrice(Number(res.data.targetPrice));
    } catch (e: any) {
      console.error(e);
      setErr(e?.response?.data?.message || e?.message || "ประเมินราคาไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    try {
      setErr("");
      setLoading(true);

      if (!sellerName.trim()) throw new Error("กรุณากรอกชื่อผู้ฝากขาย");
      if (!itemName.trim()) throw new Error("กรุณากรอกชื่อสินค้า");

      const payload = {
        sellerName: sellerName.trim(),
        sellerIdCard: sellerIdCard.trim() || null,
        sellerPhone: sellerPhone.trim() || null,
        sellerAddress: sellerAddress.trim() || null,

        itemName: itemName.trim(),
        serial: serial.trim() || null,
        condition: condition.trim() || null,
        accessories: accessories.trim() || null,

        photos: photoPreviews, // ✅ backend รับ array

        advanceAmount: Number(advanceAmount || 0),
        netToSeller: Number(netToSeller || 0),
        targetPrice: Number(targetPrice || 0),

        quantity: Math.max(1, Math.floor(Number(quantity || 1))),
        storageLocation: storageLocation.trim() || null,
      };

      const res = await api.post("/api/consignments", payload);

      const conId = res.data?.con?.id;
      if (!conId) throw new Error("สร้างสำเร็จ แต่ไม่พบ con.id ใน response");

      // ✅ อยู่ใต้ /app
      nav(`/app/consignments/${conId}`);
    } catch (e: any) {
      console.error(e);
      setErr(e?.response?.data?.message || e?.message || "บันทึกไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-2xl font-bold text-slate-900">สร้างสัญญาฝากขาย</div>
            <div className="text-sm text-slate-500">แนบรูปสินค้า + สแกนบัตร + บันทึกเข้าระบบ</div>
          </div>

          <button
            onClick={submit}
            disabled={loading}
            className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow disabled:opacity-60"
          >
            {loading ? "กำลังบันทึก..." : "บันทึกสัญญา"}
          </button>
        </div>

        {err ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {err}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 lg:grid-cols-12">
          {/* LEFT: Seller */}
          <div className="lg:col-span-5">
            <div className="rounded-2xl bg-white p-6 shadow">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">ข้อมูลผู้ฝากขาย</div>
                <button
                  type="button"
                  onClick={runOCR}
                  disabled={loading || !idCardPreview}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  สแกนบัตร (OCR)
                </button>
              </div>

              <div className="mt-4 grid gap-3">
                <label className="text-xs text-slate-600">
                  รูปบัตรประชาชน
                  <input
                    type="file"
                    accept="image/*"
                    className="mt-2 w-full text-xs"
                    onChange={(e) => onPickIdCard(e.target.files?.[0] || null)}
                  />
                </label>

                {idCardPreview ? (
                  <img src={idCardPreview} alt="idcard" className="w-full rounded-xl border object-contain" />
                ) : (
                  <div className="rounded-xl border border-dashed bg-slate-50 p-4 text-xs text-slate-500">
                    แนบรูปบัตรเพื่อให้ OCR เติมข้อมูลอัตโนมัติ
                  </div>
                )}

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs text-slate-600">
                    ชื่อ-นามสกุล
                    <input
                      value={sellerName}
                      onChange={(e) => setSellerName(e.target.value)}
                      className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                      placeholder="เช่น อำพล พวงสุข"
                    />
                  </label>

                  <label className="text-xs text-slate-600">
                    เลขบัตรประชาชน
                    <input
                      value={sellerIdCard}
                      onChange={(e) => setSellerIdCard(e.target.value)}
                      className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                      placeholder="13 หลัก"
                    />
                  </label>
                </div>

                <label className="text-xs text-slate-600">
                  เบอร์โทร
                  <input
                    value={sellerPhone}
                    onChange={(e) => setSellerPhone(e.target.value)}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                    placeholder="0xx-xxx-xxxx"
                  />
                </label>

                <label className="text-xs text-slate-600">
                  ที่อยู่
                  <textarea
                    value={sellerAddress}
                    onChange={(e) => setSellerAddress(e.target.value)}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                    rows={3}
                    placeholder="ที่อยู่ตามบัตร"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* RIGHT: Item */}
          <div className="lg:col-span-7">
            <div className="rounded-2xl bg-white p-6 shadow">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-slate-900">รายละเอียดสินค้า</div>
                <button
                  type="button"
                  onClick={runPriceAI}
                  disabled={loading || !itemName.trim()}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                >
                  ประเมินราคา AI
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="text-xs text-slate-600 md:col-span-2">
                  ชื่อสินค้า / รุ่น
                  <input
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                    placeholder="เช่น iPhone 13 Pro Max 256GB"
                  />
                </label>

                <label className="text-xs text-slate-600">
                  Serial / IMEI
                  <input
                    value={serial}
                    onChange={(e) => setSerial(e.target.value)}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                    placeholder="ถ้ามี"
                  />
                </label>

                <label className="text-xs text-slate-600">
                  ช่องเก็บ (Storage)
                  <input
                    value={storageLocation}
                    onChange={(e) => setStorageLocation(e.target.value)}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                    placeholder="เช่น A-040"
                  />
                </label>

                <label className="text-xs text-slate-600 md:col-span-2">
                  สภาพ / ตำหนิ
                  <input
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                    placeholder="เช่น สวย 95% มีรอยมุม"
                  />
                </label>

                <label className="text-xs text-slate-600 md:col-span-2">
                  อุปกรณ์
                  <input
                    value={accessories}
                    onChange={(e) => setAccessories(e.target.value)}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                    placeholder="เช่น กล่อง สายชาร์จ เคส"
                  />
                </label>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <label className="text-xs text-slate-600">
                  เงินจ่ายล่วงหน้า (ทุนร้าน)
                  <input
                    type="number"
                    value={advanceAmount}
                    onChange={(e) => setAdvanceAmount(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                    min={0}
                  />
                </label>

                <label className="text-xs text-slate-600">
                  สุทธิให้ผู้ฝาก/ชิ้น
                  <input
                    type="number"
                    value={netToSeller}
                    onChange={(e) => setNetToSeller(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                    min={0}
                  />
                </label>

                <label className="text-xs text-slate-600">
                  ราคาขายหน้าร้าน/ชิ้น
                  <input
                    type="number"
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                    min={0}
                  />
                </label>

                <label className="text-xs text-slate-600">
                  จำนวน
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
                    min={1}
                  />
                </label>

                <div className="md:col-span-2 rounded-xl bg-slate-50 p-4">
                  <div className="text-xs text-slate-500">สรุปคร่าว ๆ</div>
                  <div className="mt-1 text-sm text-slate-900">
                    ยอดขายรวม: <span className="font-semibold">{money(commissionPreview.gross)}</span> บาท
                  </div>
                  <div className="text-sm text-slate-900">
                    จ่ายผู้ฝากรวม: <span className="font-semibold">{money(commissionPreview.payout)}</span> บาท
                  </div>
                  <div className="text-sm text-slate-900">
                    ค่าบริการฝากขาย (ก่อน VAT):{" "}
                    <span className="font-semibold">{money(commissionPreview.fee)}</span> บาท
                  </div>
                  <div className="text-xs text-slate-500 mt-1">VAT 7% คิดเฉพาะค่าบริการ (บันทึกตอนขายจริง)</div>
                </div>
              </div>

              {/* Photos */}
              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-900">รูปสินค้า</div>
                  <label className="cursor-pointer rounded-lg bg-white px-3 py-2 text-xs font-semibold shadow">
                    + เพิ่มรูป
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => onPickPhotos(e.target.files)}
                    />
                  </label>
                </div>

                {photoPreviews.length ? (
                  <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                    {photoPreviews.map((src, idx) => (
                      <div key={idx} className="relative">
                        <img src={src} alt={`p${idx}`} className="h-28 w-full rounded-xl border object-cover" />
                        <button
                          type="button"
                          onClick={() => removePhoto(idx)}
                          className="absolute right-2 top-2 rounded bg-black/70 px-2 py-1 text-xs text-white"
                        >
                          ลบ
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 rounded-xl border border-dashed bg-slate-50 p-4 text-xs text-slate-500">
                    แนบรูปสินค้าเพื่อแสดงในหน้ารายละเอียดและพิมพ์สัญญา
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 text-xs text-slate-500">
              หลังบันทึก ระบบจะพาไปหน้ารายละเอียดสัญญา เพื่อกด “พิมพ์สัญญา” ได้ทันที
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
