// src/utils/printHelpers.ts
import { Contract, InventoryItem, Cashbook } from "../types";

/**
 * AMPHON Print Helpers
 * - เอกสาร A4 (สัญญา/ใบเสร็จ) อยู่ในกรอบ A4
 * - E-Slip (มือถือ) แยกสไตล์ของตัวเอง
 * - มี normalizeContract รองรับ schema เก่า/ใหม่
 */

// =========================
// Shop Configuration
// =========================
const SHOP_INFO = {
  name: "ร้านอำพล เทรดดิ้ง",
  address:
    "740/8 ถ.ชยางกูร ต.ในเมือง อ.เมืองอุบลราชธานี จ.อุบลราชธานี 34000",
  phone: "064-2579353",
  line: "",
};

// =========================
// Helpers
// =========================
const money = (v: any): string => {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("th-TH");
};

const safeText = (v: any, fallback = "-") => {
  const s = String(v ?? "").trim();
  return s ? s : fallback;
};

const openPrintWindow = (html: string, w = 900, h = 1100) => {
  const popup = window.open("", "_blank", `width=${w},height=${h}`);
  if (!popup) return;
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
};

// =========================
// Base CSS (A4)
// =========================
const COMMON_A4_CSS = `
  /* A4 base */
  @page { size: A4; margin: 10mm 12mm; }
  * { box-sizing: border-box; }
  html, body { width: 100%; height: auto; }
  body {
    font-family: 'Sarabun', sans-serif;
    font-size: 12px;
    line-height: 1.28;
    color: #000;
    margin: 0;
    padding: 0;
  }

  /* print smoothing */
  @media print {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* common blocks */
  .page { width: 100%; }
  .header { text-align: center; margin-bottom: 10px; }
  .shop-title { font-size: 18px; font-weight: 700; margin: 0; }
  .shop-subtitle { font-size: 11px; margin-top: 2px; color: #222; }
  .title { font-size: 15px; font-weight: 700; margin-top: 6px; }
  .subtitle { font-size: 11px; margin-top: 3px; }

  p { margin: 4px 0; }
  .content { text-align: justify; }
  .indent { padding-left: 14px; }

  .bold { font-weight: 700; }
  .muted { color: #444; }

  .section-header {
    font-weight: 700;
    margin-top: 8px;
    margin-bottom: 4px;
    font-size: 12px;
    text-decoration: underline;
  }

  .box {
    border: 1px solid #e6e6e6;
    padding: 8px;
    border-radius: 6px;
    margin: 6px 0;
  }

  .table-fee { width: 100%; border-collapse: collapse; margin-top: 4px; }
  .table-fee td { padding: 2px 3px; vertical-align: top; }

  /* signatures */
  .signatures {
    margin-top: 16px;
    display: flex;
    justify-content: space-between;
    gap: 14px;
    page-break-inside: avoid;
  }
  .sig-box { text-align: center; width: 48%; }
  .sig-line { border-bottom: 1px dotted #000; margin: 18px 10px 6px 10px; }

  /* receipt */
  .receipt-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #000;
    padding-bottom: 10px;
    margin-bottom: 10px;
    gap: 10px;
  }
  .receipt-info { margin-bottom: 10px; }

  .receipt-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  .receipt-table th {
    border: 1px solid #000;
    padding: 7px;
    background: #f5f5f5;
    text-align: center;
    font-weight: 700;
    font-size: 11px;
  }
  .receipt-table td { border: 1px solid #000; padding: 7px; font-size: 11px; }
  .total-row td { font-weight: 700; background: #fafafa; }

  /* keep 1 page (best effort) */
  @media print {
    .no-break { break-inside: avoid; page-break-inside: avoid; }
  }
`;

// =========================
// Contract specific "fit 1 page" CSS
// (แก้ปัญหา 2 หน้า)
// =========================
const CONTRACT_FIT_ONE_PAGE_CSS = `
  /* ลดนิดเดียวเฉพาะสัญญาให้จบหน้าเดียว */
  @page { margin: 8mm 10mm; }
  body { font-size: 11.2px; line-height: 1.22; }
  .header { margin-bottom: 8px; }
  .shop-title { font-size: 17.5px; }
  .shop-subtitle { font-size: 10.5px; }
  .title { font-size: 14px; margin-top: 6px; }
  .subtitle { font-size: 11px; margin-top: 2px; }
  .section-header { margin-top: 7px; margin-bottom: 4px; font-size: 12px; }
  p { margin: 3px 0; }
  .indent { padding-left: 12px; }
  .sig-line { margin: 16px 10px 6px 10px; }
  .signatures { margin-top: 14px; }
`;

// =========================
// Normalizer (schema เก่า/ใหม่)
// =========================
type NormalizedFee = {
  docFee: number;
  storageFee: number;
  careFee: number;
  total: number;
};

type NormalizedCustomer = {
  name: string;
  idCard: string;
  phone: string;
  lineId: string;
  address: string;
};

type NormalizedAsset = {
  title: string;
  serial: string;
  condition: string;
  accessories: string;
  storageCode: string;
};

type NormalizedContract = {
  code: string;
  type: string;
  startDate?: Date;
  dueDate?: Date;
  principal: number;
  termDays: number;
  fee: NormalizedFee;
  netReceive: number;
  customer: NormalizedCustomer;
  asset: NormalizedAsset;
};

function normalizeContract(contract: Contract | any): NormalizedContract {
  const c: any = contract || {};

  const startDate = c.startDate ? new Date(c.startDate) : undefined;
  const dueDate = c.dueDate ? new Date(c.dueDate) : undefined;

  const principal: number = c.financial?.principal ?? c.principal ?? c.securityDeposit ?? 0;
  const termDays: number = c.financial?.termDays ?? c.termDays ?? 15;

  const feeFromFinancial = c.financial?.feeBreakdown || {};
  const feeFromRoot = c.feeConfig || {};

  const fee: NormalizedFee = {
    docFee: feeFromFinancial.docFee ?? feeFromRoot.docFee ?? 0,
    storageFee: feeFromFinancial.storageFee ?? feeFromRoot.storageFee ?? 0,
    careFee: feeFromFinancial.careFee ?? feeFromRoot.careFee ?? 0,
    total: feeFromFinancial.total ?? feeFromRoot.total ?? 0,
  };

  const netReceive: number =
    c.financial?.netReceive ??
    c.netReceive ??
    Math.max(Number(principal || 0) - Number(fee.total || 0), 0);

  const customerObj = c.customer || {};
  const customer: NormalizedCustomer = {
    name: customerObj.name ?? c.customerName ?? "-",
    idCard: customerObj.idCard ?? customerObj.id_card ?? c.customerIdCard ?? "-",
    phone: customerObj.phone ?? customerObj.phoneNumber ?? c.customerPhone ?? "-",
    lineId: customerObj.lineId ?? customerObj.line_id ?? c.customerLineId ?? "",
    address: customerObj.address ?? customerObj.addressText ?? c.customerAddress ?? "-",
  };

  const assetObj = c.asset || {};
  const asset: NormalizedAsset = {
    title: assetObj.modelName ?? assetObj.title ?? c.itemTitle ?? "-",
    serial: assetObj.serial ?? assetObj.imei ?? c.itemSerial ?? "-",
    condition: assetObj.condition ?? c.itemCondition ?? "-",
    accessories: assetObj.accessories ?? c.itemAccessories ?? "-",
    storageCode: assetObj.storageCode ?? c.storageCode ?? "-",
  };

  return {
    code: c.code ?? "-",
    type: c.type ?? "DEPOSIT",
    startDate,
    dueDate,
    principal: Number(principal || 0),
    termDays: Number(termDays || 15),
    fee: {
      docFee: Number(fee.docFee || 0),
      storageFee: Number(fee.storageFee || 0),
      careFee: Number(fee.careFee || 0),
      total: Number(fee.total || 0),
    },
    netReceive: Number(netReceive || 0),
    customer,
    asset,
  };
}

// =========================
// 1) สัญญาฝากดูแล (A4)
// =========================
export const printContract = (contract: Contract) => {
  const normalized = normalizeContract(contract);

  if (normalized.type !== "DEPOSIT") {
    alert("Printing for Consignment is handled separately.");
    return;
  }

  const { code, startDate, dueDate, principal, termDays, fee, netReceive, customer, asset } =
    normalized;

  const start = startDate || new Date();
  const due = dueDate || new Date();

  const thMonth = start.toLocaleString("th-TH", { month: "long" });
  const thYear = start.getFullYear() + 543;

  const html = `
    <html>
      <head>
        <title>สัญญาบริการรับฝาก - ${safeText(code)}</title>
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <style>
  ${COMMON_A4_CSS}
  ${CONTRACT_FIT_ONE_PAGE_CSS}

  /* ===== Detachable stub (tear-off) ===== */
  .tear-line {
    margin: 10px 0 8px 0;
    border-top: 2px dashed #000;
    position: relative;
  }
  .tear-line:before {
    content: "✂  ส่วนฉีกให้ลูกค้าเก็บไว้ (Customer Copy)";
    position: absolute;
    top: -11px;
    left: 0;
    background: #fff;
    padding: 0 8px;
    font-size: 10.5px;
  }

  .stub {
    border: 1px solid #000;
    padding: 8px;
    border-radius: 6px;
  }
  .stub-title {
    font-size: 13px;
    font-weight: 700;
    text-align: center;
    margin-bottom: 6px;
  }
  .stub-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 10px;
    font-size: 11px;
  }
  .stub-row { display:flex; gap:6px; }
  .stub-label { min-width: 92px; color:#111; font-weight:700; }
  .stub-value { color:#111; }
  .stub-note { margin-top: 6px; font-size: 10px; color:#333; }
  .stub-sign {
    margin-top: 8px;
    display: flex;
    justify-content: space-between;
    gap: 10px;
    font-size: 11px;
  }
  .stub-sign .line {
    width: 48%;
    text-align: center;
  }
  .stub-sign .line .sig {
    border-bottom: 1px dotted #000;
    margin: 18px 0 6px 0;
  }
</style>

      </head>
      <body>
        <div class="page">
          <div class="header">
            <div class="shop-title">${SHOP_INFO.name}</div>
            <div class="shop-subtitle">${SHOP_INFO.address} โทร: ${SHOP_INFO.phone}</div>
            <div class="title">สัญญาบริการรับฝากและดูแลรักษาทรัพย์สิน</div>
            <div class="subtitle">
              เลขที่สัญญา: <span class="bold">${safeText(code)}</span>
              &nbsp;&nbsp;&nbsp;
              วันที่: ${start.getDate()} เดือน ${thMonth} พ.ศ. ${thYear}
            </div>
          </div>

          <div class="content">
            <p>สัญญาฉบับนี้ทำขึ้นระหว่าง</p>
            <p><strong>1. ผู้รับฝาก:</strong> ${SHOP_INFO.name} (ต่อไปนี้จะเรียกว่า "ผู้รับฝากดูแล")</p>
            <p><strong>2. ผู้ฝาก:</strong> คุณ ${safeText(customer.name)} &nbsp;&nbsp; เลขบัตรประชาชน ${safeText(
    customer.idCard
  )}</p>
            <p class="indent">
              เบอร์โทรศัพท์ ${safeText(customer.phone)}
              ${customer.lineId ? `&nbsp; Line ID: ${safeText(customer.lineId, "")}` : ""}
            </p>

            <p>คู่สัญญาทั้งสองฝ่ายตกลงทำสัญญากันดังนี้:</p>

            <div class="section-header">ข้อ 1. รายละเอียดทรัพย์สิน</div>
            <div class="indent">ผู้ฝากตกลงมอบทรัพย์สินให้บริษัทดูแลรักษา ดังรายการต่อไปนี้:</div>

            <div class="box">
              <div>
                <strong>รายการ:</strong> ${safeText(asset.title)}
                &nbsp;|&nbsp; <strong>SN/IMEI:</strong> ${safeText(asset.serial)}
                &nbsp;|&nbsp; <strong>Box:</strong> ${safeText(asset.storageCode)}
              </div>
              <div style="margin-top:4px">
                <strong>สภาพ/ตำหนิ:</strong> ${safeText(asset.condition)}
                &nbsp;|&nbsp; <strong>อุปกรณ์:</strong> ${safeText(asset.accessories)}
              </div>
            </div>

            <div class="section-header">ข้อ 2. เงินประกันความเสียหาย (เงินต้น)</div>
            <div class="indent">
              บริษัทได้สำรองจ่าย "เงินประกันความเสียหาย" ให้แก่ผู้ฝากไว้ล่วงหน้า เป็นจำนวนเงิน
              <strong>${money(principal)} บาท</strong> โดยผู้ฝากได้รับเงินครบถ้วนแล้ว
            </div>

            <div class="section-header">ข้อ 3. ระยะเวลาการฝากและค่าบริการ</div>
            <div class="indent">3.1 กำหนดระยะเวลาการฝากดูแลทรัพย์สิน ${termDays} วัน</div>
            <div class="indent">3.2 ผู้ฝากตกลงชำระ "ค่าบริการดูแลรักษา" รวม <strong>${money(
              fee.total
            )} บาท</strong></div>
            <div class="indent">3.3 แจกแจงรายละเอียดค่าบริการ:</div>

            <table class="table-fee">
              <tr>
                <td>- ค่าดำเนินการเอกสารและตรวจสอบสภาพเครื่อง:</td>
                <td align="right">${money(fee.docFee)} บาท</td>
              </tr>
              <tr>
                <td>- ค่าเช่าพื้นที่จัดเก็บ (ตู้นิรภัยควบคุมอุณหภูมิ):</td>
                <td align="right">${money(fee.storageFee)} บาท</td>
              </tr>
              <tr>
                <td>- ค่าดูแลรักษาระบบ (ชาร์จไฟ/ทำความสะอาด):</td>
                <td align="right">${money(fee.careFee)} บาท</td>
              </tr>
              <tr style="font-weight:bold;">
                <td>(รวมเป็นเงินค่าบริการทั้งสิ้น:</td>
                <td align="right">${money(fee.total)} บาท)</td>
              </tr>
            </table>

            <div class="section-header">ข้อ 4. กำหนดการรับคืน</div>
            <div class="indent">
              เริ่มฝากวันที่: <strong>${start.toLocaleDateString("th-TH")}</strong><br>
              ครบกำหนดวันที่: <strong>${due.toLocaleDateString("th-TH")}</strong> (ครบ ${termDays} วัน)
            </div>

            <div class="section-header">ข้อ 5. การไถ่ถอนทรัพย์สิน</div>
            <div class="indent">ผู้ฝากสามารถติดต่อขอรับทรัพย์สินคืนได้ในเวลาทำการ โดยต้อง:</div>
            <div class="indent">
              1. คืนเงินประกันความเสียหายเต็มจำนวน (ตามข้อ 2)<br>
              2. ชำระค่าบริการดูแลรักษาที่ค้างชำระทั้งหมด (หากมี)
            </div>

            <div class="section-header">ข้อ 6. การผิดนัดและสละกรรมสิทธิ์ (สำคัญ)</div>
            <div class="indent">
              หากผู้ฝาก <u>ไม่มาติดต่อรับคืน</u> หรือ <u>ไม่ชำระค่าบริการ</u> ภายในกำหนดระยะเวลาในข้อ 4
              หรือพ้นกำหนดไปแล้วเกินกว่า 3 วัน ให้ถือว่าผู้ฝาก <strong>มีเจตนาสละกรรมสิทธิ์ในทรัพย์สิน</strong>
              และยินยอมให้ทรัพย์สินตกเป็นของบริษัททันที โดยบริษัทย่อมมีสิทธิ์นำทรัพย์สินดังกล่าวออกขายทอดตลาด
              หรือจัดการตามที่เห็นสมควรเพื่อชดเชยความเสียหาย โดยผู้ฝากตกลงจะไม่เรียกร้องค่าเสียหายหรือฟ้องร้องดำเนินคดีใดๆ ทั้งสิ้น
            </div>

            <div class="section-header">ข้อ 7. สรุปยอดรับสุทธิ</div>
            <div class="indent">
              เงินประกันความเสียหาย : <strong>${money(principal)} บาท</strong>
              หักค่าบริการรวม: <strong>${money(fee.total)} บาท</strong><br>
              ลูกค้าได้รับเงินสุทธิ: <strong>${money(netReceive)} บาท</strong>
            </div>

            <div class="section-header">
              ข้อ 8. ผู้ฝากยืนยันว่าทรัพย์สินนี้เป็นกรรมสิทธิ์ของผู้ฝากจริง ไม่ใช่ของโจรหรือได้มาโดยผิดกฎหมาย
              หากมีปัญหาเกิดขึ้น ผู้ฝากยินยอมชดใช้ค่าเสียหายคืนเต็มจำนวนและรับผิดชอบทางกฎหมายทุกประการ
            </div>

            <div class="signatures no-break">
              <div class="sig-box">
                <div class="sig-line"></div>
                ลงชื่อ ${safeText(customer.name)} ผู้ฝาก<br>
                <span class="muted">(ข้าพเจ้าได้อ่านและเข้าใจรายละเอียดค่าบริการแล้ว)</span>
              </div>
              <div class="sig-box">
                <div class="sig-line"></div>
                ลงชื่อ ....................................................... ผู้รับฝาก (บริษัท)
              </div>
            </div>
          </div>
        </div>
        
        <div class="tear-line"></div>

<div class="stub no-break">
  <div class="stub-title">ใบรับฝากและดูแลรักษาทรัพย์สิน (สำหรับลูกค้าเก็บไว้)</div>

  <div class="stub-grid">
    <div class="stub-row">
      <div class="stub-label">เลขที่สัญญา:</div>
      <div class="stub-value">${safeText(code)}</div>
    </div>
    <div class="stub-row">
      <div class="stub-label">วันที่เริ่มฝาก:</div>
      <div class="stub-value">${start.toLocaleDateString("th-TH")}</div>
    </div>

    <div class="stub-row">
      <div class="stub-label">ครบกำหนด:</div>
      <div class="stub-value"><strong>${due.toLocaleDateString("th-TH")}</strong></div>
    </div>
    <div class="stub-row">
      <div class="stub-label">ระยะเวลา:</div>
      <div class="stub-value">${termDays} วัน</div>
    </div>

    <div class="stub-row" style="grid-column: 1 / span 2;">
      <div class="stub-label">ผู้ฝาก:</div>
      <div class="stub-value">
        คุณ ${safeText(customer.name)} | โทร ${safeText(customer.phone)}
      </div>
    </div>

    <div class="stub-row" style="grid-column: 1 / span 2;">
      <div class="stub-label">ทรัพย์สิน:</div>
      <div class="stub-value">
        ${safeText(asset.title)} | SN/IMEI: ${safeText(asset.serial)} | ช่องเก็บ: ${safeText(asset.storageCode)}
      </div>
    </div>

    <div class="stub-row">
      <div class="stub-label">เงินประกันความเสียหาย:</div>
      <div class="stub-value"><strong>${money(principal)} บาท</strong></div>
    </div>
    <div class="stub-row">
      <div class="stub-label">ค่าบริการ:</div>
      <div class="stub-value">-${money(fee.total)} บาท</div>
    </div>

    
  </div>

  <div class="stub-note">
    *กรุณาเก็บใบนี้ไว้เพื่อนำมาแสดงตอนรับคืนทรัพย์สิน (แนะนำถ่ายรูปเก็บไว้ด้วย)
    <br/>
    โทร: ${SHOP_INFO.phone}
  </div>

 
</div>

        <script>
          window.onload = () => { window.print(); }
        </script>
      </body>
    </html>
  `;

  openPrintWindow(html, 900, 1100);
};

// =========================
// 2) ใบเสร็จดิจิทัล (E-Slip 380px)
// =========================
export const printDigitalContract = (contract: Contract) => {
  const normalized = normalizeContract(contract);
  const { code, startDate, dueDate, principal, fee, netReceive, customer, asset } =
    normalized;

  const start = startDate || new Date();
  const due = dueDate || new Date();

  const html = `
    <html>
      <head>
        <title>E-Slip ${safeText(code)}</title>
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: 'Sarabun', sans-serif;
            background-color: #f3f4f6;
            margin: 0;
            padding: 20px;
            display: flex;
            justify-content: center;
            align-items: flex-start;
            min-height: 100vh;
          }
          .card {
            background: white;
            width: 100%;
            max-width: 380px;
            padding: 0;
            border-radius: 0;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            overflow: hidden;
            position: relative;
          }
          .header-bg {
            background: linear-gradient(135deg, #059669 0%, #10b981 100%);
            padding: 25px 20px 40px 20px;
            color: white;
            text-align: center;
            border-bottom-left-radius: 20px;
            border-bottom-right-radius: 20px;
          }
          .shop-name { font-size: 20px; font-weight: bold; letter-spacing: 0.5px; }
          .doc-type { font-size: 14px; opacity: 0.9; margin-top: 4px; }

          .content-box {
            background: white;
            margin: -25px 15px 15px 15px;
            padding: 20px;
            border-radius: 12px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.05);
            position: relative;
            border: 1px solid #f0f0f0;
          }

          .row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; color: #4b5563; }
          .row.sm { font-size: 12px; color: #6b7280; }
          .row.strong { color: #1f2937; font-weight: 600; }
          .divider { border-bottom: 1px dashed #e5e7eb; margin: 12px 0; }

          .asset-box {
            background-color: #f9fafb;
            border-radius: 8px;
            padding: 10px;
            margin-bottom: 12px;
          }

          .total-section {
            background-color: #ecfdf5;
            border-radius: 8px;
            padding: 12px;
            margin-top: 15px;
            text-align: center;
          }
          .total-label { font-size: 12px; color: #059669; }
          .total-amount { font-size: 24px; font-weight: bold; color: #059669; }

          .footer { text-align: center; font-size: 11px; color: #9ca3af; margin-top: 20px; padding-bottom: 20px; }
          .status-active {
            background: #d1fae5; color: #065f46;
            font-size: 10px; font-weight: bold; padding: 2px 8px;
            border-radius: 10px; display: inline-block;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header-bg">
            <div class="shop-name">${SHOP_INFO.name}</div>
            <div class="doc-type">ใบรับฝาก (Deposit Receipt)</div>
            <div style="margin-top: 10px; opacity: 0.8; font-size: 12px;">${start.toLocaleString(
              "th-TH"
            )}</div>
          </div>

          <div class="content-box">
            <div style="text-align: center; margin-bottom: 15px;">
              <div class="status-active">CONTRACT ACTIVE</div>
              <div style="font-size: 16px; font-weight: bold; color: #374151; margin-top: 5px;">${safeText(
                code
              )}</div>
            </div>

            <div class="row">
              <span>ลูกค้า (Customer)</span>
              <span style="font-weight: 600;">${safeText(customer.name)}</span>
            </div>
            <div class="row sm">
              <span>Phone</span>
              <span>${safeText(customer.phone)}</span>
            </div>

            <div class="divider"></div>

            <div class="asset-box">
              <div style="font-size: 11px; color: #9ca3af; margin-bottom: 4px;">ทรัพย์สินที่ฝาก (Asset)</div>
              <div style="font-weight: bold; font-size: 14px; color: #111;">${safeText(asset.title)}</div>
              <div style="font-size: 12px; color: #6b7280;">SN: ${safeText(asset.serial)}</div>
              <div style="font-size: 12px; color: #6b7280;">Box: ${safeText(asset.storageCode)}</div>
            </div>

            <div class="row">
              <span>เงินต้น (Principal)</span>
              <span style="font-weight: 600;">${money(principal)}</span>
            </div>
            <div class="row">
              <span>ค่าบริการ (รอบนี้)</span>
              <span>-${money(fee.total)}</span>
            </div>

            <div class="divider"></div>

            <div class="row strong" style="font-size: 15px;">
              <span>ยอดรับสุทธิ</span>
              <span style="color: #059669;">${money(netReceive)} บาท</span>
            </div>
            <div style="text-align: right; font-size: 10px; color: #9ca3af;">(จ่ายให้ลูกค้าแล้ว / Paid)</div>

            <div class="total-section">
              <div class="total-label">วันครบกำหนด (Due Date)</div>
              <div class="total-amount">${due.toLocaleDateString("th-TH")}</div>
              <div style="font-size: 11px; color: #047857; margin-top: 2px;">กรุณาติดต่อก่อนกำหนด</div>
            </div>
          </div>

          <div class="footer">
            ขอบคุณที่ใช้บริการ<br>
            โทร: ${SHOP_INFO.phone}
          </div>
        </div>

        <script>
          window.onload = () => { window.print(); }
        </script>
      </body>
    </html>
  `;

  openPrintWindow(html, 420, 800);
};

// =========================
// 3) สัญญาฝากขาย (A4)
// =========================
export const printConsignmentAgreement = (
  item: InventoryItem,
  name: string,
  idCard: string,
  phone: string,
  address: string
) => {
  const currentDate = new Date();

  const html = `
    <html>
      <head>
        <title>สัญญาฝากขายสินค้า</title>
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <style>
          ${COMMON_A4_CSS}
          /* จูนเล็กน้อยเพื่อให้อยู่ A4 สวยขึ้น */
          body { font-size: 11.6px; line-height: 1.25; }
        </style>
      </head>
      <body>
        <div class="page">
          <div class="header">
            <div class="shop-title">${SHOP_INFO.name}</div>
            <div class="shop-subtitle">${SHOP_INFO.address}</div>
            <div class="title" style="margin-top: 10px;">สัญญาแต่งตั้งตัวแทนจำหน่าย (ฝากขายสินค้า)</div>
            <div class="subtitle">
              ทำที่: ${SHOP_INFO.name}
              วันที่: ${currentDate.getDate()} เดือน ${currentDate.toLocaleString("th-TH", {
                month: "long",
              })} พ.ศ. ${currentDate.getFullYear() + 543}
            </div>
          </div>

          <div class="content">
            <p>สัญญาฉบับนี้ทำขึ้นระหว่าง</p>
            <p><strong>1. ผู้รับฝากขาย:</strong> ${SHOP_INFO.name} (ต่อไปนี้จะเรียกว่า "บริษัท") ฝ่ายหนึ่ง</p>
            <p><strong>2. ผู้ฝากขาย:</strong> คุณ ${safeText(name)} &nbsp;&nbsp; เลขบัตรประชาชน ${safeText(
    idCard
  )}</p>
            <p class="indent">ที่อยู่ ${safeText(address)}</p>
            <p class="indent">โทรศัพท์ ${safeText(phone)} (ต่อไปนี้จะเรียกว่า "ผู้ฝากขาย") อีกฝ่ายหนึ่ง</p>

            <p>คู่สัญญาทั้งสองฝ่ายตกลงทำสัญญากันโดยมีข้อความดังต่อไปนี้:</p>

            <div class="section-header">ข้อ 1. รายละเอียดสินค้า</div>
            <div class="indent">ผู้ฝากขายตกลงมอบสินค้าให้บริษัทเป็นตัวแทนในการขาย โดยมีรายละเอียดดังนี้:</div>

            <div class="box">
              <table style="width:100%;">
                <tr><td width="30%"><strong>ประเภทสินค้า:</strong></td><td>อุปกรณ์อิเล็กทรอนิกส์</td></tr>
                <tr><td><strong>ยี่ห้อ/รุ่น:</strong></td><td>${safeText((item as any).title ?? (item as any).name)}</td></tr>
                <tr><td><strong>Serial No. / IMEI:</strong></td><td>${safeText((item as any).serial)}</td></tr>
                <tr><td><strong>สภาพสินค้า/ตำหนิ:</strong></td><td>${safeText((item as any).condition)}</td></tr>
                <tr><td><strong>อุปกรณ์ที่ได้รับมา:</strong></td><td>${safeText((item as any).accessories || "-")}</td></tr>
              </table>
            </div>

            <div class="section-header">ข้อ 2. กรรมสิทธิ์ในสินค้า</div>
            <div class="indent">
              กรรมสิทธิ์ในสินค้าที่ระบุข้างต้น ยังคงเป็นของผู้ฝากขายตลอดเวลา จนกว่าจะมีการขายสินค้าให้แก่บุคคลภายนอกได้สำเร็จ
              บริษัทมีฐานะเป็นเพียงผู้ครอบครองเพื่อรอจำหน่ายและเป็นตัวแทนในการขายเท่านั้น
            </div>

            <div class="section-header">ข้อ 3. ราคาและการชำระเงิน</div>
            <div class="indent">
              3.1 ผู้ฝากขาย ตกลงให้บริษัทขายสินค้าในราคาไม่ต่ำกว่า <strong>${money(
                (item as any).purchasePrice
              )} บาท</strong> ("ราคาสุทธิที่ผู้ฝากรับ")
            </div>
            <div class="indent">
              3.2 บริษัทมีสิทธิ์กำหนด "ราคาขายหน้าร้าน" ได้ตามความเหมาะสม ส่วนต่างระหว่าง "ราคาขายหน้าร้าน" กับ "ราคาสุทธิที่ผู้ฝากรับ"
              ให้ถือเป็น "ค่าบำเหน็จตัวแทน/ค่านายหน้า" ของบริษัท
            </div>
            <div class="indent">
              3.3 เมื่อบริษัทขายสินค้าได้แล้ว บริษัทจะโอนเงิน "ราคาสุทธิที่ผู้ฝากรับ" ให้แก่ผู้ฝากขาย ภายใน 3 วัน ผ่านบัญชีธนาคาร
              .....................................................................
            </div>

            <div class="section-header">ข้อ 4. การรับรองสินค้า</div>
            <div class="indent">
              ผู้ฝากขายขอรับรองว่า สินค้าดังกล่าวเป็นกรรมสิทธิ์ของผู้ฝากขายโดยชอบด้วยกฎหมาย ไม่ใช่ของโจร ไม่ติดสัญญาผูกมัด หรือภาระจำยอมใดๆ
              หากเกิดความเสียหายหรือการฟ้องร้องเกี่ยวกับที่มาของสินค้า ผู้ฝากขายยินยอมชดใช้ค่าเสียหายให้แก่บริษัทเต็มจำนวน
            </div>

            <div class="section-header">ข้อ 5. การยกเลิกสัญญา</div>
            <div class="indent">
              หากบริษัทไม่สามารถขายสินค้าได้ภายในระยะเวลา 90 วัน ผู้ฝากขายสามารถติดต่อขอรับสินค้าคืนได้ โดยไม่มีค่าใช้จ่าย
            </div>

            <div class="signatures no-break">
              <div class="sig-box">
                <div class="sig-line"></div>
                ลงชื่อ ${safeText(name)} ผู้ฝากขาย<br>
                ( ....................................................... )
              </div>
              <div class="sig-box">
                <div class="sig-line"></div>
                ลงชื่อ ....................................................... ผู้รับฝากขาย (ในนามบริษัท)<br>
                ( ....................................................... )
              </div>
            </div>
          </div>
        </div>

        <script>
          window.onload = () => { window.print(); }
        </script>
      </body>
    </html>
  `;

  openPrintWindow(html, 900, 1100);
};

// =========================
// 4) ใบเสร็จไถ่ถอน (A4)
// =========================
export const printRedemptionReceipt = (contract: Contract) => {
  const currentDate = new Date();
  const normalized = normalizeContract(contract);

  const feeConfig = (contract as any).feeConfig || {};
  const feeStatus = (contract as any).feeStatus;
  const extraFee = feeStatus === "UNPAID" ? feeConfig.total ?? normalized.fee.total : 0;

  const principal = normalized.principal;
  const total = principal + Number(extraFee || 0);

  const html = `
    <html>
      <head>
        <title>ใบเสร็จรับเงินไถ่ถอน - ${safeText(normalized.code)}</title>
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
        <style>${COMMON_A4_CSS}</style>
      </head>
      <body>
        <div class="page">
          <div class="receipt-header">
            <div>
              <div class="shop-title">${SHOP_INFO.name}</div>
              <div class="shop-subtitle">${SHOP_INFO.address}</div>
              <div class="shop-subtitle">โทร: ${SHOP_INFO.phone}</div>
            </div>
            <div style="text-align:right;">
              <div class="title">ใบเสร็จรับเงิน (ไถ่ถอน)</div>
              <div style="font-size:12px; margin-top:3px;">REDEMPTION RECEIPT</div>
            </div>
          </div>

          <div class="receipt-info">
            <table style="width:100%;">
              <tr>
                <td width="60%">
                  <strong>ได้รับเงินจาก:</strong> คุณ ${safeText(normalized.customer.name)}<br>
                  <strong>อ้างอิงสัญญาเลขที่:</strong> ${safeText(normalized.code)}
                </td>
                <td width="40%" style="text-align:right;">
                  <strong>วันที่:</strong> ${currentDate.toLocaleDateString("th-TH")}
                </td>
              </tr>
            </table>
          </div>

          <table class="receipt-table">
            <thead>
              <tr>
                <th width="70%">รายการ (Description)</th>
                <th width="30%">จำนวนเงิน (Amount)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div class="bold">คืนเงินประกันความเสียหาย (Principal Return)</div>
                  <div style="margin-top:2px; color:#555;">
                    สำหรับทรัพย์สิน: ${safeText(normalized.asset.title)} (SN: ${safeText(
    normalized.asset.serial
  )})
                  </div>
                </td>
                <td style="text-align:right; vertical-align:top;">${money(principal)}</td>
              </tr>

              ${
                Number(extraFee || 0) > 0
                  ? `
              <tr>
                <td>
                  <div class="bold">ค่าบริการดูแลรักษา (Service Fee)</div>
                  <div style="margin-top:2px; color:#555;">ประจำรอบสัญญา (ค้างชำระ)</div>
                </td>
                <td style="text-align:right; vertical-align:top;">${money(extraFee)}</td>
              </tr>
              `
                  : ""
              }

              <tr><td colspan="2" style="height: 220px; border: none;"></td></tr>
            </tbody>
            <tfoot>
              <tr class="total-row" style="font-size:12px;">
                <td style="text-align:left; padding:8px; background:#fff;">
                  ตัวอักษร: (${money(total)} บาทถ้วน)
                </td>
                <td style="text-align:right; border-top:2px solid #000; padding:8px;">
                  ยอดรวมสุทธิ: ${money(total)} บาท
                </td>
              </tr>
            </tfoot>
          </table>

          <div class="signatures no-break">
            <div class="sig-box">
              <div class="sig-line"></div>
              ผู้รับเงิน / บริษัท
            </div>
            <div class="sig-box">
              <div class="sig-line"></div>
              ผู้จ่ายเงิน / ลูกค้า
            </div>
          </div>
        </div>

        <script>window.onload = function() { window.print(); }</script>
      </body>
    </html>
  `;

  openPrintWindow(html, 900, 1100);
};

// =========================
// 5) ใบเสร็จขายสินค้า (A4) รองรับ qty + unit price
// =========================
type SaleBuyerInfo = {
  name?: string;
  phone?: string;
  address?: string;
  taxId?: string;
};

export const printReceipt = (
  item: InventoryItem,
  sellingPricePerUnit: number,
  quantity: number = 1,
  buyer?: SaleBuyerInfo
) => {
  const currentDate = new Date();

  const qty = Math.max(Number(quantity || 0), 1);
  const unitPrice = Number(sellingPricePerUnit ?? 0);
  const lineTotal = unitPrice * qty;

  const customerDisplay = buyer?.name
    ? `${buyer.name}${buyer.phone ? ` (${buyer.phone})` : ""}`
    : (item as any).buyerName
    ? `${(item as any).buyerName} (${(item as any).buyerPhone || "-"})`
    : "ทั่วไป (Cash Sale)";

  const addressDisplay = buyer?.address || (item as any).buyerAddress || "-";

  const html = `
    <html>
      <head>
        <title>ใบเสร็จรับเงิน - ${SHOP_INFO.name}</title>
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
        <style>${COMMON_A4_CSS}</style>
      </head>
      <body>
        <div class="page">
          <div class="receipt-header">
            <div>
              <div class="shop-title">${SHOP_INFO.name}</div>
              <div class="shop-subtitle">${SHOP_INFO.address}</div>
              <div class="shop-subtitle">โทร: ${SHOP_INFO.phone}</div>
            </div>
            <div style="text-align:right;">
              <div class="title">ใบเสร็จรับเงิน</div>
              <div style="font-size:12px; margin-top:3px;">RECEIPT</div>
            </div>
          </div>

          <div class="receipt-info">
            <table style="width:100%;">
              <tr>
                <td width="60%" style="vertical-align:top;">
                  <strong>ลูกค้า (Customer):</strong> ${safeText(customerDisplay)}<br>
                  <strong>ที่อยู่ (Address):</strong> ${safeText(addressDisplay)}
                </td>
                <td width="40%" style="text-align:right; vertical-align:top;">
                  <strong>เลขที่ (No):</strong> INV-${String((item as any).id ?? 0).padStart(5, "0")}<br>
                  <strong>วันที่ (Date):</strong> ${currentDate.toLocaleDateString("th-TH")}
                </td>
              </tr>
            </table>
          </div>

          <table class="receipt-table">
            <thead>
              <tr>
                <th width="8%">ลำดับ</th>
                <th width="42%">รายการสินค้า (Description)</th>
                <th width="15%">จำนวน (Qty)</th>
                <th width="15%">ราคาต่อหน่วย</th>
                <th width="20%">จำนวนเงิน (Amount)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="text-align:center;">1</td>
                <td>
                  <div class="bold">${safeText((item as any).title || (item as any).name || "-")}</div>
                  <div style="font-size:10px; color:#555;">Serial Number: ${safeText(
                    (item as any).serial || "-"
                  )}</div>
                </td>
                <td style="text-align:center;">${qty}</td>
                <td style="text-align:right;">${money(unitPrice)}</td>
                <td style="text-align:right;">${money(lineTotal)}</td>
              </tr>
              <tr><td colspan="5" style="height: 210px; border-bottom: 1px solid #000;"></td></tr>
            </tbody>
            <tfoot>
              <tr class="total-row">
                <td colspan="3" style="border:none;"></td>
                <td style="text-align:right; border:1px solid #000;">รวมเงิน (Total)</td>
                <td style="text-align:right; border:1px solid #000;">${money(lineTotal)}</td>
              </tr>
              <tr class="total-row">
                <td colspan="3" style="border:none;"></td>
                <td style="text-align:right; border:1px solid #000;">ภาษีมูลค่าเพิ่ม (VAT 7%)</td>
                <td style="text-align:right; border:1px solid #000;">-</td>
              </tr>
              <tr class="total-row" style="font-size:12px;">
                <td colspan="3" style="border:none; text-align:left; background:#fff;">
                  ตัวอักษร: (${money(lineTotal)} บาทถ้วน)
                </td>
                <td style="text-align:right; border:2px solid #000;">จำนวนเงินสุทธิ</td>
                <td style="text-align:right; border:2px solid #000;">${money(lineTotal)}</td>
              </tr>
            </tfoot>
          </table>

          <div style="margin-top: 10px; font-size: 11px; text-align: center;">
            <p>สินค้าซื้อแล้วไม่รับเปลี่ยนหรือคืน (Sold items are non-refundable)</p>
            <p>ขอบคุณที่ใช้บริการ</p>
          </div>

          <div class="signatures no-break">
            <div class="sig-box">
              <div class="sig-line"></div>
              ผู้รับเงิน / Collector
            </div>
            <div class="sig-box">
              <div class="sig-line"></div>
              ผู้รับสินค้า / Customer
            </div>
          </div>
        </div>

        <script>window.onload = function() { window.print(); }</script>
      </body>
    </html>
  `;

  openPrintWindow(html, 900, 1100);
};

// =========================
// 5.1) ใบเสร็จขายสินค้า "หลายชิ้น" (A4)
// =========================
type BulkReceiptItem = {
  id: number;
  title: string;
  serial?: string;
  unitPrice: number;
  quantity: number;
};

type BulkBuyerInfo = {
  name?: string;
  phone?: string;
  address?: string;
  taxId?: string;
};

export const printBulkSellReceipt = (items: BulkReceiptItem[], buyer: BulkBuyerInfo) => {
  if (!items || items.length === 0) return;

  const currentDate = new Date();

  const safeItems = items.map((it) => ({
    ...it,
    unitPrice: Number(it.unitPrice ?? 0),
    quantity: Math.max(Number(it.quantity ?? 0), 1),
  }));

  const total = safeItems.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);
  const qtyTotal = safeItems.reduce((sum, it) => sum + it.quantity, 0);

  const customerDisplay = buyer?.name
    ? `${buyer.name}${buyer.phone ? ` (${buyer.phone})` : ""}`
    : "ทั่วไป (Cash Sale)";
  const addressDisplay = buyer?.address || "-";

  const rowsHtml = safeItems
    .map((it, index) => {
      const lineTotal = it.unitPrice * it.quantity;
      return `
        <tr>
          <td style="text-align:center;">${index + 1}</td>
          <td>
            <div class="bold">${safeText(it.title)}</div>
            ${it.serial ? `<div style="font-size:10px; color:#555;">Serial Number: ${safeText(it.serial)}</div>` : ""}
          </td>
          <td style="text-align:center;">${it.quantity}</td>
          <td style="text-align:right;">${money(it.unitPrice)}</td>
          <td style="text-align:right;">${money(lineTotal)}</td>
        </tr>
      `;
    })
    .join("");

  const html = `
    <html>
      <head>
        <title>ใบเสร็จรับเงิน - ${SHOP_INFO.name}</title>
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
        <style>${COMMON_A4_CSS}</style>
      </head>
      <body>
        <div class="page">
          <div class="receipt-header">
            <div>
              <div class="shop-title">${SHOP_INFO.name}</div>
              <div class="shop-subtitle">${SHOP_INFO.address}</div>
              <div class="shop-subtitle">โทร: ${SHOP_INFO.phone}</div>
            </div>
            <div style="text-align:right;">
              <div class="title">ใบเสร็จรับเงิน (ขายสินค้า)</div>
              <div style="font-size:12px; margin-top:3px;">RECEIPT - MULTI ITEM</div>
            </div>
          </div>

          <div class="receipt-info">
            <table style="width:100%;">
              <tr>
                <td width="60%" style="vertical-align:top;">
                  <strong>ลูกค้า (Customer):</strong> ${safeText(customerDisplay)}<br>
                  <strong>ที่อยู่ (Address):</strong> ${safeText(addressDisplay)}
                </td>
                <td width="40%" style="text-align:right; vertical-align:top;">
                  <strong>เลขที่ (No):</strong> INV-MULTI-${String(safeItems[0].id).padStart(5, "0")}<br>
                  <strong>วันที่ (Date):</strong> ${currentDate.toLocaleDateString("th-TH")}<br>
                  <strong>จำนวนชิ้นรวม (Qty):</strong> ${qtyTotal}
                </td>
              </tr>
            </table>
          </div>

          <table class="receipt-table">
            <thead>
              <tr>
                <th width="8%">ลำดับ</th>
                <th width="42%">รายการสินค้า (Description)</th>
                <th width="15%">จำนวน (Qty)</th>
                <th width="15%">ราคาต่อหน่วย</th>
                <th width="20%">จำนวนเงิน (Amount)</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              <tr><td colspan="5" style="height: 160px; border-bottom: 1px solid #000;"></td></tr>
            </tbody>
            <tfoot>
              <tr class="total-row">
                <td colspan="3" style="border:none;"></td>
                <td style="text-align:right; border:1px solid #000;">รวมเงิน (Total)</td>
                <td style="text-align:right; border:1px solid #000;">${money(total)}</td>
              </tr>
              <tr class="total-row">
                <td colspan="3" style="border:none;"></td>
                <td style="text-align:right; border:1px solid #000;">ภาษีมูลค่าเพิ่ม (VAT 7%)</td>
                <td style="text-align:right; border:1px solid #000;">-</td>
              </tr>
              <tr class="total-row" style="font-size:12px;">
                <td colspan="3" style="border:none; text-align:left; background:#fff;">
                  ตัวอักษร: (${money(total)} บาทถ้วน)
                </td>
                <td style="text-align:right; border:2px solid #000;">จำนวนเงินสุทธิ</td>
                <td style="text-align:right; border:2px solid #000;">${money(total)}</td>
              </tr>
            </tfoot>
          </table>

          <div style="margin-top: 10px; font-size: 11px; text-align: center;">
            <p>สินค้าซื้อแล้วไม่รับเปลี่ยนหรือคืน (Sold items are non-refundable)</p>
            <p>ขอบคุณที่ใช้บริการ</p>
          </div>

          <div class="signatures no-break">
            <div class="sig-box">
              <div class="sig-line"></div>
              ผู้รับเงิน / บริษัท
            </div>
            <div class="sig-box">
              <div class="sig-line"></div>
              ผู้จ่ายเงิน / ลูกค้า
            </div>
          </div>
        </div>

        <script>window.onload = function() { window.print(); }</script>
      </body>
    </html>
  `;

  openPrintWindow(html, 900, 1100);
};

// =========================
// 6) ใบสำคัญรับเงินจาก cashbook (A4)
// =========================
export const printTransactionReceipt = (cashbook: Cashbook) => {
  const currentDate = new Date();

  const html = `
    <html>
      <head>
        <title>ใบสำคัญรับเงิน (Receipt Voucher)</title>
        <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;700&display=swap" rel="stylesheet">
        <style>${COMMON_A4_CSS}</style>
      </head>
      <body>
        <div class="page">
          <div class="receipt-header">
            <div>
              <div class="shop-title">${SHOP_INFO.name}</div>
              <div class="shop-subtitle">${SHOP_INFO.address}</div>
              <div class="shop-subtitle">โทร: ${SHOP_INFO.phone}</div>
            </div>
            <div style="text-align:right;">
              <div class="title">ใบสำคัญรับเงิน</div>
              <div style="font-size:12px; margin-top:3px;">RECEIPT VOUCHER</div>
            </div>
          </div>

          <div class="receipt-info">
            <table style="width:100%;">
              <tr>
                <td width="60%">
                  <strong>ได้รับเงินจาก (Received From):</strong> ลูกค้า (Contract ID: ${(
                    cashbook as any
                  ).contractId || "-"})
                </td>
                <td width="40%" style="text-align:right;">
                  <strong>เลขที่ (No):</strong> RV-${String((cashbook as any).id ?? 0).padStart(6, "0")}<br>
                  <strong>วันที่ (Date):</strong> ${currentDate.toLocaleDateString("th-TH")}
                </td>
              </tr>
            </table>
          </div>

          <table class="receipt-table">
            <thead>
              <tr>
                <th width="70%">รายการ (Description)</th>
                <th width="30%">จำนวนเงิน (Amount)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div class="bold">${safeText((cashbook as any).category)}</div>
                  <div style="margin-top:2px;">${safeText((cashbook as any).description || "", "")}</div>
                </td>
                <td style="text-align:right; vertical-align:top;">${money((cashbook as any).amount)}</td>
              </tr>
              <tr><td colspan="2" style="height: 220px; border: none;"></td></tr>
            </tbody>
            <tfoot>
              <tr class="total-row" style="font-size:12px;">
                <td style="text-align:left; padding:8px; background:#fff;">
                  ตัวอักษร: (${money((cashbook as any).amount)} บาทถ้วน)
                </td>
                <td style="text-align:right; border-top:2px solid #000; padding:8px;">
                  ยอดรวมสุทธิ: ${money((cashbook as any).amount)} บาท
                </td>
              </tr>
            </tfoot>
          </table>

          <div class="signatures no-break">
            <div class="sig-box">
              <div class="sig-line"></div>
              ผู้รับเงิน / Collector<br>
              <span class="muted">(เจ้าหน้าที่)</span>
            </div>
            <div class="sig-box">
              <div class="sig-line"></div>
              ผู้จ่ายเงิน / Payer<br>
              <span class="muted">(ลูกค้า)</span>
            </div>
          </div>
        </div>

        <script>window.onload = function() { window.print(); }</script>
      </body>
    </html>
  `;

  openPrintWindow(html, 900, 1100);
};
