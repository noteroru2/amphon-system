// backend/src/routes/priceCheck.js
import { Router } from "express";
import { priceCheck } from "../services/priceCheck.service.js";

const router = Router();

// ✅ health ของโมดูลนี้ (ช่วย debug ได้ทันที)
router.get("/price-check/ping", (req, res) => {
  res.json({ ok: true, module: "priceCheckRouter" });
});

// ✅ POST /api/price-check  (เพราะ server.js mount ไว้ที่ app.use("/api", router))
router.post("/price-check", async (req, res) => {
  try {
    const data = await priceCheck(req.body);
    return res.json({ ok: true, data });
  } catch (e) {
    const status = e?.statusCode || 500;
    return res.status(status).json({
      ok: false,
      message: e?.message || "Price check failed",
    });
  }
});

export default router;
