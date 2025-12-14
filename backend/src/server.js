const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

const app = express();

// ====== Basic middleware ======
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

// (Phase 2 จะปรับ CORS ให้ตรงอีกที)
// รองรับหลาย origin: ใส่ได้ทั้ง localhost, vercel/netlify domain
const allowList = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);


// ===== CORS (Render/Vercel) =====
const allowList = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      // allow curl/postman/no-origin
      if (!origin) return cb(null, true);

      // if not set, allow all (dev safe)
      if (allowList.length === 0) return cb(null, true);

      if (allowList.includes(origin)) return cb(null, true);
      return cb(new Error("CORS blocked: " + origin), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// ✅ ตอบ preflight
app.options("*", cors());


// ====== Health Check ======
app.get("/health", async (req, res) => {
  res.json({
    ok: true,
    service: "AMPHON Backend",
    time: new Date().toISOString(),
    env: process.env.NODE_ENV || "unknown",
  });
});

// ====== API routes (ค่อยเสียบของคุณตรงนี้) ======
// app.use("/api/contracts", require("./routes/contracts"));
// app.use("/api/cashbook", require("./routes/cashbook"));

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
app.get("/debug/cors", (req, res) => {
  res.json({
    origin: req.headers.origin || null,
    allowList: (process.env.CORS_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean),
  });
});
