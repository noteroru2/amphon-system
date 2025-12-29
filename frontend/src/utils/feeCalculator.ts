import { FeeBreakdown } from "../types";

/**
 * คำนวณค่าฝากดูแลจาก "เรทรายวัน"
 *
 * เงื่อนไขพิเศษ:
 *  - 7 วัน = (ค่าของ 15 วัน) / 2  ✅ ตามที่คุณต้องการ
 */
export const calculateFee = (depositAmount: number, days: number = 15): FeeBreakdown => {
  const amount = Math.max(depositAmount || 0, 0);
  const termDays = Math.max(days || 0, 1);

  // helper: ปัดขึ้นให้ลงท้ายด้วย 0
  const ceilTo10 = (n: number) => Math.ceil(n / 10) * 10;

  // helper: คำนวณแบบเดิม (0.5%/วัน + docFee + 60/40)
  const calcByDailyRate = (a: number, d: number): FeeBreakdown => {
    const dailyRate = 0.005;
    let rawTotal = a * dailyRate * d;

    let totalFee = ceilTo10(rawTotal);

    if (totalFee < 50 && totalFee > 0) totalFee = 50;

    let docFee = 0;
    if (a <= 1000) docFee = 50;
    else if (a <= 5000) docFee = 100;
    else docFee = 200;

    if (totalFee <= docFee) docFee = totalFee;

    const remainder = Math.max(totalFee - docFee, 0);
    const storageFee = Math.floor(remainder * 0.6);
    const careFee = remainder - storageFee;

    return { docFee, storageFee, careFee, total: totalFee };
  };

  // ✅ เงื่อนไขพิเศษ: 7 วัน = 15 วัน / 2
  if (termDays === 7) {
    const fee15 = calcByDailyRate(amount, 15);

    // หาร 2 และปัดขึ้นเป็น 10 บาท เพื่อคงรูปแบบเดิม
    const halfTotal = ceilTo10(fee15.total / 2);

    // สร้าง breakdown ใหม่แบบสัดส่วนเดิมจาก total ที่ได้
    // (ยังคง docFee ตามช่วงวงเงิน แต่ต้องไม่เกิน total)
    let docFee = 0;
    if (amount <= 1000) docFee = 50;
    else if (amount <= 5000) docFee = 100;
    else docFee = 200;

    if (halfTotal <= docFee) docFee = halfTotal;

    const remainder = Math.max(halfTotal - docFee, 0);
    const storageFee = Math.floor(remainder * 0.6);
    const careFee = remainder - storageFee;

    return { docFee, storageFee, careFee, total: halfTotal };
  }

  // default: ใช้สูตรเดิม
  return calcByDailyRate(amount, termDays);
};
