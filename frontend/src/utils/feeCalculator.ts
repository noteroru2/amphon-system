import { FeeBreakdown } from '../types';

/**
 * คำนวณค่าฝากดูแลจาก "เรทรายวัน"
 *
 * เป้า:
 *  - 15 วัน ≈ 7.5% ของเงินฝาก (0.5% ต่อวัน)
 *  - 30 วัน ≈ 15% ของเงินฝาก
 * 
 * ขั้นตอน:
 *  1) คำนวณค่าใช้จ่ายรวมจากเรท 0.5% ต่อวัน
 *  2) ปัดขึ้นเป็นจำนวนเต็มที่ลงท้ายด้วย 0 (เช่น 741 -> 750)
 *  3) แบ่งเป็น docFee (คงรูปแบบเดิม) + storageFee + careFee (60/40)
 */
export const calculateFee = (
  depositAmount: number,
  days: number = 15
): FeeBreakdown => {
  // กันค่าผิดปกติ
  const amount = Math.max(depositAmount || 0, 0);
  const termDays = Math.max(days || 0, 1);

  // 1) เรทรายวัน 0.5% = 0.005
  const dailyRate = 0.005;
  let rawTotal = amount * dailyRate * termDays;

  // 2) ปัดขึ้นให้ลงท้ายด้วย 0 บาท
  //    เช่น 741 → 750, 748 → 750
  let totalFee = Math.ceil(rawTotal / 10) * 10;

  // ถ้าเงินฝากน้อยมากและ totalFee ต่ำมาก บังคับขั้นต่ำซักหน่อยก็ได้ (optional)
  // เช่น อย่างน้อย 50 บาท
  if (totalFee < 50 && totalFee > 0) {
    totalFee = 50;
  }

  // 3) แบ่งเป็น docFee / storageFee / careFee
  //    คุณอาจจะยังอยากให้ docFee fix ตามช่วงวงเงินเหมือนเดิมก็ได้
  let docFee = 0;

  if (amount <= 1000) {
    docFee = 50;
  } else if (amount <= 5000) {
    docFee = 100;
  } else {
    docFee = 200;
  }

  // ถ้า totalFee น้อยกว่า docFee ให้บังคับ docFee = totalFee
  if (totalFee <= docFee) {
    docFee = totalFee;
  }

  const remainder = Math.max(totalFee - docFee, 0);

  // แบ่งที่เหลือ 60/40 แบบเดิม
  const storageFee = Math.floor(remainder * 0.6);
  const careFee = remainder - storageFee;

  const breakdown: FeeBreakdown = {
    docFee,
    storageFee,
    careFee,
    total: totalFee,
  };

  return breakdown;
};
