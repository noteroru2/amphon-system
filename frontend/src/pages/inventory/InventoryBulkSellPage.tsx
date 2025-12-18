// frontend/src/pages/inventory/InventoryBulkSellPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { printBulkSellReceipt } from "../../utils/printHelpers";
import { api } from "../../lib/api";

type SellableItem = {
  id: number;
  code: string;
  name: string;
  serial?: string | null;
  cost: number;
  targetPrice: number;
  sellingPrice: number;
  quantity: number;
  quantityAvailable: number;
  quantitySold: number;
  status: string;
  sourceType: string;
  createdAt: string;
};

type BuyerInfo = {
  name?: string;
  phone?: string;
  address?: string;
  taxId?: string;
  idCard?: string; // (optional future)
};

const fmtMoney = (n: any) => {
  const x = Number(n ?? 0);
  if (!Number.isFinite(x)) return "0";
  return x.toLocaleString();
};

const clampInt = (v: any, min: number, max: number) => {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
};

const pageWrap = "min-h-screen bg-slate-100";
const container = "mx-auto max-w-6xl px-4 py-6";

const InventoryBulkSellPage: React.FC = () => {
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<SellableItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [draftQty, setDraftQty] = useState<Record<number, number>>({});
  const [draftPrice, setDraftPrice] = useState<Record<number, number>>({});

  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerAddress, setBuyerAddress] = useState("");
  const [buyerTaxId, setBuyerTaxId] = useState("");

  const [submitting, setSubmitting] = useState(false);

  const fetchSellable = async () => {
    try {
      setLoading(true);
      const { data } = await api.get<SellableItem[]>(`/api/inventory`);
      const list = (data || []).filter((it) => Number(it.quantityAvailable ?? 0) > 0);

      setItems(list);

      const nextQty: Record<number, number> = {};
      const nextPrice: Record<number, number> = {};
      for (const it of list) {
        nextQty[it.id] = 1;
        const p = Number(it.sellingPrice || it.targetPrice || it.cost || 0);
        nextPrice[it.id] = p > 0 ? p : 0;
      }
      setDraftQty(nextQty);
      setDraftPrice(nextPrice);
    } catch (err) {
      console.error("GET /api/inventory error:", err);
      alert("ไม่สามารถดึงรายการสินค้าพร้อมขายได้");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSellable();
  }, []);

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const allIds = items.map((it) => it.id);
      const allSelected = allIds.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(allIds);
    });
  };

  const totals = useMemo(() => {
    let qtyTotal = 0;
    let amountTotal = 0;

    for (const it of items) {
      if (!selected.has(it.id)) continue;
      const qty = clampInt(draftQty[it.id] ?? 1, 1, Math.max(1, it.quantityAvailable || 1));
      const price = Number(draftPrice[it.id] ?? 0);
      qtyTotal += qty;
      amountTotal += qty * (Number.isFinite(price) ? price : 0);
    }
    return { qtyTotal, amountTotal };
  }, [items, selected, draftQty, draftPrice]);

  const handleChangeQty = (id: number, maxAvail: number, value: any) => {
    setDraftQty((prev) => ({
      ...prev,
      [id]: clampInt(value, 1, Math.max(1, maxAvail)),
    }));
  };

  const handleChangePrice = (id: number, value: any) => {
    const n = Number(value);
    setDraftPrice((prev) => ({
      ...prev,
      [id]: Number.isFinite(n) ? n : 0,
    }));
  };

  const handleSubmit = async () => {
    if (selected.size === 0) {
      alert("กรุณาเลือกรายการที่จะขายอย่างน้อย 1 ชิ้น");
      return;
    }

    const payloadItems: { id: number; quantity: number; sellingPrice: number }[] = [];

    for (const it of items) {
      if (!selected.has(it.id)) continue;

      const qty = clampInt(draftQty[it.id] ?? 1, 1, Math.max(1, it.quantityAvailable || 1));
      const sellingPrice = Number(draftPrice[it.id] ?? 0);

      if (!sellingPrice || sellingPrice <= 0) {
        alert(`กรุณาระบุราคาขายให้ถูกต้อง (ติดที่ ${it.name})`);
        return;
      }

      if (qty > (it.quantityAvailable || 0)) {
        alert(`จำนวนขายเกินคงเหลือ (ติดที่ ${it.name})`);
        return;
      }

      payloadItems.push({ id: it.id, quantity: qty, sellingPrice });
    }

    const confirmText =
      `ยืนยันเปิดบิลขายสินค้า ${payloadItems.length} รายการ (รวม ${totals.qtyTotal} ชิ้น)\n` +
      `ยอดรวม ${fmtMoney(totals.amountTotal)} บาท\n` +
      `ระบบจะบันทึกการขาย + ลง Cashbook และพิมพ์ใบเสร็จ`;
    if (!window.confirm(confirmText)) return;

    setSubmitting(true);
    try {
      const buyer: BuyerInfo = {
        name: buyerName || undefined,
        phone: buyerPhone || undefined,
        address: buyerAddress || undefined,
        taxId: buyerTaxId || undefined,
      };

      await api.post(`/api/inventory/bulk-sell`, { items: payloadItems, buyer });

      // ✅ ส่ง unitPrice + quantity ให้ print (สำคัญ)
      const receiptItems = payloadItems.map((p) => {
        const it = items.find((x) => x.id === p.id);
        return {
          id: p.id,
          title: it?.name || "-",
          serial: it?.serial || undefined,
          unitPrice: Number(p.sellingPrice ?? 0),
          quantity: Math.max(1, Number(p.quantity)),
        };
      });

      printBulkSellReceipt(receiptItems as any, buyer);
      navigate("/app/inventory");
    } catch (err: any) {
      console.error("ขายหลายชิ้นล้มเหลว:", err);
      const msg = err?.response?.data?.message || "ไม่สามารถบันทึกการขาย (bulk) ได้";
      alert(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCount = selected.size;

  return (
    <div className={pageWrap}>
      <div className={container}>
        {/* Header */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">เปิดบิลขายจากคลัง (หลายชิ้น)</h1>
            <p className="text-sm text-slate-500">เลือกสินค้า ระบุจำนวน/ราคาต่อชิ้น แล้วพิมพ์ใบเสร็จครั้งเดียว</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate("/app/inventory")}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              disabled={submitting}
            >
              ย้อนกลับไปหน้าคลัง
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
              disabled={submitting || loading || items.length === 0}
            >
              {submitting ? "กำลังบันทึก..." : "ยืนยันขายและพิมพ์ใบเสร็จ"}
            </button>
          </div>
        </div>

        {/* Buyer Card */}
        <div className="mb-4 rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-slate-800">ข้อมูลผู้ซื้อ</div>
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">ชื่อลูกค้า</label>
              <input
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder="เช่น คุณสมชาย"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">เบอร์โทร</label>
              <input
                value={buyerPhone}
                onChange={(e) => setBuyerPhone(e.target.value)}
                placeholder="เช่น 081-xxx-xxxx"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">ที่อยู่</label>
              <input
                value={buyerAddress}
                onChange={(e) => setBuyerAddress(e.target.value)}
                placeholder="แสดงในใบเสร็จ"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">เลขประจำตัวผู้เสียภาษี</label>
              <input
                value={buyerTaxId}
                onChange={(e) => setBuyerTaxId(e.target.value)}
                placeholder="ถ้ามี"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Table Card */}
        <div className="rounded-2xl bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <div className="text-sm font-semibold text-slate-800">รายการสินค้าพร้อมขาย</div>
            <div className="text-xs text-slate-500">
              เลือกแล้ว {selectedCount} รายการ • รวม {totals.qtyTotal} ชิ้น • {fmtMoney(totals.amountTotal)} บาท
            </div>
          </div>

          <div className="grid grid-cols-12 gap-2 border-b border-slate-200 px-5 py-3 text-xs font-medium text-slate-500">
            <div className="col-span-1 flex items-center justify-center">
              <input
                type="checkbox"
                checked={items.length > 0 && items.every((it) => selected.has(it.id))}
                onChange={toggleSelectAll}
              />
            </div>
            <div className="col-span-1">ID</div>
            <div className="col-span-4">รายการสินค้า</div>
            <div className="col-span-2">Serial</div>
            <div className="col-span-1 text-right">คงเหลือ</div>
            <div className="col-span-1 text-center">ขาย (ชิ้น)</div>
            <div className="col-span-2 text-right">ราคาขาย/ชิ้น</div>
          </div>

          {loading ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">กำลังโหลดข้อมูล...</div>
          ) : items.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">ไม่มีสินค้าพร้อมขาย (คงเหลือ &gt; 0)</div>
          ) : (
            <div>
              {items.map((it) => {
                const isChecked = selected.has(it.id);
                const maxAvail = Math.max(1, Number(it.quantityAvailable ?? 0));
                const qty = clampInt(draftQty[it.id] ?? 1, 1, maxAvail);
                const price = Number(draftPrice[it.id] ?? 0);
                const rowTotal = isChecked ? qty * (Number.isFinite(price) ? price : 0) : 0;

                return (
                  <div
                    key={it.id}
                    className={`grid grid-cols-12 gap-2 px-5 py-3 text-sm ${
                      isChecked ? "bg-blue-50/40" : ""
                    } border-t border-slate-100`}
                  >
                    <div className="col-span-1 flex items-center justify-center">
                      <input type="checkbox" checked={isChecked} onChange={() => toggleSelect(it.id)} />
                    </div>

                    <div className="col-span-1 text-slate-700">{it.id}</div>

                    <div className="col-span-4">
                      <div className="font-medium text-slate-800">{it.name}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        Code: <span className="font-mono">{it.code}</span>
                        <span className="mx-2">•</span>
                        ต้นทุน/ชิ้น: {fmtMoney(it.cost)}
                        {isChecked && (
                          <>
                            <span className="mx-2">•</span>
                            รวมแถวนี้: <span className="font-semibold text-slate-800">{fmtMoney(rowTotal)}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="col-span-2 text-slate-600">
                      {it.serial ? <span className="font-mono">{it.serial}</span> : "-"}
                    </div>

                    <div className="col-span-1 text-right text-slate-700">{Number(it.quantityAvailable ?? 0)}</div>

                    <div className="col-span-1 flex justify-center">
                      <input
                        type="number"
                        min={1}
                        max={maxAvail}
                        value={qty}
                        onChange={(e) => handleChangeQty(it.id, maxAvail, e.target.value)}
                        disabled={!isChecked}
                        className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-center text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
                      />
                    </div>

                    <div className="col-span-2 flex items-center justify-end gap-2">
                      <input
                        type="number"
                        value={price}
                        onChange={(e) => handleChangePrice(it.id, e.target.value)}
                        disabled={!isChecked}
                        className="w-40 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-50 disabled:text-slate-400"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-slate-600">
              จำนวนที่เลือกขาย: <span className="font-semibold text-slate-800">{selectedCount}</span> รายการ • รวม{" "}
              <span className="font-semibold text-slate-800">{totals.qtyTotal}</span> ชิ้น
            </div>

            <div className="flex items-center justify-between gap-4">
              <div className="text-right">
                <div className="text-xs text-slate-500">ยอดรวมโดยประมาณ</div>
                <div className="text-xl font-semibold text-slate-800">{fmtMoney(totals.amountTotal)} บาท</div>
              </div>

              <button
                type="button"
                onClick={handleSubmit}
                className="rounded-full bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
                disabled={submitting || loading || items.length === 0 || selected.size === 0}
              >
                {submitting ? "กำลังบันทึก..." : "ยืนยันขายและพิมพ์ใบเสร็จ"}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-3 text-xs text-slate-500">
          * ระบบจะตัดสต๊อกตาม “จำนวนที่ขาย” และเปลี่ยนสถานะเป็น SOLD เมื่อคงเหลือ = 0
        </div>
      </div>
    </div>
  );
};

export default InventoryBulkSellPage;
