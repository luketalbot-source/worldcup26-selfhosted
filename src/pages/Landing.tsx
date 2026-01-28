import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

// This page redirects to the appropriate tenant URL
// For now, it shows a message explaining the tenant-based system
const Landing = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  // If user is logged in and has a tenant, redirect there
  // For now, show instructions
  
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center max-w-md px-4">
        <h1 className="text-3xl font-bold text-foreground mb-4">World Cup 2026 Predictor</h1>
        <p className="text-muted-foreground mb-6">
          This app requires a tenant URL to access. Please use the URL provided by your organization.
        </p>
        <p className="text-sm text-muted-foreground">
          Example: <code className="bg-muted px-2 py-1 rounded">/t/your-tenant-uid</code>
        </p>
      </div>
    </div>
  );
};

export default Landing;
