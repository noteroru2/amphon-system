// frontend/src/lib/api.ts
const raw = import.meta.env.VITE_API_BASE_URL;

// ✅ fallback ให้ dev ใช้ proxy (/api) ได้ ถ้าคุณมีตั้ง proxy ใน vite
// ✅ production ค่อยตั้ง VITE_API_BASE_URL เป็น https://amphon-backend.onrender.com
const BASE_URL = (raw ? raw.replace(/\/$/, "") : "/api").replace(/\/$/, "");

export async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const p = path.startsWith("/") ? path : `/${path}`;
  const url = `${BASE_URL}${p}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
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
