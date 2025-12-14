const BASE_URL = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "");

if (!BASE_URL) {
  // กันลืมตั้งค่า ENV
  console.warn("⚠️ VITE_API_BASE_URL is not set");
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const url = `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    // ถ้าคุณใช้ cookie/session ค่อยเปิด credentials
    // credentials: "include",
  });

  // ช่วย debug ตอน API error
  const text = await res.text();
  let data: any;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const msg =
      typeof data === "object" && data?.message
        ? data.message
        : `API Error ${res.status}`;
    throw new Error(msg);
  }

  return data;
}
