import React, { useMemo, useState } from "react";
import { apiFetch } from "../../lib/api";

type PreviewRow = {
  rowIndex: number;
  sheetName?: string;
  errors: string[];
  warnings?: string[];
  data: {
    itemName: string;
    buyDate: string | null;
    sellDate: string | null;
    buyPrice: number;
    sellPrice: number | null;
    profit: number | null;
    note?: string | null;
    channel?: string | null;

    brand?: string | null;
    model?: string | null;
    cpu?: string | null;
    ram?: string | null;
    storage?: string | null;
    gpu?: string | null;
  };
};

export default function AdminImportPriceHistoryPage() {
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(1);

  const [loading, setLoading] = useState(false);

  const [preview, setPreview] = useState<{
    sheetName: string;
    sheetNames?: string[];
    total: number;
    hasError: boolean;
    rows: PreviewRow[];
  } | null>(null);

  const [commitLoading, setCommitLoading] = useState(false);
  const [commitResult, setCommitResult] = useState<any>(null);

  const [allSheets, setAllSheets] = useState(true);
  const [sheetName, setSheetName] = useState<string>("");

  const validRows = useMemo(() => {
    if (!preview) return [];
    return preview.rows.filter((r) => (r.errors || []).length === 0);
  }, [preview]);

  const validCount = validRows.length;

  const resetFile = () => {
    setFile(null);
    setPreview(null);
    setCommitResult(null);
    setInputKey((k) => k + 1); // ✅ เลือกไฟล์เดิมซ้ำได้หลังแก้ไฟล์
  };

  // ---------- Preview ----------
  const handlePreview = async () => {
    if (!file) return alert("กรุณาเลือกไฟล์ Excel ก่อน");
    try {
      setLoading(true);
      setCommitResult(null);

      const fd = new FormData();
      fd.append("file", file);

      const qs = new URLSearchParams();
      if (allSheets) qs.set("allSheets", "1");
      else if (sheetName) qs.set("sheetName", sheetName);

      const res = await apiFetch<any>(
        `/admin/import/price-history/preview?${qs.toString()}`,
        { method: "POST", body: fd as any }
      );

      if (!res?.ok) throw new Error(res?.message || "Preview ไม่สำเร็จ");
      setPreview(res);

      // ตั้งค่า sheetName ครั้งแรก
      if (!sheetName && Array.isArray(res.sheetNames) && res.sheetNames.length) {
        setSheetName(res.sheetNames[0]);
      }
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "Preview ไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  // ---------- Commit ----------
  const handleCommit = async () => {
    if (!preview) return;

    const ok = window.confirm(
      `ยืนยันนำเข้า ${validCount} รายการ?\n\n` +
        `ข้อมูลจะถูกใช้เป็นฐานข้อมูลอ้างอิงราคาให้ AI\n` +
        `ระบบจะข้ามแถวที่มี error`
    );
    if (!ok) return;

    try {
      setCommitLoading(true);

      const res = await apiFetch<any>("/admin/import/price-history/commit", {
        method: "POST",
        body: JSON.stringify({ rows: preview.rows }),
      });

      if (!res?.ok) throw new Error(res?.message || "Import ไม่สำเร็จ");

      setCommitResult(res);

      const failedCount = Number(res?.failedCount || 0);
      alert(
        `Import สำเร็จ ${res.imported} รายการ` +
          (failedCount ? ` (ล้มเหลว ${failedCount} แถว)` : "")
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
        <h1 className="text-lg font-semibold">
          Admin: นำเข้า Excel (ประวัติราคาซื้อขาย)
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          ใช้เป็นฐานข้อมูลอ้างอิงราคาให้ AI • รองรับหลายชีต (12 เดือน)
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            key={inputKey}
            type="file"
            accept=".xlsx,.xls"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />

          <button
            type="button"
            onClick={resetFile}
            className="rounded-xl border px-3 py-2 text-sm"
          >
            รีเซ็ตไฟล์
          </button>

          <button
            onClick={handlePreview}
            disabled={!file || loading}
            className="rounded-xl bg-slate-900 px-4 py-2 text-white text-sm disabled:opacity-60"
          >
            {loading ? "กำลังอ่านไฟล์..." : "Preview"}
          </button>

          {preview && (
            <button
              onClick={handleCommit}
              disabled={commitLoading || validCount === 0}
              className="rounded-xl bg-red-600 px-4 py-2 text-white text-sm disabled:opacity-60"
            >
              {commitLoading ? "กำลัง Import..." : `Import (${validCount})`}
            </button>
          )}
        </div>

        {/* ตัวเลือกชีต */}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-700">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allSheets}
              onChange={(e) => setAllSheets(e.target.checked)}
            />
            รวมทุกชีต (12 เดือน)
          </label>

          {preview?.sheetNames?.length ? (
            <div className="flex items-center gap-2">
              <span>เลือกชีต:</span>
              <select
                className="rounded-lg border px-2 py-1"
                value={sheetName}
                onChange={(e) => setSheetName(e.target.value)}
                disabled={allSheets}
              >
                {preview.sheetNames.map((sn) => (
                  <option key={sn} value={sn}>
                    {sn}
                  </option>
                ))}
              </select>
              <span className="text-slate-400">(Preview ตอนนี้: {preview.sheetName})</span>
            </div>
          ) : (
            <span className="text-slate-400">* กด Preview ก่อนเพื่อดึงรายชื่อชีต</span>
          )}
        </div>
      </div>

      {/* ผล Import */}
      {commitResult && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold">
            ผล Import: สำเร็จ {commitResult.imported} • ล้มเหลว{" "}
            {commitResult.failedCount || 0}
          </div>

          {Array.isArray(commitResult.failed) && commitResult.failed.length > 0 && (
            <div className="mt-2 overflow-auto border rounded-xl">
              <table className="min-w-[700px] w-full text-xs">
                <thead className="bg-slate-50">
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

      {/* ตาราง Preview */}
      {preview && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold mb-2">
            Sheet: {preview.sheetName} • ทั้งหมด {preview.total} • ผ่าน {validCount}
          </div>

          <div className="overflow-auto border rounded-xl">
            <table className="min-w-[1300px] w-full text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="p-2">Sheet</th>
                  <th className="p-2">Row</th>
                  <th className="p-2">รายการ</th>
                  <th className="p-2 text-right">ซื้อ</th>
                  <th className="p-2 text-right">ขาย</th>
                  <th className="p-2 text-right">กำไร</th>
                  <th className="p-2">วันที่ซื้อ</th>
                  <th className="p-2">Brand</th>
                  <th className="p-2">Model</th>
                  <th className="p-2">Warnings</th>
                  <th className="p-2">Errors</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr
                    key={`${r.sheetName || ""}-${r.rowIndex}`}
                    className={r.errors.length ? "bg-amber-50" : ""}
                  >
                    <td className="p-2">{r.sheetName || "-"}</td>
                    <td className="p-2">{r.rowIndex}</td>
                    <td className="p-2">{r.data.itemName}</td>
                    <td className="p-2 text-right">
                      {Number(r.data.buyPrice || 0).toLocaleString()}
                    </td>
                    <td className="p-2 text-right">
                      {r.data.sellPrice !== null ? r.data.sellPrice.toLocaleString() : "-"}
                    </td>
                    <td className="p-2 text-right">
                      {r.data.profit !== null ? r.data.profit.toLocaleString() : "-"}
                    </td>
                    <td className="p-2">
                      {r.data.buyDate
                        ? new Date(r.data.buyDate).toLocaleDateString("th-TH")
                        : "-"}
                    </td>
                    <td className="p-2">{r.data.brand || "-"}</td>
                    <td className="p-2">{r.data.model || "-"}</td>
                    <td className="p-2 text-amber-700">{(r.warnings || []).join(", ")}</td>
                    <td className="p-2 text-red-700">{r.errors.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-[11px] text-slate-500">
            ถ้าแก้ไฟล์แล้ว Preview ยังเหมือนเดิม → กด “รีเซ็ตไฟล์” แล้วเลือกไฟล์ใหม่อีกครั้ง
          </p>
        </div>
      )}
    </div>
  );
}
