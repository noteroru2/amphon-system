import React, { useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";

type PreviewRow = {
  rowIndex: number;
  errors: string[];
  warnings?: string[];
  data: {
    storageCode: string;
    customerName: string;
    lineId: string;
    assetModel: string;
    principal: number;
    startDate: string | null;
    dueDate: string | null;
    termDays: number | null;
    dayDiff?: number | null;
    feeConfig: { docFee: number; storageFee: number; careFee: number; total: number } | any;
    note: string;
    contact: string;
  };
};

export default function AdminImportContractsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const [preview, setPreview] = useState<{
    sheetName: string;
    total: number;
    hasError: boolean;
    rows: PreviewRow[];
  } | null>(null);

  const [commitLoading, setCommitLoading] = useState(false);
  const [commitResult, setCommitResult] = useState<any>(null);

  const validRows = useMemo(() => {
    if (!preview) return [];
    return preview.rows.filter((r) => (r.errors || []).length === 0);
  }, [preview]);

  const validCount = validRows.length;

  const handlePreview = async () => {
    if (!file) return alert("กรุณาเลือกไฟล์ Excel ก่อน");
    try {
      setLoading(true);
      setCommitResult(null);

      const fd = new FormData();
      fd.append("file", file);

      const res = await apiFetch<any>("/admin/import/contracts/preview", {
        method: "POST",
        body: fd as any,
      });

      if (!res?.ok) throw new Error(res?.message || "Preview ไม่สำเร็จ");
      setPreview(res);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Preview ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    if (!preview) return;

    const ok = window.confirm(
      `ยืนยันนำเข้า ${validCount} แถว?\n\n` +
        `✅ จะสร้าง Contract + Cashbook + ActionLog เหมือนสัญญาจริง\n` +
        `❌ จะข้ามแถวที่มี error`
    );
    if (!ok) return;

    try {
      setCommitLoading(true);

      const res = await apiFetch<any>("/admin/import/contracts/commit", {
        method: "POST",
        body: JSON.stringify({ rows: preview.rows }),
      });

      if (!res?.ok) throw new Error(res?.message || "Import ไม่สำเร็จ");

      setCommitResult(res);

      const failedCount = Number(res?.failedCount || 0);
      alert(
        `Import สำเร็จ ${res.imported} รายการ` +
          (failedCount ? ` (มีล้มเหลว ${failedCount} แถว — ดูรายการด้านล่าง)` : "")
      );
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Import ไม่สำเร็จ");
    } finally {
      setCommitLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white p-4 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">
          Admin: นำเข้า Excel (สัญญาฝากดูแล)
        </h1>
        <p className="mt-1 text-xs text-slate-500">
          อัปโหลดไฟล์ → Preview ตรวจ error → Import (บันทึกจริง: Contract + Cashbook + ActionLog)
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="text-sm"
          />

          <button
            onClick={handlePreview}
            disabled={!file || loading}
            className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {loading ? "กำลังอ่านไฟล์..." : "Preview"}
          </button>

          {preview && (
            <button
              onClick={handleCommit}
              disabled={commitLoading || validCount === 0}
              className="rounded-xl bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {commitLoading ? "กำลัง Import..." : `Import (${validCount})`}
            </button>
          )}
        </div>
      </div>

      {commitResult && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-800">
            ผลลัพธ์ Import: สำเร็จ {commitResult.imported} • ล้มเหลว {commitResult.failedCount || 0}
          </div>

          {Array.isArray(commitResult.failed) && commitResult.failed.length > 0 && (
            <div className="mt-2 overflow-auto rounded-xl border border-slate-200">
              <table className="min-w-[700px] w-full text-xs">
                <thead className="bg-slate-50 text-slate-600">
                  <tr>
                    <th className="p-2 text-left">Row</th>
                    <th className="p-2 text-left">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {commitResult.failed.map((f: any, idx: number) => (
                    <tr key={idx}>
                      <td className="p-2">{f.rowIndex}</td>
                      <td className="p-2 text-red-700">{f.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {preview && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-800">
              Sheet: {preview.sheetName} • ทั้งหมด: {preview.total} • ผ่าน: {validCount}
            </div>
            {preview.hasError && (
              <div className="text-xs text-amber-700">
                มีแถวที่ผิดพลาด — ระบบจะ “ไม่ Import” แถวที่มี error
              </div>
            )}
          </div>

          <div className="mt-3 overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-[1250px] w-full text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="p-2 text-left">Row</th>
                  <th className="p-2 text-left">Storage</th>
                  <th className="p-2 text-left">ชื่อลูกค้า</th>
                  <th className="p-2 text-left">รายการ</th>
                  <th className="p-2 text-right">ยอดฝาก</th>
                  <th className="p-2 text-left">วันที่ฝาก</th>
                  <th className="p-2 text-left">วันครบ</th>
                  <th className="p-2 text-left">Term</th>
                  <th className="p-2 text-left">Line</th>
                  <th className="p-2 text-left">Fee Total</th>
                  <th className="p-2 text-left">Warnings</th>
                  <th className="p-2 text-left">Errors</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => {
                  const feeTotal = Number(r.data?.feeConfig?.total || 0);
                  return (
                    <tr key={r.rowIndex} className={r.errors.length ? "bg-amber-50" : ""}>
                      <td className="p-2">{r.rowIndex}</td>
                      <td className="p-2">{r.data?.storageCode}</td>
                      <td className="p-2">{r.data?.customerName}</td>
                      <td className="p-2">{r.data?.assetModel}</td>
                      <td className="p-2 text-right">
                        {Number(r.data?.principal || 0).toLocaleString()}
                      </td>
                      <td className="p-2">
                        {r.data?.startDate
                          ? new Date(r.data.startDate).toLocaleDateString("th-TH")
                          : "-"}
                      </td>
                      <td className="p-2">
                        {r.data?.dueDate
                          ? new Date(r.data.dueDate).toLocaleDateString("th-TH")
                          : "-"}
                      </td>
                      <td className="p-2">
                        {r.data?.termDays ? `${r.data.termDays} วัน` : "-"}
                        {typeof r.data?.dayDiff === "number" ? ` (diff=${r.data.dayDiff})` : ""}
                      </td>
                      <td className="p-2">{r.data?.lineId || "-"}</td>
                      <td className="p-2">{feeTotal ? `${feeTotal.toLocaleString()} ฿` : "-"}</td>
                      <td className="p-2 text-amber-700">
                        {(r.warnings || []).join(", ")}
                      </td>
                      <td className="p-2 text-red-700">{r.errors.join(", ")}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-[11px] text-slate-500">
            หมายเหตุ: Import จะสร้าง Cashbook/ActionLog แบบ “ทำสัญญาใหม่” และใช้ startDate เป็นเวลาบันทึก
          </p>
        </div>
      )}
    </div>
  );
}
