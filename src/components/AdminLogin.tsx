import { useState } from 'react';
import { Loader2, Shield } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

// Temporary open-admin entry for solo dev — Entra SSO will replace this.
// The backend (/api/auth/dev-login) is gated behind ADMIN_OPEN=1 so flipping
// that env var off in Northflank disables this immediately.
export const AdminLogin = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { devLogin } = useAuth();

  const handleEnter = async () => {
    setIsLoading(true);
    setError('');
    try {
      const { error: loginError } = await devLogin();
      if (loginError) {
        setError(loginError.message || 'Login failed');
      }
      // On success, AuthContext updates and the parent re-renders into the admin UI.
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="flex items-center justify-center gap-2">
          <Shield className="w-5 h-5" />
          Admin Portal
        </CardTitle>
        <CardDescription>
          Open-admin mode — SSO coming soon
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <p className="text-sm text-destructive text-center">{error}</p>
        )}

        <Button
          onClick={handleEnter}
          disabled={isLoading}
          className="w-full"
          size="lg"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Entering…
            </>
          ) : (
            'Enter as Admin'
          )}
        </Button>

        <p className="text-xs text-muted-foreground text-center">
          No credentials required while in dev mode.
        </p>
      </CardContent>
    </Card>
  );
};
