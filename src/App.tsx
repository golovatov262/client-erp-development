import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import AppLayout from "@/components/layout/AppLayout";
import Dashboard from "@/pages/Dashboard";
import Members from "@/pages/Members";
import Loans from "@/pages/Loans";
import Savings from "@/pages/Savings";
import Shares from "@/pages/Shares";
import Reports from "@/pages/Reports";
import Admin from "@/pages/Admin";
import Chats from "@/pages/Chats";
import BankStatements from "@/pages/BankStatements";
import Login from "@/pages/Login";
import CabinetLogin from "@/pages/cabinet/Login";
import Cabinet from "@/pages/cabinet/Cabinet";
import NotFound from "@/pages/NotFound";
import Icon from "@/components/ui/icon";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children, adminOnly }: { children: React.ReactNode; adminOnly?: boolean }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Icon name="Loader2" size={32} className="animate-spin text-muted-foreground" /></div>;
  if (!user) return <Navigate to="/office/login" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/office" replace />;
  return <>{children}</>;
};

const AppRoutes = () => {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen flex items-center justify-center"><Icon name="Loader2" size={32} className="animate-spin text-muted-foreground" /></div>;

  return (
    <Routes>
      <Route path="/" element={<CabinetLogin />} />
      <Route path="/cabinet" element={<Cabinet />} />
      <Route path="/office/login" element={user ? <Navigate to="/office" replace /> : <Login />} />
      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/office" element={<Dashboard />} />
        <Route path="/office/members" element={<Members />} />
        <Route path="/office/loans" element={<Loans />} />
        <Route path="/office/savings" element={<Savings />} />
        <Route path="/office/shares" element={<Shares />} />
        <Route path="/office/reports" element={<Reports />} />
        <Route path="/office/chats" element={<Chats />} />
        <Route path="/office/bank" element={<BankStatements />} />
        <Route path="/office/admin" element={<ProtectedRoute adminOnly><Admin /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;