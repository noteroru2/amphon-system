import { useState } from "react";
import { useNavigate } from "react-router-dom";

type LoginPageProps = {
  onLoggedIn?: (role: "ADMIN" | "STAFF") => void;
};

export function LoginPage({ onLoggedIn }: LoginPageProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const trimmed = code.trim();
    let role: "ADMIN" | "STAFF" | null = null;

    // ✅ รหัสแอดมิน (2 รหัส)
    if (trimmed === "087376" || trimmed === "063757") {
      role = "ADMIN";
    }
    // ✅ รหัสพนักงาน
    else if (trimmed === "064257") {
      role = "STAFF";
    }

    if (!role) {
      setError("ไม่สามารถเข้าสู่ระบบได้ กรุณาตรวจสอบรหัสอีกครั้ง");
      return;
    }

    // ✅ บันทึกสถานะ
    localStorage.setItem("amphon_role", role);
    localStorage.setItem("amphon_logged_in", "true");

    // ✅ แจ้ง App ให้รู้ว่า login แล้ว
    onLoggedIn?.(role);

    // ✅ สำคัญที่สุด: เด้งเข้าแอปจริง
    navigate("/app", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-lg">
        <div className="mb-4 text-center">
          <div className="mb-2 text-2xl font-bold text-red-600">
            AMPHON System
          </div>
          <div className="text-xs text-slate-500">
            เข้าสู่ระบบด้วยรหัสพนักงาน (PIN)
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="text-xs">
            <label className="mb-1 block text-[11px] font-medium text-slate-700">
              รหัสเข้าใช้งาน (PIN)
            </label>
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-red-500 focus:border-red-500 focus:ring-2"
              placeholder="กรอกรหัสพนักงาน"
              autoFocus
            />
          </div>

          {error && (
            <p className="text-[11px] text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-xl bg-red-600 px-3 py-2 text-sm font-medium text-white shadow hover:bg-red-700"
          >
            เข้าสู่ระบบ
          </button>
        </form>

        <div className="mt-4 text-center text-[10px] text-slate-400">
          ร้านอำพล เทรดดิ้ง อุบลราชธานี
        </div>
      </div>
    </div>
  );
}
