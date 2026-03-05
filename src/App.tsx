import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { TenantProvider } from "@/contexts/TenantContext";
import TenantApp from "./pages/TenantApp";
import TenantAuth from "./pages/TenantAuth";
import OIDCCallback from "./pages/OIDCCallback";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Wrapper component for tenant routes
const TenantRouteWrapper = ({ children }: { children: React.ReactNode }) => (
  <TenantProvider>{children}</TenantProvider>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <AuthProvider>
        <TooltipProvider>
          <BrowserRouter>
            <Routes>
              {/* Redirect root to admin */}
              <Route path="/" element={<Navigate to="/admin" replace />} />
              
              {/* Admin portal */}
              <Route path="/admin" element={<Admin />} />
              
              {/* Tenant routes */}
              <Route path="/t/:tenantUid" element={<TenantRouteWrapper><TenantApp /></TenantRouteWrapper>} />
              <Route path="/t/:tenantUid/auth" element={<TenantRouteWrapper><TenantAuth /></TenantRouteWrapper>} />
              <Route path="/t/:tenantUid/auth/callback" element={<TenantRouteWrapper><OIDCCallback /></TenantRouteWrapper>} />
              
              {/* Catch-all */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
