import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useContext } from 'react';
import AuthContext, { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Login from './pages/Login';
import ChangePassword from './pages/ChangePassword';
import CompleteProfile from './pages/CompleteProfile';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import AdminDashboard from './pages/admin/Dashboard';
import Employees from './pages/admin/Employees';
import EmployeeDetailsEnhanced from './pages/admin/EmployeeDetailsEnhanced';
import Upload from './pages/admin/Upload';
import MonthlyProcessing from './pages/admin/MonthlyProcessing';
import Loans from './pages/admin/Loans';
import Thrift from './pages/admin/Thrift';
import YearlyThriftUpdate from './pages/admin/YearlyThriftUpdate';
import EmployeeDashboard from './pages/employee/Dashboard';
import EmployeeTransactions from './pages/employee/Transactions';
import EmployeeLoan from './pages/employee/Loan';
import EmployeeSureties from './pages/employee/Sureties';
import { Toaster } from 'react-hot-toast';
import GlobalLoadingOverlay from './components/GlobalLoadingOverlay';
import FullScreenLoader from './components/FullScreenLoader';

const PrivateRoute = ({ children, role }) => {
  const { user, loading } = useContext(AuthContext);

  if (loading) return <FullScreenLoader label="Loading…" />;

  if (!user) {
    return <Navigate to="/" />;
  }

  if (role && user.role !== role) {
    return <Navigate to="/" />;
  }

  return children;
};

function App() {
  return (
    <Router>
      <AuthProvider>
        <ThemeProvider>
          <Toaster position="top-right" />
          <GlobalLoadingOverlay />
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/complete-profile" element={
              <PrivateRoute role="employee">
                <CompleteProfile />
              </PrivateRoute>
            } />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:token" element={<ResetPassword />} />
            <Route
              path="/admin"
              element={
                <PrivateRoute role="admin">
                  <AdminDashboard />
                </PrivateRoute>
              }
            />
            <Route
              path="/admin/employees"
              element={
                <PrivateRoute role="admin">
                  <Employees />
                </PrivateRoute>
              }
            />
            <Route
              path="/admin/employees/:id"
              element={
                <PrivateRoute role="admin">
                  <EmployeeDetailsEnhanced />
                </PrivateRoute>
              }
            />
            <Route
              path="/admin/upload"
              element={
                <PrivateRoute role="admin">
                  <Upload />
                </PrivateRoute>
              }
            />
            <Route
              path="/admin/monthly-processing"
              element={
                <PrivateRoute role="admin">
                  <MonthlyProcessing />
                </PrivateRoute>
              }
            />
            <Route
              path="/admin/loans"
              element={
                <PrivateRoute role="admin">
                  <Loans />
                </PrivateRoute>
              }
            />
            <Route
              path="/admin/thrift"
              element={
                <PrivateRoute role="admin">
                  <Thrift />
                </PrivateRoute>
              }
            />
            <Route
              path="/admin/yearly-thrift"
              element={
                <PrivateRoute role="admin">
                  <YearlyThriftUpdate />
                </PrivateRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <PrivateRoute role="employee">
                  <EmployeeDashboard />
                </PrivateRoute>
              }
            />
            <Route
              path="/employee/transactions"
              element={
                <PrivateRoute role="employee">
                  <EmployeeTransactions />
                </PrivateRoute>
              }
            />
            <Route
              path="/employee/loan"
              element={
                <PrivateRoute role="employee">
                  <EmployeeLoan />
                </PrivateRoute>
              }
            />
            <Route
              path="/employee/sureties"
              element={
                <PrivateRoute role="employee">
                  <EmployeeSureties />
                </PrivateRoute>
              }
            />
          </Routes>
        </ThemeProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
