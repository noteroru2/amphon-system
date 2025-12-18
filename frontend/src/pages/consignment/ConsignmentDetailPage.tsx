// frontend/src/pages/consignment/ConsignmentDetailPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../../lib/api";
import { printConsignmentAgreement } from "../../utils/printHelpers";

type ApiRes = {
  consignment?: any;
  customer?: { name?: string; idCard?: string; phone?: string; address?: string };
  inventoryItem?: any;
};

const money = (n: any) => Number(n || 0).toLocaleString("th-TH");

const badge = (status?: string | null) => {
  const s = (status || "").toUpperCase();
  if (s === "ACTIVE" || s === "IN_STOCK") return { text: "กำลังขาย", cls: "bg-emerald-100 text-emerald-700" };
  if (s === "SOLD" || s === "SOLD_OUT") return { text: "ขายแล้ว", cls: "bg-slate-200 text-slate-700" };
  if (s === "CANCELLED") return { text: "ยกเลิก", cls: "bg-rose-100 text-rose-700" };
  return { text: status || "-", cls: "bg-slate-100 text-slate-600" };
};

export default function ConsignmentDetailPage() {
  const { id } = useParams();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [payload, setPayload] = useState<ApiRes | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setErr("");
        setLoading(true);

        // ✅ ใช้ api + อยู่ใต้ /api
        const res = await api.get(`/api/consignments/${id}`);
        setPayload(res.data);
      } catch (e: any) {
        console.error(e);
        setErr(e?.response?.data?.message || e?.message || "โหลดรายละเอียดไม่สำเร็จ");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const { consignment, item, customer, statusUI } = useMemo(() => {
    const con = payload?.consignment ?? null;
    const inv = payload?.inventoryItem ?? con?.inventoryItem ?? null;

    const cust = payload?.customer ?? {
      name: con?.sellerName,
      idCard: con?.sellerIdCard,
      phone: con?.sellerPhone,
      address: con?.sellerAddress,
    };

    return {
      consignment: con,
      item: inv,
      customer: cust,
      statusUI: badge(con?.status || inv?.status),
    };
  }, [payload]);

  const onPrint = () => {
    if (!consignment || !item) {
      alert("ยังโหลดข้อมูลไม่ครบ ไม่สามารถพิมพ์ได้");
      return;
    }

    const normalizedItem = {
      ...item,
      title: item?.title || item?.name || consignment?.itemName || "-",
      serial: item?.serial || consignment?.serial || "-",
      condition: item?.condition || consignment?.condition || "-",
      accessories: item?.accessories || consignment?.accessories || "-",
      purchasePrice: consignment?.netToSeller ?? item?.cost ?? 0,
    };

    const name = customer?.name || consignment?.sellerName || "-";
    const idCard = customer?.idCard || consignment?.sellerIdCard || "-";
    const phone = customer?.phone || consignment?.sellerPhone || "-";
    const address = customer?.address || consignment?.sellerAddress || "-";

    printConsignmentAgreement(normalizedItem as any, name, idCard, phone, address);
  };

  const qtyAll = Number(item?.quantity ?? 1);
  const qtyAvail = Number(item?.quantityAvailable ?? qtyAll);

  const netToSeller = Number(consignment?.netToSeller ?? 0);
  const targetPrice = Number(consignment?.targetPrice ?? item?.targetPrice ?? 0);
  const advanceAmount = Number(consignment?.advanceAmount ?? item?.cost ?? 0);

  const gross = targetPrice * qtyAll;
  const payout = netToSeller * qtyAll;
  const commission = gross - payout;
  const vat = commission > 0 ? commission * 0.07 : 0;

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-3xl font-bold tracking-tight text-slate-900">รายละเอียดสัญญาฝากขาย</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                ID: {id}
              </span>
              {consignment?.code ? (
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm">
                  เลขสัญญา: {consignment.code}
                </span>
              ) : null}
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusUI.cls}`}>{statusUI.text}</span>
            </div>
          </div>

          <div className="flex gap-2">
            {/* ✅ อยู่ใต้ /app */}
            <Link
              to="/app/consignments"
              className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow hover:bg-slate-50"
            >
              ← กลับรายการ
            </Link>
            <button
              onClick={onPrint}
              disabled={loading || !consignment || !item}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-60"
            >
              พิมพ์สัญญา
            </button>
          </div>
        </div>

        {err ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{err}</div>
        ) : null}

        {loading ? (
          <div className="mt-8 rounded-2xl bg-white p-6 shadow">
            <div className="text-sm text-slate-500">กำลังโหลด...</div>
          </div>
        ) : !consignment ? (
          <div className="mt-8 rounded-2xl bg-white p-6 shadow">
            <div className="text-sm text-slate-500">ไม่พบข้อมูลสัญญา</div>
          </div>
        ) : (
          <>
            <div className="mt-6 grid gap-4 lg:grid-cols-12">
              <div className="lg:col-span-6">
                <div className="rounded-3xl bg-white p-6 shadow">
                  <div className="flex items-center justify-between">
                    <div className="text-base font-semibold text-slate-900">ข้อมูลผู้ฝากขาย</div>
                    <div className="text-xs text-slate-500">จากสัญญา</div>
                  </div>

                  <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div className="col-span-3">
                        <div className="text-xs text-slate-500">ชื่อ</div>
                        <div className="font-semibold text-slate-900">{customer?.name || "-"}</div>
                      </div>

                      <div className="col-span-3 sm:col-span-2">
                        <div className="text-xs text-slate-500">เลขบัตร</div>
                        <div className="font-semibold text-slate-900">{customer?.idCard || "-"}</div>
                      </div>

                      <div className="col-span-3 sm:col-span-1">
                        <div className="text-xs text-slate-500">โทร</div>
                        <div className="font-semibold text-slate-900">{customer?.phone || "-"}</div>
                      </div>

                      <div className="col-span-3">
                        <div className="text-xs text-slate-500">ที่อยู่</div>
                        <div className="font-semibold text-slate-900">{customer?.address || "-"}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-6">
                <div className="rounded-3xl bg-white p-6 shadow">
                  <div className="flex items-center justify-between">
                    <div className="text-base font-semibold text-slate-900">ข้อมูลสินค้า</div>
                    {item?.code ? (
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                        Stock: <span className="font-mono">{item.code}</span>
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div className="col-span-3">
                        <div className="text-xs text-slate-500">ชื่อสินค้า</div>
                        <div className="font-semibold text-slate-900">{item?.name || consignment?.itemName || "-"}</div>
                      </div>

                      <div className="col-span-3 sm:col-span-2">
                        <div className="text-xs text-slate-500">Serial/IMEI</div>
                        <div className="font-semibold text-slate-900">{item?.serial || consignment?.serial || "-"}</div>
                      </div>

                      <div className="col-span-3 sm:col-span-1">
                        <div className="text-xs text-slate-500">ช่องเก็บ</div>
                        <div className="font-semibold text-slate-900">{item?.storageLocation || "-"}</div>
                      </div>

                      <div className="col-span-3 sm:col-span-2">
                        <div className="text-xs text-slate-500">สภาพ/ตำหนิ</div>
                        <div className="font-semibold text-slate-900">{item?.condition || consignment?.condition || "-"}</div>
                      </div>

                      <div className="col-span-3 sm:col-span-1">
                        <div className="text-xs text-slate-500">อุปกรณ์</div>
                        <div className="font-semibold text-slate-900">{item?.accessories || consignment?.accessories || "-"}</div>
                      </div>
                    </div>
                  </div>

                  {/* รูปสินค้า (ถ้ามีใน consignment.photos) */}
                  {Array.isArray(consignment?.photos) && consignment.photos.length > 0 ? (
                    <div className="mt-4">
                      <div className="text-xs font-semibold text-slate-700">รูปสินค้า</div>
                      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                        {consignment.photos.slice(0, 12).map((src: string, idx: number) => (
                          <img key={idx} src={src} alt={`photo-${idx}`} className="h-24 w-full rounded-xl border object-cover" />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-3xl bg-white p-6 shadow">
              <div className="text-base font-semibold text-slate-900">สรุปราคา / เงื่อนไข</div>

              <div className="mt-4 grid gap-4 md:grid-cols-4">
                <div className="rounded-2xl border bg-slate-50 p-4">
                  <div className="text-xs font-semibold text-slate-500">เงินจ่ายล่วงหน้า</div>
                  <div className="mt-2 text-2xl font-bold text-slate-900">{money(advanceAmount)}</div>
                </div>

                <div className="rounded-2xl border bg-slate-50 p-4">
                  <div className="text-xs font-semibold text-slate-500">สุทธิให้ผู้ฝาก/ชิ้น</div>
                  <div className="mt-2 text-2xl font-bold text-slate-900">{money(netToSeller)}</div>
                </div>

                <div className="rounded-2xl border bg-slate-50 p-4">
                  <div className="text-xs font-semibold text-slate-500">ราคาตั้งขาย/ชิ้น</div>
                  <div className="mt-2 text-2xl font-bold text-slate-900">{money(targetPrice)}</div>
                </div>

                <div className="rounded-2xl border bg-slate-50 p-4">
                  <div className="text-xs font-semibold text-slate-500">จำนวน</div>
                  <div className="mt-2 text-2xl font-bold text-slate-900">{qtyAll}</div>
                  <div className="mt-1 text-xs text-slate-500">คงเหลือ: {qtyAvail}</div>
                </div>
              </div>

              <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                <div className="text-sm font-semibold text-slate-900">ประมาณการค่าบริการ (ยังไม่ใช่ตอนขายจริง)</div>
                <div className="mt-2 grid gap-2 text-sm md:grid-cols-4">
                  <div>
                    <span className="text-slate-500">ยอดขายรวม: </span>
                    <span className="font-semibold text-slate-900">{money(gross)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">จ่ายผู้ฝากรวม: </span>
                    <span className="font-semibold text-slate-900">{money(payout)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">ค่าบริการ: </span>
                    <span className="font-semibold text-slate-900">{money(commission)}</span>
                  </div>
                  <div>
                    <span className="text-slate-500">VAT 7%: </span>
                    <span className="font-semibold text-slate-900">{money(vat)}</span>
                  </div>
                </div>
                <div className="mt-2 text-xs text-slate-500">*ค่าจริงจะถูกบันทึกใน Cashbook ตอนกด “ขาย” เท่านั้น</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
