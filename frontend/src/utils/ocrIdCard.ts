import { api } from "../lib/api";

export type OcrIdCardResult = {
  name: string;
  idCard: string;
  address: string;
  valid?: boolean;
  error?: string;
  confidence?: { idCard?: number; name?: number; address?: number };
  raw?: any;
};

export type OcrIdCardOptions = {
  endpoint?: string; // default /api/ai/ocr-idcard
  timeoutMs?: number;
};

export async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function normalizeOcrResponse(raw: any): OcrIdCardResult {
  // backend รูปแบบ: { ok, valid, data, error, confidence }
  if (raw?.ok === false) {
    return {
      name: "",
      idCard: "",
      address: "",
      valid: false,
      error: raw?.message || "OCR ไม่สำเร็จ",
      raw,
    };
  }

  const valid = raw?.valid;
  const d = raw?.data ?? raw;

  const name = String(d?.name ?? d?.fullName ?? d?.thaiName ?? "").trim();
  const idCard = String(d?.idCard ?? d?.citizenId ?? "").trim();
  const address = String(d?.address ?? d?.fullAddress ?? "").trim();

  return {
    name,
    idCard,
    address,
    valid: typeof valid === "boolean" ? valid : undefined,
    error: raw?.error ? String(raw.error) : undefined,
    confidence: raw?.confidence,
    raw,
  };
}

export async function ocrIdCardFromDataUrl(
  imageDataUrl: string,
  options: OcrIdCardOptions = {}
): Promise<OcrIdCardResult> {
  const endpoint = options.endpoint ?? "/api/ai/ocr-idcard";
  const timeout = options.timeoutMs ?? 60_000;

  const res = await api.post(endpoint, { imageDataUrl }, { timeout });

  return normalizeOcrResponse(res.data);
}

export async function ocrIdCardFromFile(
  file: File,
  options: OcrIdCardOptions = {}
): Promise<OcrIdCardResult> {
  const dataUrl = await fileToDataUrl(file);
  return await ocrIdCardFromDataUrl(dataUrl, options);
}
