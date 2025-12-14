import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import type { UserRole } from "../App";

const APP_PREFIX = "/app";

// ✅ เมนูพนักงาน: ทุก path ต้องอยู่ใต้ /app
const menuItems = [
  { to: `${APP_PREFIX}`, label: "หน้าแรก" },
  { to: `${APP_PREFIX}/price-check`, label: "ประเมินราคา" },
  { to: `${APP_PREFIX}/deposit/list`, label: "รายการรับฝาก" },
  { to: `${APP_PREFIX}/consignments`, label: "รายการฝากขาย" },
  { to: `${APP_PREFIX}/intake/new`, label: "รับสินค้าเข้าร้าน" },
  { to: `${APP_PREFIX}/inventory`, label: "คลังสินค้า" },
];

// ✅ เมนูแอดมิน: ทุก path ต้องอยู่ใต้ /app
const adminItems = [
  // ถ้ายังไม่มีหน้านี้ ให้เปลี่ยนเป็น /app/admin/stats
  // { to: `${APP_PREFIX}/admin/overview`, label: "ภาพรวมร้าน" },
  { to: `${APP_PREFIX}/admin/stats`, label: "สรุปยอด/การเงิน" },
  { to: `${APP_PREFIX}/admin/customers`, label: "รายชื่อลูกค้า" },
  { to: `${APP_PREFIX}/admin/cashbook`, label: "บัญชีการเงิน" },
];

export function MainLayout({ role }: { role: UserRole }) {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (to: string) => {
    // highlight หน้าแรก /app
    if (to === APP_PREFIX) return location.pathname === APP_PREFIX;
    return location.pathname.startsWith(to);
  };

  const handleLogout = () => {
    localStorage.removeItem("amphon_role");
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="flex w-64 flex-col bg-slate-900 text-slate-100">
        <div className="flex items-center gap-3 border-b border-slate-800 px-6 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-600 font-bold">
            A
          </div>
          <div>
            <div className="text-sm font-semibold tracking-wide">AMPHON System</div>
            <div className="text-xs text-slate-400">
              Role:{" "}
              <span className="inline-flex items-center rounded-full bg-slate-800 px-2 py-0.5 text-[10px] uppercase tracking-wide">
                {role ?? "GUEST"}
              </span>
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4 text-sm">
          {menuItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`flex items-center rounded-xl px-3 py-2 transition ${
                isActive(item.to)
                  ? "bg-red-600 text-white shadow-md"
                  : "text-slate-200 hover:bg-slate-800"
              }`}
            >
              {item.label}
            </Link>
          ))}

          {role === "ADMIN" && (
            <div className="mt-4 border-t border-slate-800 pt-3">
              <div className="mb-1 px-3 text-xs font-semibold uppercase text-slate-500">
                Admin
              </div>
              {adminItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center rounded-xl px-3 py-2 transition ${
                    isActive(item.to)
                      ? "bg-red-600 text-white shadow-md"
                      : "text-slate-200 hover:bg-slate-800"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </nav>

        <div className="border-t border-slate-800 px-3 py-4 text-xs text-slate-400">
          <button
            onClick={handleLogout}
            className="w-full rounded-xl bg-slate-800 px-3 py-2 text-left text-slate-200 hover:bg-slate-700"
          >
            ออกจากระบบ
          </button>
        </div>
      </aside>

      <main className="flex-1">
        <div className="mx-auto max-w-7xl px-6 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
