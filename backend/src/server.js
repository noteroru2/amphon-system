import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import contractsRouter from "./routes/contracts.js";
// import cashbookRouter from "./routes/cashbook.js";

dotenv.config();

const app = express();

// ====== Basic middleware ======
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

// ===== CORS (Render/Vercel) =====
const allowList = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // curl/postman
      if (allowList.length === 0) return cb(null, true); // ถ้ายังไม่ตั้ง env ให้ปล่อย dev ไปก่อน
      if (allowList.includes(origin)) return cb(null, true);
      return cb(new Error("CORS blocked: " + origin), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ✅ preflight
app.options("*", cors());

// ====== Health Check ======
app.get("/healthz", (req, res) => {
  res.json({
    ok: true,
    service: "AMPHON Backend",
    time: new Date().toISOString(),
    env: process.env.NODE_ENV || "unknown",
  });
});

// ====== API routes ======
app.use("/api/contracts", contractsRouter);
// app.use("/api/cashbook", cashbookRouter);

app.get("/debug/cors", (req, res) => {
  res.json({
    origin: req.headers.origin || null,
    allowList,
  });
});

// ====== 404 ======
app.use((req, res) => {
  res.status(404).json({ ok: false, message: "Not Found", path: req.path });
});

// ====== Error handler ======
app.use((err, req, res, next) => {
  console.error("API_ERROR:", err);
  res.status(500).json({
    ok: false,
    message: err?.message || "Internal Server Error",
  });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`✅ AMPHON Backend running on port ${port}`);
});
