-- inventory_v2: reset InventoryItem + enums + FK ให้ตรง schema ใหม่

-- 1) ตัด FK เดิมจาก CashbookEntry → InventoryItem (ถ้ามี)
ALTER TABLE "CashbookEntry" DROP CONSTRAINT IF EXISTS "CashbookEntry_inventoryItemId_fkey";

-- 2) ลบตาราง InventoryItem เดิมทิ้ง (พร้อม constraint ที่อ้างถึง)
DROP TABLE IF EXISTS "InventoryItem" CASCADE;

-- 3) ลบ enum เก่าที่เกี่ยวข้อง (ถ้ามีอยู่)
DROP TYPE IF EXISTS "InventorySourceType";
DROP TYPE IF EXISTS "InventoryStatus";

-- 4) สร้าง enum ชุดใหม่ให้ตรงกับ schema.prisma
--   ปรับให้ตรงกับที่คุณประกาศไว้ใน schema.prisma จริง ๆ
CREATE TYPE "InventorySourceType" AS ENUM ('FORFEIT', 'BUY', 'OTHER');
CREATE TYPE "InventoryStatus"     AS ENUM ('IN_STOCK', 'SOLD');

-- 5) สร้างตาราง InventoryItem เวอร์ชันใหม่
CREATE TABLE "InventoryItem" (
  "id"                 SERIAL PRIMARY KEY,

  -- รหัสสินค้าในคลัง (ใช้รันเป็น STO-YYYY-XXX ในโค้ด)
  "code"               TEXT NOT NULL,

  -- ชื่อสินค้าหลัก
  "name"               TEXT NOT NULL,

  -- รายละเอียดตัวเครื่อง
  "serial"             TEXT,
  "condition"          TEXT,
  "accessories"        TEXT,

  -- ที่เก็บในร้าน (เช่น A-040, ชั้น 2 ฯลฯ)
  "storageLocation"    TEXT,

  -- จำนวน และหน่วย (เผื่ออนาคตมีของแยกชิ้น เช่น “กล่องสายชาร์จ 10 ชิ้น”)
  "quantity"           INTEGER NOT NULL DEFAULT 1,
  "unit"               TEXT NOT NULL DEFAULT 'PCS',

  -- การเงิน
  "cost"               DECIMAL(12,2), -- ทุนรวมของล็อตนี้
  "appraisedPrice"     DECIMAL(12,2), -- ราคาประเมิน / ราคากลาง
  "targetPrice"        DECIMAL(12,2), -- ราคาตั้งขาย
  "sellingPrice"       DECIMAL(12,2), -- ราคาขายจริงเฉลี่ยต่อชิ้น (กรณีขายทีละชิ้นจะจัดการในโค้ด)
  "grossProfit"        DECIMAL(12,2),
  "netProfit"          DECIMAL(12,2),

  -- แหล่งที่มาของทรัพย์
  "sourceType"         "InventorySourceType" NOT NULL,
  "status"             "InventoryStatus" NOT NULL DEFAULT 'IN_STOCK',

  -- อ้างอิงสัญญาต้นทาง (กรณีมาจากตัดหลุดสัญญาฝากดูแล)
  "sourceContractId"   INTEGER,
  "sourceContractCode" TEXT,

  -- ข้อมูลผู้ซื้อ (ตอนขาย)
  "buyerName"          TEXT,
  "buyerPhone"         TEXT,
  "buyerAddress"       TEXT,
  "buyerTaxId"         TEXT,

  -- ผูกกับ Customer (ใช้รวบรวมลูกค้าใน /admin/customers)
  "buyerCustomerId"    INTEGER,

  -- เวลา
  "createdAt"          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  -- UNIQUE code ให้ตรงกับ @unique ใน schema.prisma
  CONSTRAINT "InventoryItem_code_key" UNIQUE ("code"),

  -- FK ไปยัง Contract (FORFEIT จากสัญญา)
  CONSTRAINT "InventoryItem_sourceContractId_fkey"
    FOREIGN KEY ("sourceContractId")
    REFERENCES "Contract"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE,

  -- FK ไปยัง Customer (ผู้ซื้อ)
  CONSTRAINT "InventoryItem_buyerCustomerId_fkey"
    FOREIGN KEY ("buyerCustomerId")
    REFERENCES "Customer"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE
);

-- 6) ใส่ FK กลับที่ CashbookEntry.inventoryItemId → InventoryItem.id
--    ให้ตรงกับ relation @relation("InventoryCashbook")
ALTER TABLE "CashbookEntry"
  ADD CONSTRAINT "CashbookEntry_inventoryItemId_fkey"
  FOREIGN KEY ("inventoryItemId")
  REFERENCES "InventoryItem"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
