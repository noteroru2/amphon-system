import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import contractRouter from "./routes/contracts.js";
import aiRouter from "./routes/ai.js";
import customersRouter from "./routes/customers.js";
import cashbookRouter from "./routes/cashbook.js";
import inventoryRouter from "./routes/inventory.js"; 
import intakeRoutes from "./routes/intake.js";
import consignmentsRouter from "./routes/consignments.js";
import adminStatsRouter from "./routes/adminStats.js";
import aiBusinessRouter from "./routes/aiBusiness.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use("/api/ai", aiRouter);
app.use("/api/contracts", contractRouter);
app.use("/api/customers", customersRouter); 
app.use("/api/cashbook", cashbookRouter);
app.use("/api/inventory", inventoryRouter);
app.use("/api/intake", intakeRoutes);
app.use("/api/consignments", consignmentsRouter);
app.use("/api/admin/stats", adminStatsRouter);
app.use("/api/ai/business", aiBusinessRouter);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`AMPHON backend running on port ${PORT}`);
});
