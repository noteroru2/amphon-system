import { Router } from "express";
import { router as authRouter } from "./auth.js";
import { router as dashboardRouter } from "./dashboard.js";
import { router as contractsRouter } from "./contracts.js";
import { router as inventoryRouter } from "./inventory.js";
import { router as cashbookRouter } from "./cashbook.js";
import { router as customersRouter } from "./customers.js";
import { router as aiRouter } from "./ai.js";

export const router = Router();

router.use("/auth", authRouter);
router.use("/dashboard", dashboardRouter);
router.use("/contracts", contractsRouter);
router.use("/inventory", inventoryRouter);
router.use("/cashbook", cashbookRouter);
router.use("/customers", customersRouter);
router.use("/ai", aiRouter);
