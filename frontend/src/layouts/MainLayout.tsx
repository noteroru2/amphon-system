import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import type { UserRole } from "../App";

const APP_PREFIX = "/app";

const menuItems = [
  { to: `${APP_PREFIX}`, label: "หน้าแรก" },
  { to: `${APP_PREFIX}/price-check`, label: "ประเมินราคา" },
  { to: `${APP_PREFIX}/deposit/list`, label: "รายการรับฝาก" },
  { to: `${APP_PREFIX}/consignments`, label: "รายการฝากขาย" },
  { to: `${APP_PREFIX}/intake/new`, label: "รับสินค้าเข้าร้าน" },
  { to: `${APP_PREFIX}/inventory`, label: "คลังสินค้า" },
];

const adminItems = [
  { to: `${APP_PREFIX}`, label: "Dashboard" },
  { to: `${APP_PREFIX}/admin/stats`, label: "สรุปยอด/การเงิน" },
  { to: `${APP_PREFIX}/admin/customers`, label: "รายชื่อลูกค้า" },
  { to: `${APP_PREFIX}/admin/cashbook`, label: "บัญชีการเงิน" },
];

export function MainLayout({ role }: { role: UserRole }) {
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (to: string) => {
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
        <div className="border-b border-slate-800 px-6 py-4">
          <div className="text-sm font-semibold">AMPHON System</div>
          <div className="text-xs text-slate-400">Role: {role}</div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4 text-sm">
          {menuItems.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={`flex rounded-xl px-3 py-2 ${
                isActive(item.to)
                  ? "bg-red-600 text-white"
                  : "text-slate-200 hover:bg-slate-800"
              }`}
            >
              {item.label}
            </Link>
          ))}

          {role === "ADMIN" && (
            <div className="mt-4 border-t border-slate-800 pt-3">
              <div className="px-3 text-xs text-slate-500">ADMIN</div>
              {adminItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex rounded-xl px-3 py-2 ${
                    isActive(item.to)
                      ? "bg-red-600 text-white"
                      : "text-slate-200 hover:bg-slate-800"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          )}
        </nav>

        <div className="border-t border-slate-800 px-3 py-4">
          <button
            onClick={handleLogout}
            className="w-full rounded-xl bg-slate-800 px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700"
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
