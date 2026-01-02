import { Routes, Route, Navigate } from "react-router-dom";
import { useState } from "react";
import { MainLayout } from "./layouts/MainLayout";
import { LoginPage } from "./pages/LoginPage";

import EmployeeHomePage from "./pages/HomePage";

// ฝากดูแล
import NewDepositPage from "./pages/deposit/NewDepositPage";
import { DepositListPage } from "./pages/deposit/DepositListPage";
import { DepositHistoryPage } from "./pages/deposit/DepositHistoryPage";

// สัญญา
import { ContractDetailPage } from "./pages/contracts/ContractDetailPage";
import { RenewContractPage } from "./pages/contracts/RenewContractPage";
import { RedeemContractPage } from "./pages/contracts/RedeemContractPage";
import { AdjustPrincipalPage } from "./pages/contracts/AdjustPrincipalPage";
import { ForfeitContractPage } from "./pages/contracts/ForfeitContractPage";

// คลัง / ขาย / รับเข้า
import InventoryPage from "./pages/InventoryPage";
import InventorySellPage from "./pages/inventory/InventorySellPage";
import InventoryBulkSellPage from "./pages/inventory/InventoryBulkSellPage";
import NewIntakePage from "./pages/intake/NewIntakePage";

// ลูกค้า
import CustomersPage from "./pages/admin/CustomersPage";
import CustomerDetailPage from "./pages/customers/CustomerDetailPage";

// ฝากขาย
import { ConsignmentListPage } from "./pages/consignment/ConsignmentListPage";
import NewConsignmentPage from "./pages/consignment/NewConsignmentPage";
import ConsignmentDetailPage from "./pages/consignment/ConsignmentDetailPage";

// Admin
import StatsReportPage from "./pages/admin/StatsReportPage";
import { CashbookPage } from "./pages/admin/CashbookPage";
import AdminDashboardPage from "./pages/admin/DashboardPage";
import AdminImportContractsPage from "./pages/admin/AdminImportContractsPage";
import AdminImportPriceHistoryPage from "./pages/admin/AdminImportPriceHistoryPage";


// อื่น ๆ
import PriceAssessmentPage from "./pages/PriceAssessmentPage";
import ApiTestPage from "./pages/ApiTestPage";

export type UserRole = "ADMIN" | "STAFF" | null;

const ROLE_KEY = "amphon_role";

export default function App() {
  const [role, setRole] = useState<UserRole>(() => {
    if (typeof window === "undefined") return null;
    const stored = localStorage.getItem(ROLE_KEY);
    if (stored === "ADMIN" || stored === "STAFF") return stored;
    return null;
  });

  return (
    <Routes>
      {/* login */}
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route
        path="/login"
        element={
          <LoginPage
            onLoggedIn={(r) => {
              localStorage.setItem(ROLE_KEY, r);
              setRole(r);
            }}
          />
        }
      />

      {/* redirect legacy paths */}
      <Route
        path="/customers/:id"
        element={<Navigate to="/app/customers/:id" replace />}
      />

      {/* ===== APP (private area) ===== */}
      <Route
        path="/app/*"
        element={
          role ? (
            <MainLayout role={role} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      >
        {/* index */}
        <Route
          index
          element={
            role === "ADMIN" ? (
              <AdminDashboardPage />
            ) : (
              <EmployeeHomePage />
            )
          }
        />

        {/* ฝากดูแล */}
        <Route path="deposit/new" element={<NewDepositPage />} />
        <Route path="deposit/list" element={<DepositListPage />} />
        <Route path="deposit/history" element={<DepositHistoryPage />} />

        {/* สัญญา */}
        <Route path="contracts/:id" element={<ContractDetailPage />} />
        <Route path="contracts/:id/renew" element={<RenewContractPage />} />
        <Route path="contracts/:id/redeem" element={<RedeemContractPage />} />
        <Route
          path="contracts/:id/cut-principal"
          element={<AdjustPrincipalPage />}
        />
        <Route
          path="contracts/:id/forfeit"
          element={<ForfeitContractPage />}
        />

        {/* ฝากขาย */}
        <Route path="consignments" element={<ConsignmentListPage />} />
        <Route path="consignments/new" element={<NewConsignmentPage />} />
        <Route path="consignments/:id" element={<ConsignmentDetailPage />} />

        {/* คลัง */}
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="inventory/sell/:id" element={<InventorySellPage />} />
        <Route
          path="inventory/bulk-sell"
          element={<InventoryBulkSellPage />}
        />
        <Route path="intake/new" element={<NewIntakePage />} />

        {/* ลูกค้า */}
        <Route path="customers/:id" element={<CustomerDetailPage />} />
        <Route path="price-check" element={<PriceAssessmentPage />} />

        {/* Admin */}
        {role === "ADMIN" && (
          <>
            <Route path="admin/dashboard" element={<AdminDashboardPage />} />
            <Route path="admin/stats" element={<StatsReportPage />} />
            <Route path="admin/customers" element={<CustomersPage />} />
            <Route path="admin/cashbook" element={<CashbookPage />} />
            <Route path="admin/contracts/import" element={<AdminImportContractsPage />} />
            <Route path="admin/price-history/import" element={<AdminImportPriceHistoryPage />} />

          </>
        )}
      </Route>

      <Route path="/api-test" element={<ApiTestPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
      

    </Routes>
  );
}
