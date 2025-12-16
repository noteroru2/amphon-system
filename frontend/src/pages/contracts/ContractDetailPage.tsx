import React, { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import useSWR from "swr";
import { apiFetch } from "../../lib/api";
import { printContract, printDigitalContract } from "../../utils/printHelpers";

type FeeConfig = {
  docFee: number;
  storageFee: number;
  careFee: number;
  total: number;
};

type Customer = {
  id: number;
  name: string;
  phone?: string;
  idCard?: string;
  address?: string;
  lineId?: string;
  lineToken?: string;
};

type Asset = {
  modelName: string;
  serial: string;
  condition: string;
  accessories: string;
  storageCode: string;
};

type Contract = {
  id: number;
  code: string;
  type: string;
  status: string;
  createdAt?: string;
  startDate?: string;
  dueDate?: string;
  termDays?: number;

  principal?: number;
  securityDeposit?: number;
  feeConfig?: FeeConfig;

  customer?: Customer | null;
  asset?: Asset;

  // legacy fallback
  itemTitle?: string;
  itemSerial?: string;
  itemCondition?: string;
  itemAccessories?: string;
  storageCode?: string;

  images?: string[];
};

const swrFetcher = (url: string) => apiFetch<any>(url);

export function ContractDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [isEditingCustomer, setIsEditingCustomer] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [showAllImages, setShowAllImages] = useState(false);

  // ✅ key ต้องเป็น "/contracts/:id" (apiFetch จะต่อกับ BASE_URL ที่ลงท้าย /api)
  const { data, error, mutate } = useSWR<Contract>(
    id ? `/contracts/${id}` : null,
    swrFetcher
  );

  if (error) {
    console.error("โหลดรายละเอียดสัญญาผิดพลาด:", error);
    return (
      <div className="p-4 text-center text-xs text-red-500">
        ไม่สามารถโหลดรายละเอียดสัญญาได้:{" "}
        {String((error as any)?.message || error)}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-4 text-xs text-slate-500">กำลังโหลดรายละเอียดสัญญา...</div>
    );
  }

  const contract = data;

  // ---------- คำนวณข้อมูลการเงิน ----------
  const principal =
    typeof contract.principal === "number"
      ? contract.principal
      : typeof contract.securityDeposit === "number"
      ? contract.securityDeposit
      : 0;

  const feeConfig: FeeConfig = {
    docFee: contract.feeConfig?.docFee ?? 0,
    storageFee: contract.feeConfig?.storageFee ?? 0,
    careFee: contract.feeConfig?.careFee ?? 0,
    total: contract.feeConfig?.total ?? 0,
  };

  const totalRedemption = principal;

  const startDate = contract.startDate
    ? new Date(contract.startDate)
    : contract.createdAt
    ? new Date(contract.createdAt)
    : null;

  const dueDate = contract.dueDate ? new Date(contract.dueDate) : null;

  const formatDate = (d?: Date | null) => {
    if (!d || Number.isNaN(d.getTime())) return "-";
    return d.toLocaleDateString("th-TH", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const statusBadgeClass = (() => {
    switch (contract.status) {
      case "ACTIVE":
        return "bg-emerald-500 text-white";
      case "REDEEMED":
        return "bg-sky-500 text-white";
      case "FORFEITED":
        return "bg-red-500 text-white";
      default:
        return "bg-slate-500 text-white";
    }
  })();

  const canOperate = contract.status === "ACTIVE";

  // ----- รูปภาพทรัพย์สิน (กัน null / string แปลก) -----
  const images = useMemo(() => {
    const arr = Array.isArray(contract.images) ? contract.images : [];
    return arr
      .filter((x): x is string => typeof x === "string")
      .map((x) => x.trim())
      .filter((x) => x.length > 0)
      .filter((x) => x.startsWith("data:image") || x.startsWith("http://") || x.startsWith("https://"));
  }, [contract.images]);

  // กันหน้าค้าง: แสดงแค่ 4 รูปก่อน
  const thumbImages = showAllImages ? images : images.slice(0, 4);

  // ---------- ปุ่ม action ----------
  const handlePrintContract = () => {
    try {
      printContract(contract as any);
    } catch (e) {
      console.error("printContract error:", e);
      alert("พิมพ์สัญญาไม่สำเร็จ");
    }
  };

  const handlePrintDigital = () => {
    try {
      printDigitalContract(contract as any);
    } catch (e) {
      console.error("printDigitalContract error:", e);
      alert("เปิดใบสัญญาดิจิทัลไม่สำเร็จ");
    }
  };

  const handleNotifyCustomer = () => {
    alert("ฟังก์ชันแจ้งเตือนลูกค้ายังไม่ได้เชื่อมต่อ LINE OA");
  };

  // ---------- แก้ไขข้อมูลลูกค้า ----------
  const handleStartEditCustomer = () => {
    if (!contract.customer) return;
    setEditingCustomer({
      ...contract.customer,
      phone: contract.customer.phone || "",
      idCard: contract.customer.idCard || "",
      address: contract.customer.address || "",
      lineId: contract.customer.lineId || "",
      lineToken: contract.customer.lineToken || "",
    });
    setIsEditingCustomer(true);
  };

  const handleCancelEditCustomer = () => {
    setIsEditingCustomer(false);
    setEditingCustomer(null);
  };

  const handleSaveCustomer = async () => {
    if (!editingCustomer || !contract.customer?.id) return;

    try {
      const payload = {
        name: editingCustomer.name,
        phone: editingCustomer.phone || "",
        idCard: editingCustomer.idCard || "",
        address: editingCustomer.address || "",
        lineId: editingCustomer.lineId || "",
        lineToken: editingCustomer.lineToken || "",
      };

      // ✅ ใช้ apiFetch ยิงไป backend จริง
      const updatedCustomer = await apiFetch<Customer>(
        `/customers/${contract.customer.id}`,
        { method: "PATCH", body: JSON.stringify(payload) }
      );

      // อัปเดต UI โดยไม่ revalidate ทันที
      await mutate({ ...contract, customer: updatedCustomer }, false);

      setIsEditingCustomer(false);
      setEditingCustomer(null);
      alert("บันทึกข้อมูลลูกค้าสำเร็จ");
    } catch (err: any) {
      console.error("PATCH /customers error:", err);
      alert(
        err?.message ||
          "ไม่สามารถบันทึกข้อมูลลูกค้าได้ (อาจยังไม่มี API /customers บน backend)"
      );
    }
  };

  return (
    <>
      <div className="space-y-4">
        {/* Back link */}
        <div className="text-xs">
          <Link
            to="/app/deposit/list"
            className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800"
          >
            <span className="text-sm">←</span>
            <span>กลับหน้ารายการ</span>
          </Link>
        </div>

        {/* Header Card */}
        <section className="rounded-2xl bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-4 md:flex-row md:items-center md:justify-between">
            {/* left */}
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${statusBadgeClass}`}
                >
                  สัญญาปกติ
                </span>
                <span className="text-xs font-mono text-slate-500">
                  {contract.code}
                </span>
              </div>
              <div className="text-2xl font-semibold text-slate-900">
                {contract.asset?.modelName ||
                  contract.itemTitle ||
                  "ไม่ระบุชื่อทรัพย์สิน"}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                วันเริ่มสัญญา: {formatDate(startDate)}
              </div>
            </div>

            {/* right summary */}
            <div className="rounded-2xl bg-slate-900 px-6 py-4 text-right text-slate-50">
              <div className="text-[11px] uppercase tracking-wide text-slate-300">
                ยอดไถ่ถอน (TOTAL REDEMPTION)
              </div>
              <div className="mt-1 text-3xl font-semibold">
                {totalRedemption.toLocaleString()}{" "}
                <span className="text-base">บาท</span>
              </div>
              <div className="mt-1 text-[11px] text-emerald-300">
                ครบกำหนดชำระ: {formatDate(dueDate)}
              </div>
            </div>
          </div>

          {/* Action buttons row */}
          <div className="flex flex-wrap items-center gap-2 px-6 py-3 text-xs">
            <button
              type="button"
              onClick={handlePrintContract}
              className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
            >
              พิมพ์สัญญา
            </button>
            <button
              type="button"
              onClick={handlePrintDigital}
              className="inline-flex items-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
            >
              ใบสัญญาดิจิทัล
            </button>

            <div className="mx-3 h-6 w-px bg-slate-200" />

            <button
              type="button"
              onClick={handleNotifyCustomer}
              className="inline-flex items-center rounded-xl bg-emerald-500 px-3 py-2 text-[11px] font-medium text-white hover:bg-emerald-600"
            >
              🟢 แจ้งเตือนลูกค้า
            </button>

            <button
              type="button"
              disabled={!canOperate}
              onClick={() => navigate(`/app/contracts/${contract.id}/renew`)}
              className="inline-flex items-center rounded-xl bg-slate-800 px-3 py-2 text-[11px] font-medium text-white hover:bg-slate-900 disabled:opacity-60"
            >
              ต่อสัญญา
            </button>
            <button
              type="button"
              disabled={!canOperate}
              onClick={() => navigate(`/app/contracts/${contract.id}/redeem`)}
              className="inline-flex items-center rounded-xl bg-sky-600 px-3 py-2 text-[11px] font-medium text-white hover:bg-sky-700 disabled:opacity-60"
            >
              ไถ่ถอน
            </button>
            <button
              type="button"
              disabled={!canOperate}
              onClick={() => navigate(`/app/contracts/${contract.id}/cut-principal`)}
              className="inline-flex items-center rounded-xl bg-amber-500 px-3 py-2 text-[11px] font-medium text-white hover:bg-amber-600 disabled:opacity-60"
            >
              ตัดต้น
            </button>
            <button
              type="button"
              disabled={!canOperate}
              onClick={() => navigate(`/app/contracts/${contract.id}/forfeit`)}
              className="inline-flex items-center rounded-xl bg-red-600 px-3 py-2 text-[11px] font-medium text-white hover:bg-red-700 disabled:opacity-60"
            >
              ตัดหลุด
            </button>
          </div>
        </section>

        {/* Main grid: asset + customer + balance */}
        <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
          {/* left column */}
          <div className="space-y-4">
            {/* Asset info */}
            <section className="rounded-2xl bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">
                ข้อมูลทรัพย์สิน
              </h2>
              <div className="grid gap-4 md:grid-cols-2 text-xs">
                <InfoRow
                  label="ชื่อทรัพย์สิน / รุ่น"
                  value={contract.asset?.modelName || contract.itemTitle || "-"}
                />
                <InfoRow
                  label="SERIAL NUMBER"
                  value={contract.asset?.serial || contract.itemSerial || "-"}
                />
                <InfoRow
                  label="สภาพสินค้า"
                  value={contract.asset?.condition || contract.itemCondition || "-"}
                />
                <InfoRow
                  label="อุปกรณ์"
                  value={contract.asset?.accessories || contract.itemAccessories || "-"}
                />
                <InfoRow
                  label="กล่องเก็บ"
                  value={contract.asset?.storageCode || contract.storageCode || "-"}
                />
              </div>

              {/* รูปภาพทรัพย์สิน */}
              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-700">
                    รูปภาพทรัพย์สิน
                  </span>

                  {images.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400">
                        คลิกรูปเพื่อดูขนาดใหญ่
                      </span>

                      {images.length > 4 && (
                        <button
                          type="button"
                          onClick={() => setShowAllImages((v) => !v)}
                          className="rounded-full border border-slate-300 px-2 py-1 text-[10px] text-slate-600 hover:bg-slate-50"
                        >
                          {showAllImages ? "ซ่อนรูป" : `ดูทั้งหมด (${images.length})`}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {images.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 px-3 py-4 text-center text-[11px] text-slate-400">
                    ยังไม่มีรูปภาพที่แนบไว้กับสัญญานี้
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {thumbImages.map((src, idx) => (
                      <button
                        key={`${idx}-${src.slice(0, 24)}`}
                        type="button"
                        onClick={() => setPreviewImage(src)}
                        className="group relative h-24 w-24 overflow-hidden rounded-xl border border-slate-200"
                        title="คลิกเพื่อดูรูปใหญ่"
                      >
                        <img
                          src={src}
                          alt={`asset-${idx}`}
                          className="h-full w-full object-cover transition group-hover:scale-105"
                          loading="lazy"
                        />
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition group-hover:opacity-100">
                          <span className="rounded-full bg-black/70 px-2 py-0.5 text-[10px] text-white">
                            ดูรูปใหญ่
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* ประวัติการเงิน (mock จากสัญญาเดียว) */}
            <section className="rounded-2xl bg-white p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">
                ประวัติการเงิน
              </h2>
              <div className="overflow-hidden rounded-xl border border-slate-100">
                <table className="min-w-full text-xs">
                  <tbody>
                    <tr className="border-b border-slate-100">
                      <td className="w-32 px-4 py-3 text-[11px] text-slate-400">
                        {startDate
                          ? startDate.toLocaleTimeString("th-TH", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">
                          จ่ายเงินประกันสัญญา (DEPOSIT) {contract.code}
                        </div>
                      </td>
                      <td className="w-32 px-4 py-3 text-right font-semibold text-red-500">
                        -{principal.toLocaleString()}
                      </td>
                      <td className="w-20 px-4 py-3 text-right text-[11px] text-slate-400"></td>
                    </tr>

                    {feeConfig.total > 0 && (
                      <tr>
                        <td className="w-32 px-4 py-3 text-[11px] text-slate-400">
                          {startDate
                            ? startDate.toLocaleTimeString("th-TH", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })
                            : "-"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800">
                            หักค่าธรรมเนียม ณ ที่จ่าย {contract.code}
                          </div>
                        </td>
                        <td className="w-32 px-4 py-3 text-right font-semibold text-emerald-600">
                          +{feeConfig.total.toLocaleString()}
                        </td>
                        <td className="w-20 px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={handlePrintDigital}
                            className="text-[11px] text-sky-600 underline hover:text-sky-700"
                          >
                            ใบเสร็จ
                          </button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* right column : customer + balance */}
          <div className="space-y-4">
            {/* Customer info */}
            <section className="rounded-2xl bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-800">ข้อมูลลูกค้า</h2>
                {contract.customer && !isEditingCustomer && (
                  <button
                    type="button"
                    onClick={handleStartEditCustomer}
                    className="rounded-full border border-slate-300 px-3 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                  >
                    แก้ไขข้อมูลลูกค้า
                  </button>
                )}
              </div>

              {!contract.customer ? (
                <div className="text-xs text-slate-500">ไม่พบข้อมูลลูกค้าในสัญญานี้</div>
              ) : isEditingCustomer && editingCustomer ? (
                <div className="space-y-3 text-xs">
                  <TextInputSmall
                    label="ชื่อ-นามสกุล"
                    value={editingCustomer.name}
                    onChange={(v) => setEditingCustomer({ ...editingCustomer, name: v })}
                  />
                  <TextInputSmall
                    label="เบอร์โทรศัพท์"
                    value={editingCustomer.phone || ""}
                    onChange={(v) => setEditingCustomer({ ...editingCustomer, phone: v })}
                  />
                  <TextInputSmall
                    label="เลขบัตรประชาชน"
                    value={editingCustomer.idCard || ""}
                    onChange={(v) => setEditingCustomer({ ...editingCustomer, idCard: v })}
                  />
                  <TextInputSmall
                    label="Line ID"
                    value={editingCustomer.lineId || ""}
                    onChange={(v) => setEditingCustomer({ ...editingCustomer, lineId: v })}
                  />
                  <TextAreaSmall
                    label="ที่อยู่"
                    value={editingCustomer.address || ""}
                    onChange={(v) => setEditingCustomer({ ...editingCustomer, address: v })}
                  />
                  <TextInputSmall
                    label="LINE TOKEN / UID"
                    value={editingCustomer.lineToken || ""}
                    onChange={(v) => setEditingCustomer({ ...editingCustomer, lineToken: v })}
                  />

                  <div className="mt-3 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={handleCancelEditCustomer}
                      className="rounded-full border border-slate-300 px-3 py-1.5 text-[11px] text-slate-600 hover:bg-slate-50"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveCustomer}
                      className="rounded-full bg-emerald-500 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-emerald-600"
                    >
                      บันทึกข้อมูลลูกค้า
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1 text-xs">
                  <div className="font-semibold text-slate-900">
                    {contract.customer.name || "-"}
                  </div>
                  <div className="text-slate-600">{contract.customer.phone || "-"}</div>

                  <div className="mt-3 space-y-1 text-[11px] text-slate-600">
                    <div>
                      <span className="font-medium text-slate-500">บัตร ปชช.:</span>{" "}
                      {contract.customer.idCard || "-"}
                    </div>
                    <div>
                      <span className="font-medium text-slate-500">Line ID:</span>{" "}
                      {contract.customer.lineId || "-"}
                    </div>
                    <div className="mt-2 whitespace-pre-wrap">
                      <span className="font-medium text-slate-500">ที่อยู่:</span>{" "}
                      {contract.customer.address || "-"}
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Balance card */}
            <section className="rounded-2xl bg-slate-900 p-4 text-slate-50 shadow-lg">
              <h2 className="mb-3 text-sm font-semibold">ยอดคงเหลือ (BALANCE)</h2>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-300">เงินต้น (Principal)</span>
                  <span className="font-semibold">{principal.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-300">ค่าบริการรอบนี้</span>
                  <span>{feeConfig.total.toLocaleString()}</span>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-700 pt-3">
                <div className="text-[11px] text-slate-300">ยอดไถ่ถอนรวมที่ต้องชำระ</div>
                <div className="text-3xl font-semibold text-emerald-400">
                  {totalRedemption.toLocaleString()}
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

      {/* Modal แสดงรูปใหญ่ */}
      {previewImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-h-full max-w-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={previewImage}
              alt="preview"
              className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setPreviewImage(null)}
              className="absolute -right-2 -top-2 rounded-full bg-black px-2 py-1 text-[10px] text-white"
            >
              ปิด
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// --- Small components ---
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-0.5">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-800">
        {value || "-"}
      </div>
    </div>
  );
}

function TextInputSmall({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-medium text-slate-600">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-[11px] outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
      />
    </div>
  );
}

function TextAreaSmall({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-medium text-slate-600">{label}</div>
      <textarea
        rows={3}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-[11px] outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
      />
    </div>
  );
}

export default ContractDetailPage;
