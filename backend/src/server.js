import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import contractsRouter from "./routes/contracts.js";
// import cashbookRouter from "./routes/cashbook.js";

dotenv.config();
const app = express();

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

const allowList = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (allowList.length === 0) return cb(null, true);
      if (allowList.includes(origin)) return cb(null, true);
      return cb(new Error("CORS blocked: " + origin), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.options("*", cors());

app.get("/healthz", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get("/debug/cors", (req, res) => {
  res.json({
    origin: req.headers.origin || null,
    allowList,
  });
});

// ✅ สำคัญ: ต้อง mount ให้ตรงกับ frontend ที่ยิง /api/...
app.use("/api/contracts", contractsRouter);
// app.use("/api/cashbook", cashbookRouter);

app.use((req, res) => {
  res.status(404).json({ ok: false, message: "Not Found", path: req.path });
});

app.use((err, req, res, next) => {
  console.error("API_ERROR:", err);
  res.status(500).json({ ok: false, message: err?.message || "Internal Server Error" });
});

const port = process.env.PORT || 4000;
app.listen(port, () => console.log("✅ Backend running on port", port));
