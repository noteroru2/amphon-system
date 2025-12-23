"use client";

import { useEffect, useMemo, useState } from "react";

type LiffProfile = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
};

type ApiResponse =
  | { ok: true; message: string; contractCode?: string }
  | { ok: false; message: string };

const sanitizePhone = (s: string) => s.replace(/[^0-9]/g, "");

function formatThaiDate(d: string | Date) {
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  }).format(dt);
}

export default function LineRegisterPage() {
  const [profile, setProfile] = useState<LiffProfile | null>(null);
  const [loadingLiff, setLoadingLiff] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [phone, setPhone] = useState("");
  const [storageCode, setStorageCode] = useState("");
  const [consent, setConsent] = useState(false);

  const [result, setResult] = useState<ApiResponse | null>(null);

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  const registerUrl = process.env.NEXT_PUBLIC_N8N_REGISTER_URL;
  const apiKey = process.env.NEXT_PUBLIC_REGISTER_API_KEY;

  const phoneNorm = useMemo(() => sanitizePhone(phone), [phone]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoadingLiff(true);
      setResult(null);

      if (!liffId) {
        setLoadingLiff(false);
        setResult({ ok: false, message: "ยังไม่ได้ตั้งค่า LIFF ID (NEXT_PUBLIC_LIFF_ID)" });
        return;
      }

      // load LIFF SDK
      const scriptId = "liff-sdk";
      if (!document.getElementById(scriptId)) {
        const script = document.createElement("script");
        script.id = scriptId;
        script.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
        script.async = true;
        document.body.appendChild(script);
        await new Promise<void>((resolve, reject) => {
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("โหลด LIFF SDK ไม่สำเร็จ"));
        });
      }

      try {
        // @ts-ignore
        await window.liff.init({ liffId });

        // @ts-ignore
        if (!window.liff.isLoggedIn()) {
          // @ts-ignore
          window.liff.login();
          return; // page will reload after login
        }

        // @ts-ignore
        const p = await window.liff.getProfile();

        if (cancelled) return;

        setProfile({
          userId: p.userId,
          displayName: p.displayName,
          pictureUrl: p.pictureUrl,
        });

        setLoadingLiff(false);
      } catch (e: any) {
        if (cancelled) return;
        setLoadingLiff(false);
        setResult({
          ok: false,
          message:
            "เชื่อมต่อ LINE ไม่สำเร็จ (โปรดเปิดหน้านี้จากใน LINE ผ่านปุ่มลงทะเบียน/LIFF)",
        });
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [liffId]);

  const canSubmit =
    !!profile?.userId &&
    consent === true &&
    (phoneNorm.length >= 9 || storageCode.trim().length > 0) &&
    !submitting;

  async function onSubmit() {
    setResult(null);

    if (!registerUrl) {
      setResult({ ok: false, message: "ยังไม่ได้ตั้งค่า N8N URL (NEXT_PUBLIC_N8N_REGISTER_URL)" });
      return;
    }
    if (!profile?.userId) {
      setResult({ ok: false, message: "ไม่พบ LINE userId" });
      return;
    }
    if (!consent) {
      setResult({ ok: false, message: "กรุณายินยอมรับการแจ้งเตือนก่อน" });
      return;
    }
    if (phoneNorm.length < 9 && storageCode.trim().length === 0) {
      setResult({ ok: false, message: "กรุณากรอกเบอร์โทร หรือเลขกล่องอย่างน้อย 1 อย่าง" });
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        phone: phoneNorm || undefined,
        storageCode: storageCode.trim() || undefined,
        lineUserId: profile.userId,
        displayName: profile.displayName,
        consent: true,
      };

      const res = await fetch(registerUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey ? { "x-api-key": apiKey } : {}),
        },
        body: JSON.stringify(payload),
      });

      const data = (await res.json().catch(() => null)) as ApiResponse | null;

      if (!res.ok) {
        setResult({
          ok: false,
          message: `ผิดพลาดจากเซิร์ฟเวอร์ (HTTP ${res.status})`,
        });
        return;
      }

      if (!data) {
        setResult({ ok: false, message: "ตอบกลับไม่ถูกต้อง (ไม่ใช่ JSON)" });
        return;
      }

      setResult(data);

      // สำเร็จแล้วจะปิด LIFF ก็ได้ (optional)
      // @ts-ignore
      // window.liff.closeWindow();
    } catch (e) {
      setResult({ ok: false, message: "ส่งคำขอไม่สำเร็จ โปรดลองอีกครั้ง" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-4 py-8">
      <div className="mx-auto max-w-lg">
        {/* Header Card */}
        <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 overflow-hidden rounded-2xl bg-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {profile?.pictureUrl ? (
                <img src={profile.pictureUrl} alt="profile" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-slate-500">
                  OA
                </div>
              )}
            </div>

            <div className="min-w-0">
              <div className="text-lg font-semibold text-slate-900">ลงทะเบียนรับแจ้งเตือน</div>
              <div className="text-sm text-slate-600">
                สำหรับระบบฝากดูแลทรัพย์สิน AMPHON System
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700">
            {loadingLiff ? (
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 animate-pulse rounded-full bg-slate-400" />
                กำลังเชื่อมต่อ LINE…
              </div>
            ) : profile ? (
              <div className="space-y-1">
                <div>
                  สวัสดีคุณ <span className="font-medium">{profile.displayName}</span>
                </div>
                <div className="text-xs text-slate-500 break-all">LINE userId: {profile.userId}</div>
              </div>
            ) : (
              <div className="text-rose-600">
                กรุณาเปิดหน้านี้จากใน LINE ผ่านปุ่ม “ลงทะเบียน” (LIFF)
              </div>
            )}
          </div>
        </div>

        {/* Form Card */}
        <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">
                เบอร์โทร (แนะนำให้กรอก)
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                placeholder="เช่น 090-123-4567"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none ring-0 focus:border-slate-400"
              />
              <div className="mt-1 text-xs text-slate-500">
                ระบบจะตัดช่องว่าง/ขีดอัตโนมัติ → <span className="font-medium">{phoneNorm || "-"}</span>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-900">
                เลขกล่อง (storageCode) (ถ้ามี)
              </label>
              <input
                value={storageCode}
                onChange={(e) => setStorageCode(e.target.value)}
                placeholder="เช่น A12"
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none focus:border-slate-400"
              />
              <div className="mt-1 text-xs text-slate-500">
                กรอกเบอร์โทรหรือเลขกล่องอย่างน้อย 1 อย่าง
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <div className="text-sm text-slate-700">
                ฉันยินยอมให้ร้านส่งข้อความแจ้งเตือนวันครบกำหนดสัญญา ผ่าน LINE
                <div className="mt-1 text-xs text-slate-500">
                  คุณสามารถลงทะเบียนซ้ำเพื่อแก้ไขข้อมูลได้ ระบบจะอัปเดตให้ล่าสุด
                </div>
              </div>
            </label>

            <button
              onClick={onSubmit}
              disabled={!canSubmit}
              className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {submitting ? "กำลังลงทะเบียน…" : "ลงทะเบียน"}
            </button>

            {result && (
              <div
                className={[
                  "rounded-2xl border p-4 text-sm",
                  result.ok
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-rose-200 bg-rose-50 text-rose-700",
                ].join(" ")}
              >
                <div className="font-medium">{result.ok ? "สำเร็จ" : "ไม่สำเร็จ"}</div>
                <div className="mt-1">{result.message}</div>
                {"contractCode" in result && result.contractCode ? (
                  <div className="mt-2 text-xs">
                    เลขสัญญา: <span className="font-semibold">{result.contractCode}</span>
                  </div>
                ) : null}
                <div className="mt-2 text-xs text-slate-500">
                  เวลา: {formatThaiDate(new Date())}
                </div>
              </div>
            )}

            <div className="text-xs text-slate-500">
              * หากเปิดหน้านี้จากนอก LINE อาจไม่สามารถอ่าน LINE userId ได้
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 text-center text-xs text-slate-500">
          AMPHON System • LINE Register
        </div>
      </div>
    </div>
  );
}
