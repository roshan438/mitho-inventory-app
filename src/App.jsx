import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { StoreProvider } from "./context/StoreContext";

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
import TemperatureLogEmployee from "./pages/TemperatureLogEmployee";
import TemperatureLogsAdmin from "./pages/TemperatureLogsAdmin";
import TemperatureLogAdminDay from "./pages/TemperatureLogAdminDay";
import AdminInbox from "./pages/AdminInbox";



import { auth } from "./firebase/firebase";

function RequireAuth({ children }) {
  const { fbUser, loading } = useAuth();

  if (loading) {
    return (
      <div className="page">
        <div className="muted">Loading…</div>
      </div>
    );
  }

  // Key fix: allow auth.currentUser immediately after login
  const user = fbUser || auth.currentUser;

  return user ? children : <Navigate to='/' replace />;
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
  path="/admin/employees"
  element={
    <RequireAuth>
      <ManageEmployees />
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
  path="/employee/temperature"
  element={
    <RequireAuth>
      <TemperatureLogEmployee />
    </RequireAuth>
  }
/>

<Route path="/admin/temperature" element={<TemperatureLogsAdmin />} />
<Route path="/admin/temperature/:ymd" element={<TemperatureLogAdminDay />} />
<Route path="/admin/inbox" element={<AdminInbox />} />

<Route
  path="/admin/summary"
  element={
    <RequireAuth>
      <AdminDailySummary />
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

<Route
  path="/admin/submissions/:dayId"
  element={
    <RequireAuth>
      <AdminSubmissionDetail />
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
              path="/all-items"
              element={
                <RequireAuth>
                  <AllItems />
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


            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </StoreProvider>
    </AuthProvider>
  );
}
