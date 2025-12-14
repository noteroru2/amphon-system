import { Router } from "express";

export const router = Router();

// Simple hardcoded login based on blueprint
router.post("/login", (req, res) => {
  const { pin } = req.body;
  if (pin === "087376") {
    return res.json({ role: "ADMIN" });
  }
  if (pin === "064257") {
    return res.json({ role: "STAFF" });
  }
  return res.status(401).json({ error: "รหัสเข้าใช้งานไม่ถูกต้อง" });
});
