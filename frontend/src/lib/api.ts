// frontend/src/lib/api.ts
const raw = import.meta.env.VITE_API_BASE_URL;

// BASE_URL:
// - dev: fallback เป็น "/api" (ใช้ vite proxy)
// - prod: ตั้งเป็น "https://amphon-backend.onrender.com/api"
export const BASE_URL = (raw ? raw.replace(/\/+$/, "") : "/api").replace(/\/+$/, "");

function normalizePath(path: string) {
  let p = path.startsWith("/") ? path : `/${path}`;

  // ถ้า BASE_URL ลงท้ายด้วย "/api" แล้ว path เริ่มด้วย "/api/..." ให้ตัด "/api" ซ้ำออก
  if (BASE_URL.endsWith("/api") && (p === "/api" || p.startsWith("/api/"))) {
    p = p.replace(/^\/api(\/|$)/, "/");
    if (p === "") p = "/";
  }

  return p;
}

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const p = normalizePath(path);
  const url = `${BASE_URL}${p}`;

  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(url, {
    ...options,
    headers,
    // ถ้าใช้ cookie/session ค่อยเปิด
    // credentials: "include",
  });

  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg =
      (typeof data === "object" && (data?.message || data?.error)) ||
      `API Error ${res.status}`;
    throw new Error(msg);
  }

  return data as T;
}
