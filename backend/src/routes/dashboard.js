import { Router } from "express";

export const router = Router();

// Dummy AI business advisor data
router.get("/ai-advice", async (_req, res) => {
  // TODO: pull real stats from DB and call Gemini from backend or frontend
  res.json({
    promotionStrategy: "จัดโปรลด 10% สำหรับลูกค้าที่เคยฝากดูแลเกิน 3 ครั้ง",
    stockAcquisition: "ควรเน้นรับฝากมือถือเรือธงปีล่าสุด และเลี่ยงรุ่นที่เก่ากว่า 4 ปี",
    seoMarketing: "อัปเดต Google My Business และรีวิวหน้าเพจทุกสัปดาห์",
    growthPlan: "เพิ่มบริการรับซื้อโน้ตบุ๊กมือสองแบบตรวจเช็คสภาพละเอียด",
  });
});
