// src/utils/contractFinancial.ts

export type FeeDetail = {
  docFee: number;
  storageFee: number;
  careFee: number;
  total: number;
};

export type ContractFinancial = {
  principal: number;
  termDays: number;
  fee: FeeDetail;
  netReceive: number;
};

/**
 * ดึงเลขจาก object โดยลองหลายชื่อ field ตามลำดับ
 */
function getNumber(obj: any, keys: string[], defaultValue = 0): number {
  if (!obj) return defaultValue;
  for (const key of keys) {
    if (obj[key] === undefined || obj[key] === null) continue;
    const value = Number(obj[key]);
    if (!Number.isNaN(value)) return value;
  }
  return defaultValue;
}

/**
 * แปลงค่าที่อาจเป็น string JSON ("{...}") ให้กลายเป็น object
 */
function ensureObject(value: any): any {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (typeof value === "object") return value;
  return {};
}

/**
 * ดึงข้อมูลการเงินออกจากสัญญา 1 ฉบับ
 * รองรับทั้งแบบ field อยู่บนสุด และแบบ nested อยู่ใน contract.financial / finance
 */
export function getFinancialFromContract(contract: any): ContractFinancial {
  if (!contract) {
    return {
      principal: 0,
      termDays: 15,
      fee: { docFee: 0, storageFee: 0, careFee: 0, total: 0 },
      netReceive: 0,
    };
  }

  // ตำแหน่งแหล่งข้อมูลหลัก
  const finObj =
    contract.financial ||
    contract.finance ||
    contract.money ||
    null;

  // 1) เงินต้น / วงเงินประกัน
  const principal = getNumber(
    finObj ?? contract,
    ["principal", "securityDeposit", "depositAmount", "pawnAmount", "amount"],
    0
  );

  // 2) จำนวนวันต่อรอบ
  const termDays =
    getNumber(
      finObj ?? contract,
      ["termDays", "term_days", "term", "periodDays"],
      15
    ) || 15;

  // 3) ค่าบริการ (fee) - รองรับหลายชื่อ / หลายตำแหน่ง
  let feeSourceRaw =
    finObj?.feeBreakdown ||
    finObj?.feeConfig ||
    finObj?.fee_config ||
    finObj?.fees ||
    finObj?.fee ||
    contract.feeBreakdown ||
    contract.feeConfig ||
    contract.fee_config ||
    contract.fees ||
    contract.fee ||
    contract.feeDetail ||
    {};

  const feeSource = ensureObject(feeSourceRaw);

  const docFee = getNumber(feeSource, ["docFee", "doc_fee", "documentFee"], 0);
  const storageFee = getNumber(
    feeSource,
    ["storageFee", "storage_fee", "keepFee"],
    0
  );
  const careFee = getNumber(
    feeSource,
    ["careFee", "care_fee", "serviceFee"],
    0
  );

  let total = getNumber(feeSource, ["total", "totalFee", "sum"], 0);
  if (!total) total = docFee + storageFee + careFee;

  // 4) ยอดรับสุทธิ (เงินที่ลูกค้าได้หลังหักค่าบริการ)
  const netRaw = principal - total;
  const netReceive = netRaw > 0 ? netRaw : 0;

  return {
    principal,
    termDays,
    fee: { docFee, storageFee, careFee, total },
    netReceive,
  };
}
