import axios from "axios";

export type OcrIdCardResult = {
  name: string;
  idCard: string;
  address: string;
  /** เก็บ response เดิมไว้เผื่อ debug */
  raw?: any;
};

export type OcrIdCardOptions = {
  /** ปกติ backend ในโปรเจกต์นี้คือ /api/ai/ocr-idcard */
  endpoint?: string;
  /** timeout กัน request ค้าง */
  timeoutMs?: number;
};

/** แปลง File -> data URL (data:image/...;base64,...) */
export async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("อ่านไฟล์ไม่สำเร็จ"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
}

function normalizeOcrResponse(data: any): OcrIdCardResult {
  const name =
    data?.name ??
    data?.fullName ??
    data?.thaiName ??
    data?.thai_fullname ??
    data?.personName ??
    "";
  const idCard =
    data?.idCard ??
    data?.nationalId ??
    data?.citizenId ??
    data?.id_number ??
    data?.citizen_id ??
    "";
  const address =
    data?.address ??
    data?.fullAddress ??
    data?.thaiAddress ??
    data?.homeAddress ??
    "";

  return {
    name: String(name || "").trim(),
    idCard: String(idCard || "").trim(),
    address: String(address || "").trim(),
    raw: data,
  };
}

/**
 * เรียก OCR บัตรประชาชนกับ backend เดียวกันทั้งระบบ
 * backend (ของจริงใน ZIP): POST /api/ai/ocr-idcard รับ JSON: { imageDataUrl | imageBase64 }
 */
export async function ocrIdCardFromDataUrl(
  imageDataUrl: string,
  options: OcrIdCardOptions = {}
): Promise<OcrIdCardResult> {
  const endpoint = options.endpoint ?? "/api/ai/ocr-idcard";
  const timeout = options.timeoutMs ?? 60_000;

  const payload = { imageDataUrl };

  const res = await axios.post(endpoint, payload, {
    headers: { "Content-Type": "application/json" },
    timeout,
  });

  return normalizeOcrResponse(res.data);
}

export async function ocrIdCardFromFile(
  file: File,
  options: OcrIdCardOptions = {}
): Promise<OcrIdCardResult> {
  const dataUrl = await fileToDataUrl(file);
  return await ocrIdCardFromDataUrl(dataUrl, options);
}
