// frontend/src/lib/arrayFromApi.ts
export function arrayFromApi<T = any>(payload: any): T[] {
  if (Array.isArray(payload)) return payload;

  // รองรับรูปแบบที่เจอบ่อย
  const candidates = [
    payload?.data,
    payload?.items,
    payload?.rows,
    payload?.result,
    payload?.consignments,
    payload?.contracts,
    payload?.customers,
    payload?.inventory,
    payload?.inventoryItems,
  ];

  for (const c of candidates) {
    if (Array.isArray(c)) return c;
  }

  return [];
}
