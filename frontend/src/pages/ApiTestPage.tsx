import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

export default function ApiTestPage() {
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const data = await apiFetch("/health");
        setResult(data);
      } catch (e: any) {
        setErr(e.message || "error");
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-2xl rounded-xl bg-white p-6 shadow">
        <h1 className="text-lg font-semibold">API Test</h1>
        <p className="mt-1 text-sm text-slate-600">
          BASE URL: <span className="font-mono">{import.meta.env.VITE_API_BASE_URL}</span>
        </p>

        {err ? (
          <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            Error: {err}
          </div>
        ) : (
          <pre className="mt-4 rounded-lg bg-slate-900 p-4 text-xs text-slate-100 overflow-auto">
            {JSON.stringify(result, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
