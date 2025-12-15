import React, {
  useState,
  useEffect,
  useRef,
  FormEvent,
  ChangeEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { calculateFee } from "../../utils/feeCalculator";
import { apiFetch } from "../../lib/api";

/* ===================== TYPES ===================== */

type FeeBreakdown = {
  docFee: number;
  storageFee: number;
  careFee: number;
  total: number;
};

type CustomerState = {
  name: string;
  idCard: string;
  phone: string;
  lineId: string;
  address: string;
  lineToken: string;
};

type AssetState = {
  modelName: string;
  serial: string;
  condition: string;
  accessories: string;
  storageCode: string;
};

type FinancialState = {
  principal: number;
  termDays: 15 | 30;
  feeBreakdown: FeeBreakdown;
  feeTotal: number;
  netReceive: number;
};

/* ===================== HELPERS ===================== */

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ===================== COMPONENT ===================== */

const NewDepositPage: React.FC = () => {
  const navigate = useNavigate();

  /* ---------- state ---------- */

  const [customer, setCustomer] = useState<CustomerState>({
    name: "",
    idCard: "",
    phone: "",
    lineId: "",
    address: "",
    lineToken: "",
  });

  const [asset, setAsset] = useState<AssetState>({
    modelName: "",
    serial: "",
    condition: "",
    accessories: "",
    storageCode: "",
  });

  const [images, setImages] = useState<string[]>([]);

  const [financial, setFinancial] = useState<FinancialState>({
    principal: 0,
    termDays: 15,
    feeBreakdown: { docFee: 0, storageFee: 0, careFee: 0, total: 0 },
    feeTotal: 0,
    netReceive: 0,
  });

  const [submitting, setSubmitting] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const idCardInputRef = useRef<HTMLInputElement | null>(null);

  /* ===================== EFFECTS ===================== */

  // โหลดเลขกล่อง AUTO
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/contracts/next-storage-code");
        setAsset((prev) => ({
          ...prev,
          storageCode: prev.storageCode || res.storageCode || "A-001",
        }));
      } catch (err) {
        console.error("โหลดเลขกล่องเก็บไม่สำเร็จ", err);
      }
    })();
  }, []);

  /* ===================== FINANCIAL ===================== */

  const recalcFinancial = (principal: number, termDays: 15 | 30) => {
    const feeBreakdown = calculateFee(principal, termDays);
    const feeTotal = feeBreakdown.total;
    const netReceive = Math.max(principal - feeTotal, 0);

    setFinancial({
      principal,
      termDays,
      feeBreakdown,
      feeTotal,
      netReceive,
    });
  };

  /* ===================== HANDLERS ===================== */

  const handleImagesChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const list: string[] = [];

    for (const f of Array.from(e.target.files)) {
      list.push(await fileToBase64(f));
    }

    setImages((prev) => [...prev, ...list]);
    e.target.value = "";
  };

  // OCR
  const handleIdCardFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setScanLoading(true);
      setScanError(null);

      const dataUrl = await fileToBase64(file);
      const [, base64] = dataUrl.split(",");

      const res = await apiFetch("/ai/ocr-idcard", {
        method: "POST",
        body: JSON.stringify({
          imageBase64: base64,
          imageDataUrl: dataUrl,
          mimeType: file.type,
          fileName: file.name,
        }),
      });

      setCustomer((prev) => ({
        ...prev,
        name: res.name || prev.name,
        idCard: res.idCard || prev.idCard,
        address: res.address || prev.address,
      }));
    } catch (err: any) {
      setScanError(err.message || "อ่านบัตรไม่สำเร็จ");
    } finally {
      setScanLoading(false);
      e.target.value = "";
    }
  };

  /* ===================== SUBMIT ===================== */

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!window.confirm("ยืนยันสร้างสัญญาฝากดูแล?")) return;

    try {
      setSubmitting(true);

      const payload = {
        type: "DEPOSIT",
        customer,
        asset,
        financial: {
          principal: financial.principal,
          termDays: financial.termDays,
          feeBreakdown: financial.feeBreakdown,
        },
        images,
      };

      const created = await apiFetch("/contracts", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      navigate(`/app/contracts/${created.id}`);
    } catch (err: any) {
      alert(err.message || "บันทึกสัญญาไม่สำเร็จ");
    } finally {
      setSubmitting(false);
    }
  };

  /* ===================== UI ===================== */

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h1 className="text-lg font-semibold">ทำสัญญาฝากดูแล</h1>

      <input
        placeholder="ชื่อลูกค้า"
        value={customer.name}
        onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
      />

      <input
        type="number"
        placeholder="วงเงิน"
        value={financial.principal}
        onChange={(e) =>
          recalcFinancial(Number(e.target.value), financial.termDays)
        }
      />

      <button disabled={submitting} type="submit">
        {submitting ? "กำลังบันทึก..." : "บันทึกสัญญา"}
      </button>
    </form>
  );
};

export default NewDepositPage;
