import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
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
  { to: `${APP_PREFIX}/admin/dashboard`, label: "แดชบอร์ด" },
  { to: `${APP_PREFIX}/admin/stats`, label: "สรุปยอด/การเงิน" },
  { to: `${APP_PREFIX}/admin/customers`, label: "รายชื่อลูกค้า" },
  { to: `${APP_PREFIX}/admin/cashbook`, label: "บัญชีการเงิน" },
];

function MenuLink({
  to,
  label,
  active,
  onClick,
}: {
  to: string;
  label: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={`flex items-center rounded-xl px-3 py-2 transition ${
        active ? "bg-red-600 text-white shadow-md" : "text-slate-200 hover:bg-slate-800"
      }`}
    >
      {label}
    </Link>
  );
}

export function MainLayout({ role }: { role: UserRole }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const isActive = (to: string) => {
    if (to === APP_PREFIX) return location.pathname === APP_PREFIX;
    return location.pathname.startsWith(to);
  };

  const handleLogout = () => {
    localStorage.removeItem("amphon_role");
    navigate("/login", { replace: true });
  };

  // ปิด drawer เมื่อเปลี่ยนหน้า
  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-slate-100">
      {/* TOP BAR (mobile) */}
      <div className="sticky top-0 z-40 flex items-center justify-between border-b bg-slate-900 px-3 py-3 text-slate-100 md:hidden">
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center justify-center rounded-lg bg-slate-800 px-3 py-2 text-sm"
        >
          ☰ เมนู
        </button>

        <div className="text-sm font-semibold">AMPHON System</div>

        <button
          onClick={handleLogout}
          className="rounded-lg bg-slate-800 px-3 py-2 text-sm"
        >
          ออก
        </button>
      </div>

      <div className="flex">
        {/* SIDEBAR (desktop) */}
        <aside className="hidden w-64 flex-col bg-slate-900 text-slate-100 md:flex">
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
              <MenuLink
                key={item.to}
                to={item.to}
                label={item.label}
                active={isActive(item.to)}
              />
            ))}

            {role === "ADMIN" ? (
              <div className="mt-4 border-t border-slate-800 pt-3">
                <div className="mb-1 px-3 text-xs font-semibold uppercase text-slate-500">
                  Admin
                </div>
                {adminItems.map((item) => (
                  <MenuLink
                    key={item.to}
                    to={item.to}
                    label={item.label}
                    active={isActive(item.to)}
                  />
                ))}
              </div>
            ) : null}
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

        {/* MOBILE DRAWER */}
        {open ? (
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setOpen(false)}
            />
            <div className="absolute left-0 top-0 h-full w-72 bg-slate-900 p-3 text-slate-100 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="text-sm font-semibold">เมนู</div>
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-lg bg-slate-800 px-3 py-2 text-sm"
                >
                  ✕
                </button>
              </div>

              <nav className="mt-3 space-y-1 text-sm">
                {menuItems.map((item) => (
                  <MenuLink
                    key={item.to}
                    to={item.to}
                    label={item.label}
                    active={isActive(item.to)}
                    onClick={() => setOpen(false)}
                  />
                ))}

                {role === "ADMIN" ? (
                  <div className="mt-4 border-t border-slate-800 pt-3">
                    <div className="mb-1 px-3 text-xs font-semibold uppercase text-slate-500">
                      Admin
                    </div>
                    {adminItems.map((item) => (
                      <MenuLink
                        key={item.to}
                        to={item.to}
                        label={item.label}
                        active={isActive(item.to)}
                        onClick={() => setOpen(false)}
                      />
                    ))}
                  </div>
                ) : null}

                <div className="mt-4 border-t border-slate-800 pt-3">
                  <button
                    onClick={handleLogout}
                    className="w-full rounded-xl bg-slate-800 px-3 py-2 text-left text-slate-200 hover:bg-slate-700"
                  >
                    ออกจากระบบ
                  </button>
                </div>
              </nav>
            </div>
          </div>
        ) : null}

        {/* CONTENT */}
        <main className="flex-1">
          <div className="mx-auto max-w-7xl px-3 py-4 md:px-6 md:py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
