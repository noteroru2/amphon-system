// src/inventory/InventorySellPage.tsx
import { useParams, useNavigate } from "react-router-dom";
import useSWR from "swr";
import axios from "axios";
import { useEffect, useState } from "react";
import { printReceipt } from "../../utils/printHelpers";

const fetcher = (url: string) => axios.get(url).then((r) => r.data);

type ItemDetail = {
  id: number;
  title?: string;
  name: string;
  serial?: string;
  status: string;
  cost: number;
  sellingPrice?: number;
  quantityAvailable: number;
  buyerName?: string;
  buyerPhone?: string;
  buyerAddress?: string;
  buyerTaxId?: string;
};

const InventorySellPage: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: item, isLoading } = useSWR<ItemDetail>(
    id ? `/api/inventory/${id}` : null,
    fetcher
  );

  const [price, setPrice] = useState("");
  const [sellQty, setSellQty] = useState(1);

  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [buyerTaxId, setBuyerTaxId] = useState("");

  const [submitting, setSubmitting] = useState(false);

  // ✅ ตั้งค่า default เมื่อโหลด item เสร็จ
  useEffect(() => {
    if (!item) return;

    const initial =
      item.sellingPrice && item.sellingPrice > 0
        ? item.sellingPrice
        : item.cost;

    setPrice(String(initial));
    setBuyerName(item.buyerName || "");
    setBuyerPhone(item.buyerPhone || "");
    setBuyerAddress(item.buyerAddress || "");
    setBuyerTaxId(item.buyerTaxId || "");
    setSellQty(1);
  }, [item]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item) return;

    const numPrice = Number(price);

    if (!Number.isFinite(numPrice) || numPrice <= 0) {
      alert("กรุณาระบุราคาขายให้ถูกต้อง");
      return;
    }

    if (sellQty <= 0 || sellQty > item.quantityAvailable) {
      alert(`จำนวนขายต้องอยู่ระหว่าง 1 - ${item.quantityAvailable}`);
      return;
    }

    const ok = window.confirm(
      `ยืนยันขายสินค้า ${item.name}\nจำนวน ${sellQty} ชิ้น\nราคาชิ้นละ ${numPrice.toLocaleString()} บาท`
    );
    if (!ok) return;

    setSubmitting(true);
    try {
      // 1) บันทึกการขาย
      await axios.post(`/api/inventory/${item.id}/sell`, {
        sellingPrice: numPrice,
        quantity: sellQty,
        buyerName: buyerName || undefined,
        buyerPhone: buyerPhone || undefined,
        buyerAddress: buyerAddress || undefined,
        buyerTaxId: buyerTaxId || undefined,
      });

      // 2) โหลดข้อมูลล่าสุด
      const { data: latest } = await axios.get<ItemDetail>(
        `/api/inventory/${item.id}`
      );

      // 3) พิมพ์ใบเสร็จ (ยอดรวมจริง)
      const totalAmount = numPrice * sellQty;

      printReceipt(
        {
          ...(latest as any),
          quantitySold: sellQty,
        },
        totalAmount
      );

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
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl">
        <div className="bg-slate-900 px-6 py-4 text-white">
          <div className="text-[11px] text-slate-300">แจ้งขายสินค้า</div>
          <div className="text-sm font-semibold">{title}</div>
          {item.serial && (
            <div className="text-[11px] text-slate-400">SN: {item.serial}</div>
          )}
        </div>

        <form onSubmit={onSubmit} className="space-y-4 px-6 py-5 text-xs">
          <div>
            <label className="block text-[11px] font-medium text-slate-700">
              ราคาขายต่อชิ้น
            </label>
            <input
              type="number"
              className="mt-1 w-full rounded-xl border px-3 py-2 font-semibold"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />

            <label className="mt-3 block text-[11px] font-medium text-slate-700">
              จำนวนที่ขาย
            </label>
            <input
              type="number"
              min={1}
              max={item.quantityAvailable}
              value={sellQty}
              onChange={(e) => setSellQty(Number(e.target.value))}
              className="mt-1 w-full rounded-xl border px-3 py-2"
            />

            <div className="mt-1 text-[10px] text-slate-400">
              คงเหลือ {item.quantityAvailable} ชิ้น · ทุน {item.cost.toLocaleString()} บาท
            </div>
          </div>

          <div className="space-y-2">
            <input
              placeholder="ชื่อผู้ซื้อ"
              className="w-full rounded-xl border px-3 py-2"
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
            />
            <input
              placeholder="เบอร์โทร"
              className="w-full rounded-xl border px-3 py-2"
              value={buyerPhone}
              onChange={(e) => setBuyerPhone(e.target.value)}
            />
            <input
              placeholder="เลขผู้เสียภาษี"
              className="w-full rounded-xl border px-3 py-2"
              value={buyerTaxId}
              onChange={(e) => setBuyerTaxId(e.target.value)}
            />
            <textarea
              placeholder="ที่อยู่"
              rows={3}
              className="w-full rounded-xl border px-3 py-2"
              value={buyerAddress}
              onChange={(e) => setBuyerAddress(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => navigate("/inventory")}
              className="rounded-xl border px-4 py-2"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-blue-600 px-4 py-2 text-white"
            >
              {submitting ? "กำลังบันทึก..." : "ยืนยันขาย"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default InventorySellPage;
