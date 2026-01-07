// backend/src/routes/contracts.js
import express from "express";
import { prisma } from "../db.js";
import axios from "axios";

const router = express.Router();

async function pushLineMessage(lineUserID, messages) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN");

  await axios.post(
    "https://api.line.me/v2/bot/message/push",
    { to: lineUserID, messages },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 15000,
    }
  );
}

// แนะนำให้ทำ helper ตรงนี้เลย
async function createCashbookEntry({
  type,          // "IN" | "OUT"
  category,      // string ระบุชนิด เช่น "DEPOSIT_PRINCIPAL_OUT"
  amount,        // number
  profit = 0,    // number
  contractId = null,
  inventoryItemId = null,
  description = "",
}) {
  try {
    await prisma.cashbookEntry.create({
      data: {
        type,
        category,
        amount,
        profit,
        contractId,
        inventoryItemId,
        description,
      },
    });
  } catch (err) {
    console.error("createCashbookEntry error:", err);
    // อย่าทำให้ flow หลักพังเพราะลง cashbook ไม่ได้
  }
}



/**
 * Helper: normalize feeConfig ให้มี field ครบและเป็นตัวเลขเสมอ
 */
function normalizeFeeConfig(raw) {
  const f = raw || {};
  const toNum = (v) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  };

  return {
    docFee: toNum(f.docFee),
    storageFee: toNum(f.storageFee),
    careFee: toNum(f.careFee),
    total: toNum(f.total ?? f.docFee + f.storageFee + f.careFee),
  };
}


// ------- helper: สร้าง inventory item จากสัญญา -------

async function createInventoryFromForfeitContract(contract, principal) {
  // -------- 1) กันสร้างซ้ำ --------
  const existed = await prisma.inventoryItem.findFirst({
    where: {
      sourceType: "FORFEIT",
      sourceContractId: contract.id,
    },
  });
  if (existed) return existed;

  // -------- 2) เตรียมข้อมูลทรัพย์ --------
  const itemTitle =
    contract.assetModel ||
    contract.itemTitle ||
    `ทรัพย์จากสัญญา ${contract.code}`;

  const itemSerial = contract.assetSerial || contract.itemSerial || "";
  const itemCondition = contract.assetCondition || contract.itemCondition || "";
  const itemAccessories =
    contract.assetAccessories || contract.itemAccessories || "";
  const storageLocation = contract.storageCode || null;

  const cost = Number(principal ?? 0);

  // -------- 3) คำนวณราคาขายเป้าหมาย --------
  const feeTotal = Number(contract?.feeConfig?.total ?? 0);

  // ราคาขายเป้าหมาย = ทุน + ค่าบริการที่ควรได้
  const targetPrice = Math.max(cost + feeTotal, cost);

  const code = await getNextInventoryCode();

  // -------- 4) สร้าง Inventory --------
  const created = await prisma.inventoryItem.create({
    data: {
      code,
      name: itemTitle,
      serial: itemSerial,
      condition: itemCondition,
      accessories: itemAccessories,
      storageLocation,

      // ที่มา
      sourceType: "FORFEIT",
      sourceContractId: contract.id,
      sourceContractCode: contract.code,

      // การเงิน
      cost,
      targetPrice,

      // สต๊อก
      status: "IN_STOCK",
      quantity: 1,
      quantityAvailable: 1,
      quantitySold: 0,
    },
  });

  console.log(
    "[Inventory] created from forfeit:",
    created.code,
    created.name,
    "cost:",
    cost,
    "target:",
    targetPrice
  );

  return created;
}




// สร้างรหัสสินค้าในคลังแบบง่าย ๆ เช่น INV-0001, INV-0002 ...
async function getNextInventoryCode() {
  const last = await prisma.inventoryItem.findFirst({
    orderBy: { id: "desc" },
  });

  if (!last || !last.code) {
    return "INV-0001";
  }

  const match = String(last.code).match(/^(INV-)(\d+)$/);
  if (match) {
    const prefix = match[1];
    const num = parseInt(match[2] || "0", 10) + 1;
    return `${prefix}${String(num).padStart(4, "0")}`;
  }

  // ถ้ารูปแบบไม่ตรง ก็เริ่มใหม่แบบง่าย ๆ
  return "INV-0001";
}


/**
 * แปลง Contract จาก Prisma -> รูปแบบ JSON ที่ frontend ใช้
 * - มีทั้ง principal และ securityDeposit (เผื่อโค้ดเก่า)
 * - มี feeConfig แบบ normalize แล้ว
 * - มี asset + itemTitle/itemSerial เพื่อให้ printHelpers ใช้งานได้
 */
function mapContractToResponse(contract) {
  if (!contract) return null;

  const principal =
    typeof contract.principal === "number"
      ? contract.principal
      : typeof contract.securityDeposit === "number"
      ? contract.securityDeposit
      : 0;

  const assetModel = contract.assetModel || contract.itemTitle || "";
  const assetSerial = contract.assetSerial || contract.itemSerial || "";
  const assetCondition = contract.assetCondition || contract.itemCondition || "";
  const assetAccessories = contract.assetAccessories || contract.itemAccessories || "";
  const storageCode = normalizeStorageCode(contract.storageCode) || (contract.storageCode || "");


  const imagesArr = Array.isArray(contract.images)
  ? contract.images
      .map((img) => img?.urlOrData || null)
      .filter(Boolean)
  : [];


  const logsArr = Array.isArray(contract.actionLogs)
    ? contract.actionLogs
        .map((log) => ({
          id: log.id,
          action: log.action,
          amount: log.amount,
          createdAt: log.createdAt,
        }))
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    : [];


  const cashbookArr = Array.isArray(contract.cashbookEntries)
  ? contract.cashbookEntries
      .map((cb) => ({
        id: cb.id,
        type: cb.type,              // IN / OUT
        category: cb.category,
        amount: cb.amount,
        profit: cb.profit,
        description: cb.description,
        createdAt: cb.createdAt,
      }))
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() -
          new Date(b.createdAt).getTime()
      )
  : [];

  return {
    // ===== core =====
    id: contract.id,
    code: contract.code,
    type: contract.type,
    status: contract.status,
    createdAt: contract.createdAt,
    updatedAt: contract.updatedAt,
    startDate: contract.startDate,
    dueDate: contract.dueDate,
    termDays: contract.termDays,
    previousContractId: contract.previousContractId ?? null,

    // ===== money =====
    principal,
    securityDeposit: principal,
   feeConfig: normalizeFeeConfig(contract.feeConfig),


    // ===== customer =====
    customer: contract.customer
      ? {
          id: contract.customer.id,
          name: contract.customer.name,
          phone: contract.customer.phone,
          idCard: contract.customer.idCard,
          address: contract.customer.address,
          lineId: contract.customer.lineId,
         
        }
      : null,

    // ===== NEW shape (ที่คุณใช้อยู่ตอนนี้) =====
    asset: {
      modelName: assetModel,
      serial: assetSerial,
      condition: assetCondition,
      accessories: assetAccessories,
      storageCode,
    },

    // ===== OLD/LEGACY fields (กันหน้า detail เก่าพัง) =====
    assetModel,
    assetSerial,
    assetCondition,
    assetAccessories,
    storageCode,

    // บางหน้าเก่าใช้ itemTitle/itemSerial
    itemTitle: assetModel,
    itemSerial: assetSerial,
    itemCondition: assetCondition,
    itemAccessories: assetAccessories,

    // ===== images/logs =====
    images: imagesArr,
    logs: logsArr,
    cashbook: cashbookArr,
  };
}


function normalizeStorageCode(input = "") {
  // รองรับ: "A952-001" -> "A952", "a12" -> "A012", "B001" -> "B001"
  const s = String(input).trim().toUpperCase();

  // จับ letter + 1-3 digits และตัดส่วนที่เหลือหลัง dash ทิ้ง
  const m = s.match(/^([A-Z])\s*0*([0-9]{1,3})(?:-.*)?$/);
  if (!m) return "";

  const letter = m[1];
  const num = parseInt(m[2], 10);

  if (!Number.isFinite(num) || num <= 0) return "";
  const clamped = Math.min(num, 999);

  return `${letter}${String(clamped).padStart(3, "0")}`;
}

function nextStorageCodeFrom(lastCode) {
  const last = normalizeStorageCode(lastCode);
  if (!last) return "A001";

  const letter = last[0];
  const num = parseInt(last.slice(1), 10);

  if (num < 999) {
    return `${letter}${String(num + 1).padStart(3, "0")}`;
  }

  // 999 -> next letter, reset 001
  const nextLetterCode = letter.charCodeAt(0) + 1;
  const nextLetter =
    nextLetterCode <= "Z".charCodeAt(0) ? String.fromCharCode(nextLetterCode) : "A";

  return `${nextLetter}001`;
}


/**
 * สร้างเลขกล่องเก็บถัดไป เช่น A-001, A-002 ...
 */
async function getNextStorageCode() {
  // เอา record ล่าสุดตามเวลา/ไอดี (ชัวร์สุด) แล้วค่อย normalize
  const last = await prisma.contract.findFirst({
    where: { storageCode: { not: null } },
    orderBy: { id: "desc" }, // ✅ อย่า orderBy storageCode
    select: { storageCode: true },
  });

  return nextStorageCodeFrom(last?.storageCode);
}


/**
 * สร้างเลขที่สัญญา เช่น DEP-2025-006
 */
async function generateContractCode() {
  const now = new Date();
  const year = now.getFullYear();
  const prefix = `DEP-${year}-`;

  const countThisYear = await prisma.contract.count({
    where: {
      code: {
        startsWith: prefix,
      },
    },
  });

  const running = String(countThisYear + 1).padStart(3, "0");
  return `${prefix}${running}`;
}




/**
 * GET /api/contracts/next-storage-code
 * ใช้หน้า NewDepositPage preload เลขกล่อง
 */
router.get("/next-storage-code", async (req, res) => {
  try {
    const code = await getNextStorageCode();
    return res.json({ storageCode: code });
  } catch (err) {
    console.error("GET /api/contracts/next-storage-code error:", err);
    return res.status(500).json({
      message: "ไม่สามารถดึงเลขที่กล่องเก็บได้",
      error: String(err),
    });
  }
});

// แสดงรายการสัญญา (ใช้ในหน้า รายการรับฝาก)
router.get("/", async (req, res) => {
  try {
    const { status, type } = req.query;

    const where = {};

    // default = เอาเฉพาะสัญญาฝากดูแล
    where.type = typeof type === "string" ? type : "DEPOSIT";

    if (typeof status === "string" && status.length > 0) {
      where.status = status;
    }

    const contracts = await prisma.contract.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        customer: true,
        images: true,
        actionLogs: true,
        cashbookEntries: true,
      },
    });

    const result = contracts.map((c) => mapContractToResponse(c));

    return res.json(result);
  } catch (err) {
    console.error("GET /api/contracts error:", err);
    return res.status(500).json({
      message: "ไม่สามารถดึงรายการสัญญาได้",
      error: err?.message || String(err),
    });
  }
});



/**
 * GET /api/contracts/:id  -> ใช้หน้า ContractDetailPage + หน้า operation ทั้งหมด
 */
// GET /api/contracts/:id
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ message: "invalid id" });
    }

    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        customer: true,
        images: true,
        actionLogs: true,
        cashbookEntries: true,
      },
    });

    if (!contract) {
      return res.status(404).json({ message: "ไม่พบสัญญา" });
    }

    return res.json(mapContractToResponse(contract));
  } catch (err) {
    console.error("GET /api/contracts/:id error", err);
    return res.status(500).json({ message: "Internal Server Error" });
  }
});



/**
 * POST /api/contracts  -> สร้างสัญญาใหม่ (หน้า NewDepositPage)
 * body: { type, customer, asset, financial { principal, termDays, feeBreakdown } }
 */

// สร้างสัญญาใหม่
router.post("/", async (req, res) => {
  try {
    const { type, customer, asset, financial, images } = req.body || {};

    console.log(">>> [POST /contracts] body.images:", images);

    if (!customer || !customer.idCard) {
      return res.status(400).json({
        message: "ต้องมีข้อมูลลูกค้าและเลขบัตรประชาชน",
      });
    }

    // ---------- 1) ลูกค้า: สร้างใหม่หรืออัปเดต ----------
    let customerRecord;

    try {
      // พยายามสร้างลูกค้าใหม่ก่อน
      customerRecord = await prisma.customer.create({
        data: {
          name: customer.name || "",
          phone: customer.phone || "",
          idCard: customer.idCard,
          address: customer.address || "",
          lineId: customer.lineId || "",
          
        },
      });
    } catch (err) {
      // ถ้าเจอ unique constraint บน idCard → อัปเดตแทน
      if (
        err.code === "P2002" &&
        (Array.isArray(err.meta?.target)
          ? err.meta.target.includes("idCard")
          : String(err.meta?.target || "").includes("idCard"))
      ) {
        console.warn("พบลูกค้า idCard นี้อยู่แล้ว → อัปเดตข้อมูลแทน");
        customerRecord = await prisma.customer.update({
          where: { idCard: customer.idCard },
          data: {
            name: customer.name || undefined,
            phone: customer.phone || undefined,
            address: customer.address || undefined,
            lineId: customer.lineId || undefined,
            
          },
        });
      } else {
        throw err;
      }
    }

    // ---------- 2) เตรียมข้อมูลสัญญา ----------
    const now = new Date();

    const allowedTerms = [7, 15, 30];
  const termDaysRaw = Number(financial?.termDays ?? 15);
  const termDays = allowedTerms.includes(termDaysRaw) ? termDaysRaw : 15;
  const normalizedStorageCode =
  normalizeStorageCode(asset?.storageCode) || (await getNextStorageCode());

    const principal = Number(financial?.principal ?? 0) || 0;

    const feeBreakdown =
      financial?.feeBreakdown ?? {
        docFee: 0,
        storageFee: 0,
        careFee: 0,
        total: 0,
      };

    const feeTotal = Number(feeBreakdown.total ?? 0) || 0;

    const startDate = now;
    const dueDate = new Date(
      now.getTime() + termDays * 24 * 60 * 60 * 1000
    );

    // หาเลขสัญญา DEP-YYYY-XXX ล่าสุด
    const lastContract = await prisma.contract.findFirst({
      where: { type: "DEPOSIT" },
      orderBy: { id: "desc" },
    });

    let code;
    if (!lastContract) {
      code = `DEP-${now.getFullYear()}-001`;
    } else {
      const parts = lastContract.code.split("-");
      const lastNumber = parseInt(parts[2] || "0", 10);
      const nextNumber = (lastNumber + 1).toString().padStart(3, "0");
      code = `DEP-${now.getFullYear()}-${nextNumber}`;
    }

    // ---------- 3) สร้างสัญญาใหม่ ----------
    const created = await prisma.contract.create({
      data: {
        code,
        type: type || "DEPOSIT",
        status: "ACTIVE",

        customerId: customerRecord.id,

        startDate,
        dueDate,
        termDays,

        principal,
        feeConfig: feeBreakdown,

        assetModel: asset?.modelName || "",
        assetSerial: asset?.serial || "",
        assetCondition: asset?.condition || "",
        assetAccessories: asset?.accessories || "",
        storageCode: normalizedStorageCode,
      

      // ✅ สร้าง ContractImage แปะกับสัญญา
    images:
      Array.isArray(images) && images.length > 0
        ? {
            create: images.map((urlOrData) => ({
              urlOrData: String(urlOrData),
            })),
          }
        : undefined,
      },

      include: {
        customer: true,
        images: true,
        actionLogs: true,
      },
    });

    console.log(
      ">>> [POST /contracts] createdContract:",
      created.id,
      "images:", 
      created.images?.length
    );
    

    // ---------- 4) Cashbook (ไม่ให้พังสัญญา ถ้า error) ----------
        // ---------- 4) Cashbook (ไม่ให้พังสัญญา ถ้า error) ----------
    try {
      // เงินสุทธิที่ลูกค้าได้รับจริง = principal - ค่าบริการตามสัญญา
      const netReceive = Math.max(principal - feeTotal, 0);

      // จ่ายเงินสุทธิให้ลูกค้า (ยังไม่ถือว่ามีกำไร)
      if (netReceive > 0) {
        await createCashbookEntry({
          type: "OUT",
          category: "DEPOSIT_PRINCIPAL_OUT", // หรือจะเปลี่ยนชื่อเป็น "DEPOSIT_DISBURSE_NET" ก็ได้
          amount: netReceive,
          profit: 0,
          contractId: created.id,
          description: `ทำสัญญาฝากดูแล ${created.code} จ่ายสุทธิให้ลูกค้า ${netReceive} บาท (วงเงิน ${principal} บาท, ค่าบริการตามสัญญา ${feeTotal} บาท)`,
        });
      }

      // log action ว่าเป็นสัญญาใหม่
      await prisma.contractActionLog.create({
        data: {
          contractId: created.id,
          action: "NEW_CONTRACT",
          amount: principal,
          note: "ทำสัญญาใหม่",
        },
      });
    } catch (cashErr) {
      console.error("สร้าง CashbookEntry หรือ ActionLog ไม่สำเร็จ:", cashErr);
      // ไม่ throw เพื่อไม่ให้สัญญาพัง
    }


    // ---------- 5) ส่งกลับ frontend ----------
    const response =
      typeof mapContractToResponse === "function"
        ? mapContractToResponse(created)
        : created;

    return res.json(response);
  } catch (err) {
    console.error("POST /api/contracts error:", err);
    return res.status(500).json({
      message: "ไม่สามารถสร้างสัญญาได้",
      error: err?.message || String(err),
    });
  }
});

router.post("/:id/renew", async (req, res) => {
  try {
    const id = Number(req.params.id);

    const {
      termDays: newTermDays,
      feeConfig: newFeeConfig,   // ค่า feeConfig รอบใหม่จากหน้า Renew
      principal: newPrincipal,   // ถ้าต้องการเปลี่ยนวงเงิน
    } = req.body || {};

    const existing = await prisma.contract.findUnique({
      where: { id },
      include: {
        customer: true,
        images: true,
        actionLogs: true,
      },
    });

    if (!existing) {
      return res.status(404).json({ message: "ไม่พบสัญญาเดิม" });
    }

    // --- ค่าจากสัญญาเดิม ---
    const oldPrincipal = existing.principal ?? 0;
    const oldTermDays = existing.termDays ?? 15;
    const oldFeeConfig =
      existing.feeConfig ?? { docFee: 0, storageFee: 0, careFee: 0, total: 0 };

    // --- กำหนดค่ารอบใหม่ ---
    const usedTermDays = newTermDays ?? oldTermDays;
    const usedPrincipal = newPrincipal ?? oldPrincipal;
    const usedFeeConfig = newFeeConfig ?? oldFeeConfig;

    const feeTotalRenew = Number(usedFeeConfig.total || 0);

    // วันที่เริ่มใหม่ = วันครบกำหนดของสัญญาเก่า
    const startDate = existing.dueDate;
    const dueDate = new Date(
      startDate.getTime() + usedTermDays * 24 * 60 * 60 * 1000
    );

    // -------- สร้างสัญญาเล่มใหม่ --------
    const lastContract = await prisma.contract.findFirst({
      where: { type: "DEPOSIT" },
      orderBy: { id: "desc" },
    });

    const now = new Date();
    let newCode = "";

    if (!lastContract) {
      newCode = `DEP-${now.getFullYear()}-001`;
    } else {
      const parts = lastContract.code.split("-");
      const lastNum = parseInt(parts[2] || "0", 10);
      const nextNum = (lastNum + 1).toString().padStart(3, "0");
      newCode = `DEP-${now.getFullYear()}-${nextNum}`;
    }

    const newContract = await prisma.contract.create({
      data: {
        code: newCode,
        type: existing.type,
        status: "ACTIVE",

        customerId: existing.customerId,
        previousContractId: existing.id,

        startDate,
        dueDate,
        termDays: usedTermDays,
        principal: usedPrincipal,
        feeConfig: usedFeeConfig,

        assetModel: existing.assetModel,
        assetSerial: existing.assetSerial,
        assetCondition: existing.assetCondition,
        assetAccessories: existing.assetAccessories,
        storageCode: existing.storageCode,
      },
      include: {
        customer: true,
        images: true,
        actionLogs: true,
      },
    });

    // ปิดสัญญาเก่า
    await prisma.contract.update({
      where: { id: existing.id },
      data: { status: "RENEWED" },
    });

    // ---------- LOG CASHBOOK: ต่อสัญญา ----------
    if (feeTotalRenew > 0) {
      await createCashbookEntry({
        type: "IN",
        category: "RENEW_FEE",
        amount: feeTotalRenew,
        profit: feeTotalRenew, // กำไร = ค่าบริการเต็ม
        contractId: newContract.id,
        description: `ต่อสัญญาใหม่ ${newContract.code} จากเล่มเดิม ${existing.code}`,
      });
    }

    // -------- เขียน ActionLog --------
    await prisma.contractActionLog.create({
      data: {
        contractId: newContract.id,
        action: "RENEW_CONTRACT",
        amount: feeTotalRenew,
        note: `ต่อสัญญาใหม่จากเล่มเดิม ${existing.code}`,
      },
    });

    const reload = await prisma.contract.findUnique({
      where: { id: newContract.id },
      include: { customer: true, images: true, actionLogs: true },
    });

    return res.json(mapContractToResponse(reload));
  } catch (err) {
    console.error("POST /api/contracts/:id/renew error:", err);
    return res.status(500).json({
      message: "ไม่สามารถต่อสัญญาได้",
      error: err?.message || String(err),
    });
  }
});








// ไถ่ถอน
// ไถ่ถอน
router.post("/:id/redeem", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      return res.status(400).json({ message: "id ไม่ถูกต้อง" });
    }

    const body = req.body || {};

    const contract = await prisma.contract.findUnique({
      where: { id },
      include: { customer: true },
    });
    if (!contract) {
      return res.status(404).json({ message: "ไม่พบสัญญา" });
    }

    // ค่าบริการ ณ เวลาไถ่ถอน (คิดจาก principal ปัจจุบัน ตามสูตรของคุณ)
    const feeConf = normalizeFeeConfig(contract.feeConfig || {});
    const F_redeem = feeConf.total || 0;

    // เงินต้นบนกระดาษ ณ เวลาไถ่ถอน (เช่น 6000)
    const principal = Number(contract.principal ?? 0);

    // ถ้า frontend ส่ง paidTotal มาให้ → ใช้ค่านั้น
    // ถ้าไม่ส่ง → ลูกค้าจ่ายเท่ากับ principal ปัจจุบัน
    const paidTotal =
      typeof body.paidTotal === "number" ? body.paidTotal : principal;

    // เปลี่ยนสถานะสัญญาเป็น REDEEMED
    const updated = await prisma.contract.update({
      where: { id },
      data: { status: "REDEEMED" },
      include: { customer: true },
    });

    // LOG CASHBOOK:
    // amount = เงินที่ลูกค้าจ่ายจริง (ส่วนใหญ่ = principal)
    // profit = ค่าบริการที่คำนวณจาก principal ปัจจุบัน
    await createCashbookEntry({
      type: "IN",
      category: "REDEEM",
      amount: paidTotal,     // ✅ เช่น 6000 (ไม่ใช่ 6000 + 700)
      profit: F_redeem,      // ✅ กำไร = ค่าบริการจาก principal ปัจจุบัน
      contractId: updated.id,
      description: `ไถ่ถอนสัญญา ${updated.code} ลูกค้าจ่ายรวม ${paidTotal} บาท (ทุนประมาณ ${
        paidTotal - F_redeem
      } บาท, กำไรค่าบริการ ${F_redeem} บาท)`,
    });

    return res.json(mapContractToResponse(updated));
  } catch (err) {
    console.error("POST /api/contracts/:id/redeem error:", err);
    return res.status(500).json({
      message: "ไม่สามารถไถ่ถอนได้",
      error: String(err),
    });
  }
});




// ตัดต้น / ปรับวงเงิน
// ตัดต้น / ปรับวงเงิน
router.post("/:id/cut-principal", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      return res.status(400).json({ message: "id ไม่ถูกต้อง" });
    }

    const body = req.body || {};
    const { cutAmount, newPrincipal } = body;

    // ดึงสัญญาปัจจุบัน
    const contract = await prisma.contract.findUnique({
      where: { id },
      include: {
        customer: true,
        images: true,
        actionLogs: true,
      },
    });

    if (!contract) {
      return res.status(404).json({ message: "ไม่พบสัญญา" });
    }

    const P_before = Number(contract.principal ?? 0);
    if (P_before <= 0) {
      return res
        .status(400)
        .json({ message: "principal เดิมต้องมากกว่า 0 จึงจะตัดต้นได้" });
    }

    // ---- คำนวณยอดใหม่ + ยอดที่ถูกตัดออก ----
    let targetPrincipal = P_before;
    let cutValue = 0;

    if (typeof newPrincipal === "number" && !Number.isNaN(newPrincipal)) {
      // เคสกำหนดยอดใหม่ตรง ๆ
      targetPrincipal = Math.max(newPrincipal, 0);
      cutValue = Math.max(P_before - targetPrincipal, 0);
    } else if (typeof cutAmount === "number" && !Number.isNaN(cutAmount)) {
      // เคสส่งยอด "จำนวนที่จะตัด"
      cutValue = Math.max(cutAmount, 0);
      if (cutValue > P_before) cutValue = P_before;
      targetPrincipal = P_before - cutValue;
    } else {
      return res.status(400).json({
        message: "ต้องระบุ cutAmount หรือ newPrincipal เป็นตัวเลข",
      });
    }

    // ถ้าไม่ได้ตัดอะไรเลย
    if (cutValue <= 0) {
      return res.status(400).json({
        message: "จำนวนเงินตัดต้นต้องมากกว่า 0",
      });
    }

    // --- ใช้ feeConfig ของสัญญานี้มาคำนวณกำไรตามสัดส่วน ---
    const feeConf = normalizeFeeConfig(contract.feeConfig || {});
    const F_total = feeConf.total || 0;

    let profitCut = 0;
    if (P_before > 0 && F_total > 0) {
      profitCut = (F_total * (cutValue / P_before));
    }

    // อัปเดต principal ใหม่ในสัญญา
    const updated = await prisma.contract.update({
      where: { id },
      data: {
        principal: targetPrincipal,
      },
      include: {
        customer: true,
        images: true,
        actionLogs: true,
      },
    });

    // log การตัดต้น
    await prisma.contractActionLog.create({
      data: {
        contractId: updated.id,
        action: "CUT_PRINCIPAL",
        amount: cutValue,
        note: `ตัดต้น ${cutValue} บาท เหลือ principal ${targetPrincipal}`,
      },
    });

    // ---------- LOG CASHBOOK: ตัดต้น ----------
    await createCashbookEntry({
      type: "IN",
      category: "CUT_PRINCIPAL",
      amount: cutValue,
      profit: profitCut,
      contractId: updated.id,
      description: `ตัดต้น ${cutValue} บาท จากสัญญา ${updated.code} กำไร ${profitCut}`,
    });

    // reload อีกรอบเพื่อให้ actionLogs ใหม่ถูกส่งไปด้วย
    const reloaded = await prisma.contract.findUnique({
      where: { id: updated.id },
      include: {
        customer: true,
        images: true,
        actionLogs: true,
      },
    });

    return res.json(mapContractToResponse(reloaded));
  } catch (err) {
    console.error("POST /api/contracts/:id/cut-principal error:", err);
    return res.status(500).json({
      message: "ไม่สามารถตัดต้นได้",
      error: String(err),
    });
  }
});



// ตัดหลุด
router.post("/:id/forfeit", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!id || Number.isNaN(id)) {
      return res.status(400).json({ message: "id ไม่ถูกต้อง" });
    }

    // 1) ดึงสัญญาเดิม
    const existing = await prisma.contract.findUnique({
      where: { id },
      include: { customer: true, images: true, actionLogs: true },
    });

    if (!existing) {
      return res.status(404).json({ message: "ไม่พบสัญญา" });
    }

    const principal = Number(existing.principal ?? 0);

    console.log("[FORFEIT] contract", existing.id, existing.code, "principal:", principal);

    // 2) เปลี่ยนสถานะสัญญาเป็น FORFEITED
    const updated = await prisma.contract.update({
      where: { id: existing.id },
      data: {
        status: "FORFEITED",
      },
      include: { customer: true, images: true, actionLogs: true },
    });

    // 3) บันทึก action log
    await prisma.contractActionLog.create({
      data: {
        contractId: updated.id,
        action: "FORFEIT",
        amount: principal,
        note: "ตัดหลุด",
      },
    });

    // 4) สร้างสินค้าในคลังจากสัญญาที่หลุด
    try {
      const inv = await createInventoryFromForfeitContract(updated, principal);
      console.log("[FORFEIT] created inventory item id =", inv.id);
    } catch (invErr) {
      console.error("สร้าง InventoryItem จากการตัดหลุดไม่สำเร็จ:", invErr);
      // ไม่ throw ต่อ เพื่อไม่ให้ flow ตัดหลุดพัง แต่จะเห็น error ใน console แน่นอน
    }

    // 5) reload contract ส่งกลับไปหน้า detail
    const reloaded = await prisma.contract.findUnique({
      where: { id: updated.id },
      include: { customer: true, images: true, actionLogs: true },
    });

    return res.json(mapContractToResponse(reloaded));
  } catch (err) {
    console.error("POST /api/contracts/:id/forfeit error:", err);
    return res.status(500).json({
      message: "ไม่สามารถตัดหลุดได้",
      error: String(err),
    });
  }
});

router.post("/:id/notify-line", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "invalid id" });

    const contract = await prisma.contract.findUnique({
      where: { id },
      include: { customer: true },
    });

    if (!contract) return res.status(404).json({ message: "ไม่พบสัญญา" });
    if (!contract.customer) return res.status(400).json({ message: "สัญญานี้ไม่มีข้อมูลลูกค้า" });

    // ✅ ใช้ field จริงของคุณ
    const lineUserId = String(contract.customer.lineUserId || "").trim();

    if (!lineUserId) {
      return res.status(400).json({
        message: "ลูกค้ายังไม่มี LINE UserID (lineUserID เป็น null) ต้องให้ลูกค้าเพิ่มเพื่อน LINE OA และลงทะเบียนก่อน",
      });
    }

    const appUrl = (process.env.APP_PUBLIC_URL || "http://localhost:5173").replace(/\/$/, "");
    const contractUrl = `${appUrl}/app/contracts/${contract.id}`;

    const principal = Number(contract.principal ?? 0);
    const feeTotal = Number(contract?.feeConfig?.total ?? 0);
    const dueDate = contract.dueDate ? new Date(contract.dueDate).toLocaleDateString("th-TH") : "-";
    // ✅ กล่องเก็บ: รองรับทั้ง field ใหม่/เก่า + กันค่าว่าง
    const storageCode = String(
      contract.storageCode ||
      contract.assetStorageCode || // เผื่อเคยมีชื่ออื่น
      ""
    ).trim() || "-";

    await pushLineMessage(lineUserId, [
      {
        type: "text",
        text:
          `📄 สัญญาฝากดูแลทรัพย์สินของคุณ\n` +
          `เลขที่สัญญา: ${contract.code}\n` +
          `กล่องเก็บ: ${storageCode}\n` + 
          `วงเงิน: ${principal.toLocaleString()} บาท\n` +
          `ค่าบริการ: ${feeTotal.toLocaleString()} บาท\n` +
          `ครบกำหนด: ${dueDate}`,
      },
    ]);

    // optional: เก็บ log
    try {
      await prisma.contractActionLog.create({
        data: {
          contractId: contract.id,
          action: "NOTIFY_CUSTOMER_LINE",
          amount: 0,
          note: `ส่งสัญญาดิจิทัลผ่าน LINE (${lineUserID})`,
        },
      });
    } catch (e) {
      console.warn("notify log create failed:", e?.message || e);
    }

    return res.json({ ok: true, message: "ส่งแจ้งเตือนผ่าน LINE สำเร็จ" });
  } catch (err) {
    console.error("notify-line error:", err?.response?.data || err);
    return res.status(500).json({
      message: "ส่งแจ้งเตือนไม่สำเร็จ",
      error: err?.message || String(err),
    });
  }
});






export default router;
