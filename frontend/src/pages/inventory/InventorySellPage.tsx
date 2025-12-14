// src/inventory/InventorySellPage.tsx
import { useParams, useNavigate } from "react-router-dom";
import useSWR from "swr";
import axios from "axios";
import { useState } from "react";

// ใช้ใบเสร็จเดิมของคุณ
import { printReceipt } from "../../utils/printHelpers";

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

type ItemDetail = {
  id: number;
  title: string;
  serial: string;
  name: string;
  status: string;
  cost: number;
  sellingPrice: number;
  contractCode?: string | null;
  soldAt?: string | null;
  buyerName?: string;
  buyerPhone?: string;
  buyerAddress?: string;
  buyerTaxId?: string;
};

const InventorySellPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, isLoading } = useSWR<ItemDetail>(
    id ? `/api/inventory/${id}` : null,
    fetcher
  );

  const [price, setPrice] = useState<string>("");
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [buyerTaxId, setBuyerTaxId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sellQty, setSellQty] = useState(1);
  const item = data;

  // ตั้งค่าเริ่มต้น (ราคา + buyer หากเคยมี)
  if (item && price === "") {
    const initial =
      item.sellingPrice && item.sellingPrice > 0
        ? item.sellingPrice
        : item.cost;
    setTimeout(() => {
      setPrice(String(initial));
      setBuyerName(item.buyerName || "");
      setBuyerPhone(item.buyerPhone || "");
      setBuyerAddress(item.buyerAddress || "");
      setBuyerTaxId(item.buyerTaxId || "");
    }, 0);
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item) return;

    const num = Number(price);
    if (!num || num <= 0) {
      alert("กรุณาระบุราคาขายให้ถูกต้อง");
      return;
    }

    setSubmitting(true);
    try {
      // 1) บันทึกการขาย
      await axios.post(`/api/inventory/${item.id}/sell`, {
        sellingPrice: num,
        quantity: sellQty,
        buyerName: buyerName || undefined,
        buyerPhone: buyerPhone || undefined,
        buyerAddress: buyerAddress || undefined,
        buyerTaxId: buyerTaxId || undefined,
      });

      // 2) ดึงข้อมูลล่าสุดของสินค้าเพื่อให้ใบเสร็จใช้ข้อมูลจริงจาก DB
      const { data: latest } = await axios.get<ItemDetail>(
        `/api/inventory/${item.id}`
      );

      // 3) เรียก printReceipt จาก utils
      //    ใช้ latest เป็น InventoryItem, และ num เป็นราคาขาย (หรือ latest.sellingPrice ก็ได้)
      printReceipt(
        {
          // cast เป็น any เพื่อให้เข้ากับ type InventoryItem ที่ใช้ใน printHelpers
          ...(latest as any),
        },
        num
      );

      // 4) กลับไปหน้าคลังสินค้า
      navigate("/inventory");
    } catch (err) {
      console.error("ขายสินค้าล้มเหลว:", err);
      alert("ไม่สามารถบันทึกการขายได้");
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading || !item) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-900/60">
        <div className="rounded-2xl bg-white px-6 py-4 text-sm text-slate-600 shadow-xl">
          กำลังโหลดข้อมูลสินค้า...
        </div>
      </div>
    );
  }

  const title = item.title || item.name;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900/60 px-4">
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        {/* Header */}
        <div className="bg-slate-900 px-6 py-4 text-white">
          <div className="text-[11px] uppercase tracking-wide text-slate-300">
            แจ้งขายสินค้า
          </div>
          <div className="text-sm font-semibold">{title}</div>
          {item.contractCode && (
            <div className="mt-1 text-[11px] text-slate-300">
              มาจากสัญญา: {item.contractCode}
            </div>
          )}
          {item.serial && (
            <div className="mt-1 text-[11px] text-slate-400">
              Serial: {item.serial}
            </div>
          )}
        </div>

        {/* Body */}
        <form onSubmit={onSubmit} className="space-y-4 px-6 py-5 text-xs">
          <div>
            <label className="mb-1 block text-[11px] font-medium text-slate-700">
              ราคาขายจริง (Actual Sale Price)
            </label>
            <div className="flex items-center rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
              <input
                type="number"
                className="w-full bg-transparent text-sm font-semibold text-slate-900 outline-none"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
              <span className="ml-2 text-[11px] font-medium text-slate-400">
                THB
              </span>
            </div>

            <div>
  <label className="text-sm font-medium">จำนวนที่ขาย</label>
  <input
    type="number"
    min={1}
    max={item.quantityAvailable}
    value={sellQty}
    onChange={(e) => setSellQty(Number(e.target.value))}
    className="mt-1 w-full rounded border px-3 py-2"
  />
  <p className="text-xs text-slate-500">
    คงเหลือ {item.quantityAvailable} ชิ้น
  </p>
</div>


            <div className="mt-1 text-[10px] text-slate-400">
              ทุน (Cost): {item.cost.toLocaleString("th-TH")} ฿
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-medium text-slate-700">
              ข้อมูลผู้ซื้อ
            </div>
            <input
              type="text"
              placeholder="ชื่อ-นามสกุล"
              className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400"
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
            />
            <input
              type="text"
              placeholder="เบอร์โทรศัพท์"
              className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400"
              value={buyerPhone}
              onChange={(e) => setBuyerPhone(e.target.value)}
            />
            <input
              type="text"
              placeholder="เลขผู้เสียภาษี (ถ้ามี)"
              className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400"
              value={buyerTaxId}
              onChange={(e) => setBuyerTaxId(e.target.value)}
            />
            <textarea
              placeholder="ที่อยู่สำหรับออกใบเสร็จ / ใบกำกับภาษี"
              className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-400"
              rows={3}
              value={buyerAddress}
              onChange={(e) => setBuyerAddress(e.target.value)}
            />
          </div>

          {/* Footer buttons */}
          <div className="mt-2 flex justify-end gap-2 pt-2 text-xs">
            <button
              type="button"
              onClick={() => navigate("/inventory")}
              disabled={submitting}
              className="rounded-2xl border border-slate-200 px-4 py-2 font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-2xl bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting ? "กำลังบันทึก..." : "ยืนยันการขายและพิมพ์ใบเสร็จ"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default InventorySellPage;