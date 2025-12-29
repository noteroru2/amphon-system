// frontend/src/lib/api.ts
import axios, { AxiosRequestConfig } from "axios";

/**
 * ✅ วิธีอ่าน env ที่ถูกต้องใน Vite
 * - ต้องมี prefix: VITE_
 * - ต้อง restart dev server ทุกครั้งหลังแก้ .env*
 */
const RAW_BASE =
  (import.meta.env.VITE_API_BASE_URL || "").toString().trim();

// ตัด / ท้าย ๆ ออก
const normalizeBase = (s: string) => s.replace(/\/+$/, "");

/**
 * ✅ โหมด dev: ถ้าไม่ได้ตั้ง VITE_API_BASE_URL ให้ใช้ local เป็น default (กันหลุดไป prod)
 * ✅ โหมด prod: ถ้าไม่ได้ตั้ง ให้ fallback ไปโดเมนจริง
 */
export const API_BASE_URL = (() => {
  if (RAW_BASE) return normalizeBase(RAW_BASE);

  const isDev = import.meta.env.DEV;
  if (isDev) return "http://localhost:4000"; // หรือพอร์ต backend local ของคุณ
  return "https://api.amphontd.com";
})();

/**
 * ✅ เปิด debug ได้ด้วย VITE_API_DEBUG=true
 * (ใส่ใน .env.local)
 */
const API_DEBUG = String(import.meta.env.VITE_API_DEBUG || "") === "true";
if (API_DEBUG) {
  // eslint-disable-next-line no-console
  console.log("[api.ts] VITE_API_BASE_URL =", RAW_BASE || "(empty)");
  // eslint-disable-next-line no-console
  console.log("[api.ts] API_BASE_URL =", API_BASE_URL);
}

// ✅ axios instance
export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: false,
  headers: {
    "Content-Type": "application/json",
  },
});

// ✅ fetch wrapper (ของเดิม)
export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const p = String(path || "");

  // ทำให้ path เป็น /api/... เสมอ
  const normalizedPath = p.startsWith("/api/")
    ? p
    : p.startsWith("/")
    ? `/api${p}`
    : `/api/${p}`;

  const url = `${API_BASE_URL}${normalizedPath}`;

  if (API_DEBUG) {
    // eslint-disable-next-line no-console
    console.log("[apiFetch]", options?.method || "GET", url);
  }

  const isFormData =
    typeof FormData !== "undefined" && options.body instanceof FormData;

  const res = await fetch(url, {
    ...options,
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let data: any = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg =
      (data && (data.message || data.error)) ||
      `Request failed: ${res.status}`;
    throw new Error(msg);
  }

  return data as T;
}

// ✅ axios config helper
export async function apiFetchWithConfig<T = any>(
  path: string,
  config?: AxiosRequestConfig
): Promise<T> {
  const r = await api.request<T>({
    url: path,
    method: config?.method || "GET",
    data: (config as any)?.data,
    params: config?.params,
    headers: config?.headers,
  });
  return r.data;
}

export function getApiErrorMessage(err: any) {
  return (
    err?.response?.data?.message ||
    err?.response?.data?.error ||
    err?.message ||
    "เกิดข้อผิดพลาด"
  );
}
