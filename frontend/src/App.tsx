import { Routes, Route, Navigate } from "react-router-dom";
import { useState } from "react";
import { MainLayout } from "./layouts/MainLayout";
import { LoginPage } from "./pages/LoginPage";

import EmployeeHomePage from "./pages/HomePage.tsx";

import NewDepositPage from "./pages/deposit/NewDepositPage";
import { DepositListPage } from "./pages/deposit/DepositListPage";
import { DepositHistoryPage } from "./pages/deposit/DepositHistoryPage";

import { ContractDetailPage } from "./pages/contracts/ContractDetailPage";
import { RenewContractPage } from "./pages/contracts/RenewContractPage";
import { RedeemContractPage } from "./pages/contracts/RedeemContractPage";
import { AdjustPrincipalPage } from "./pages/contracts/AdjustPrincipalPage";
import { ForfeitContractPage } from "./pages/contracts/ForfeitContractPage";

import InventoryPage from "./pages/InventoryPage";
import InventorySellPage from "./pages/inventory/InventorySellPage";
import InventoryBulkSellPage from "./pages/inventory/InventoryBulkSellPage";

import NewIntakePage from "./pages/intake/NewIntakePage";

import CustomerDetailPage from "./pages/customers/CustomerDetailPage";
import PriceAssessmentPage from "./pages/PriceAssessmentPage";

import { ConsignmentListPage } from "./pages/consignment/ConsignmentListPage";
import NewConsignmentPage from "./pages/consignment/NewConsignmentPage";
import ConsignmentDetailPage from "./pages/consignment/ConsignmentDetailPage";

import StatsReportPage from "./pages/admin/StatsReportPage";
import CustomersPage from "./pages/admin/CustomersPage";
import { CashbookPage } from "./pages/admin/CashbookPage";

import ApiTestPage from "./pages/ApiTestPage";

export type UserRole = "ADMIN" | "STAFF" | null;

function ProtectedRoute({ role, children }: { role: UserRole; children: JSX.Element }) {
  if (!role) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const [role, setRole] = useState<UserRole>(() => {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem("amphon_role");
    if (stored === "ADMIN" || stored === "STAFF") return stored;
    return null;
  });

  return (
    <Routes>
      {/* ✅ หน้าแรก = login */}
      <Route path="/" element={<Navigate to="/login" replace />} />

      <Route path="/login" element={<LoginPage onLoggedIn={setRole} />} />

      {/* ✅ แอพจริงอยู่ใต้ /app */}
      <Route
        path="/app"
        element={
          <ProtectedRoute role={role}>
            <MainLayout role={role} />
          </ProtectedRoute>
        }
      >
        <Route index element={<EmployeeHomePage />} />

        {/* ฝากดูแล */}
        <Route path="deposit/new" element={<NewDepositPage />} />
        <Route path="deposit/list" element={<DepositListPage />} />
        <Route path="deposit/history" element={<DepositHistoryPage />} />

        {/* สัญญา */}
        <Route path="contracts/:id" element={<ContractDetailPage />} />
        <Route path="contracts/:id/renew" element={<RenewContractPage />} />
        <Route path="contracts/:id/redeem" element={<RedeemContractPage />} />
        <Route path="contracts/:id/cut-principal" element={<AdjustPrincipalPage />} />
        <Route path="contracts/:id/forfeit" element={<ForfeitContractPage />} />

        {/* ฝากขาย */}
        <Route path="consignments" element={<ConsignmentListPage />} />
        <Route path="consignments/new" element={<NewConsignmentPage />} />
        <Route path="consignments/:id" element={<ConsignmentDetailPage />} />

        {/* คลัง/ขาย/รับเข้า */}
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="inventory/sell/:id" element={<InventorySellPage />} />
        <Route path="inventory/bulk-sell" element={<InventoryBulkSellPage />} />
        <Route path="intake/new" element={<NewIntakePage />} />

        {/* ลูกค้า/ประเมินราคา */}
        <Route path="customers/:id" element={<CustomerDetailPage />} />
        <Route path="price-check" element={<PriceAssessmentPage />} />
        
        

        {/* Admin */}
        <Route path="admin/stats" element={<StatsReportPage />} />
        <Route path="admin/customers" element={<CustomersPage />} />
        <Route path="admin/cashbook" element={<CashbookPage />} />
      </Route>
      
      <Route path="/api-test" element={<ApiTestPage />} />

      {/* fallback */}
      <Route path="*" element={<Navigate to="/login" replace />} />

      
    </Routes>
  );
}
