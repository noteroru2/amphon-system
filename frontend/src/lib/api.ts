// frontend/src/lib/api.ts
import axios, { AxiosRequestConfig } from "axios";

// ตั้ง base URL จาก env (Vite) หรือ fallback ไปโดเมน API หลักของคุณ
export const API_BASE_URL =
  (import.meta as any)?.env?.VITE_API_BASE_URL?.replace(/\/+$/, "") ||
  "https://api.amphontd.com";

// ✅ axios instance (ใช้กับโค้ดที่เรียก api.get/post)
export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: false,
  headers: {
    "Content-Type": "application/json",
  },
});

// ✅ ของเดิมในโปรเจกต์คุณ: apiFetch (กันไฟล์อื่นล่ม)
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

  // ถ้าเป็น FormData/อัปโหลดไฟล์ อย่าบังคับ Content-Type
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

// helper ถ้าบางไฟล์ใช้รูปแบบ axios config
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
