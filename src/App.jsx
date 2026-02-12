// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { StoreProvider } from "./context/StoreContext";
import { auth } from "./firebase/firebase";

import Login from "./pages/Login";
import StoreSelect from "./pages/StoreSelect";
import EmployeeDashboard from "./pages/EmployeeDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import AllItems from "./pages/AllItems";
import AdminSubmissions from "./pages/AdminSubmissions";
import ManageItems from "./pages/ManageItems";
import AdminSubmissionDetail from "./pages/AdminSubmissionDetail";
import AdminReports from "./pages/AdminReports";
import ManageStores from "./pages/ManageStores";
import ManageEmployees from "./pages/ManageEmployees";
import AdminDailySummary from "./pages/AdminDailySummary";
import AdminInbox from "./pages/AdminInbox";

import TemperaturePickSlot from "./pages/TemperaturePickSlot";
import TemperatureLogEmployee from "./pages/TemperatureLogEmployee";
import TemperatureLogsAdmin from "./pages/TemperatureLogsAdmin";
import TemperatureLogAdminDay from "./pages/TemperatureLogAdminDay";
import TemperatureLogAdminCheck from "./pages/TemperatureLogAdminCheck"; // ✅ NEW (below)

function RequireAuth({ children }) {
  const { fbUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="page">
        <div className="muted">Loading…</div>
      </div>
    );
  }

  const user = fbUser || auth.currentUser;
  return user ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <StoreProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Login />} />

            <Route
              path="/stores"
              element={
                <RequireAuth>
                  <StoreSelect />
                </RequireAuth>
              }
            />

            <Route
              path="/employee"
              element={
                <RequireAuth>
                  <EmployeeDashboard />
                </RequireAuth>
              }
            />

            {/* ✅ Employee temp: pick log first */}
            <Route
              path="/employee/temperature"
              element={
                <RequireAuth>
                  <TemperaturePickSlot />
                </RequireAuth>
              }
            />

            {/* ✅ Employee temp: actual form (log1/log2) */}
            <Route
              path="/employee/temperature/:slot"
              element={
                <RequireAuth>
                  <TemperatureLogEmployee />
                </RequireAuth>
              }
            />

            <Route
              path="/all-items"
              element={
                <RequireAuth>
                  <AllItems />
                </RequireAuth>
              }
            />

            <Route
              path="/admin"
              element={
                <RequireAuth>
                  <AdminDashboard />
                </RequireAuth>
              }
            />

            <Route
              path="/admin/items"
              element={
                <RequireAuth>
                  <ManageItems />
                </RequireAuth>
              }
            />

            <Route
              path="/admin/submissions"
              element={
                <RequireAuth>
                  <AdminSubmissions />
                </RequireAuth>
              }
            />

            <Route
              path="/admin/submissions/:dayId"
              element={
                <RequireAuth>
                  <AdminSubmissionDetail />
                </RequireAuth>
              }
            />

            <Route
              path="/admin/reports"
              element={
                <RequireAuth>
                  <AdminReports />
                </RequireAuth>
              }
            />

            <Route
              path="/admin/stores"
              element={
                <RequireAuth>
                  <ManageStores />
                </RequireAuth>
              }
            />

            <Route
              path="/admin/employees"
              element={
                <RequireAuth>
                  <ManageEmployees />
                </RequireAuth>
              }
            />

            <Route
              path="/admin/summary"
              element={
                <RequireAuth>
                  <AdminDailySummary />
                </RequireAuth>
              }
            />

            <Route
              path="/admin/inbox"
              element={
                <RequireAuth>
                  <AdminInbox />
                </RequireAuth>
              }
            />

            {/* ✅ Admin temp list */}
            <Route
              path="/admin/temperature"
              element={
                <RequireAuth>
                  <TemperatureLogsAdmin />
                </RequireAuth>
              }
            />

            {/* ✅ Admin day view (shows Log1 + Log2 buttons) */}
            <Route
              path="/admin/temperature/:ymd"
              element={
                <RequireAuth>
                  <TemperatureLogAdminDay />
                </RequireAuth>
              }
            />

            {/* ✅ Admin open a specific check */}
            <Route
              path="/admin/temperature/:ymd/:slot"
              element={
                <RequireAuth>
                  <TemperatureLogAdminCheck />
                </RequireAuth>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </StoreProvider>
    </AuthProvider>
  );
}
