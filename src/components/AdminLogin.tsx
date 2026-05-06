import { useState, useEffect, useRef } from 'react';
import { Loader2, Shield, Mail, ArrowLeft, KeyRound } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/apiClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

// Two admin auth flows, switched by the API's ADMIN_OPEN env var (exposed
// via /api/config as `devMode`):
//
//   ADMIN_OPEN=1 (devMode=true) — "Stytch-only" flow:
//     Stytch SSO at the Northflank edge has already authenticated the user
//     (only allowlisted directory groups reach /admin at all). We just need
//     to mint a JWT for the API. Single button → calls /auth/dev-login →
//     done. Cleaner UX, no second factor.
//
//   ADMIN_OPEN=0 (devMode=false) — "Email allowlist" flow:
//     Self-contained. User enters their email → if it's in ADMIN_EMAILS,
//     a 6-digit code is sent → user enters code → backend validates, mints
//     JWT. No external IdP dependency.
//
// Backend dev-login is server-side gated by the same flag, so even if a
// client crafted requests against the wrong endpoint, it'd 403.
type Step = 'email' | 'code';

export const AdminLogin = () => {
  const { devLogin, adminLoginStart, adminLoginVerify } = useAuth();
  const [devMode, setDevMode] = useState<boolean | null>(null);
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const codeInputRef = useRef<HTMLInputElement | null>(null);

  // Pull the server-side mode flag once on mount. Until it resolves we
  // render a small spinner — UI mode might change the moment we know.
  useEffect(() => {
    api.get<{ devMode: boolean }>('/config')
      .then((cfg) => setDevMode(!!cfg?.devMode))
      .catch(() => setDevMode(false));
  }, []);

  // Auto-focus the code input when we transition to step 2 — keyboard users
  // shouldn't have to tab into it.
  useEffect(() => {
    if (step === 'code') codeInputRef.current?.focus();
  }, [step]);

  const handleSendCode = async () => {
    if (!email.trim()) {
      setError('Enter your email');
      return;
    }
    setSubmitting(true);
    setError('');
    const { error: sendError } = await adminLoginStart(email.trim());
    setSubmitting(false);
    if (sendError) {
      setError(sendError.message || 'Failed to send code');
      return;
    }
    // Whether or not the email is on the allowlist, we tell the user to
    // check their inbox — that's the no-enumeration property.
    setStep('code');
  };

  const handleVerify = async () => {
    if (!/^\d{6}$/.test(code)) {
      setError('Code must be 6 digits');
      return;
    }
    setSubmitting(true);
    setError('');
    const { error: verifyError } = await adminLoginVerify(email.trim(), code);
    setSubmitting(false);
    if (verifyError) {
      setError(verifyError.message || 'Invalid or expired code');
      return;
    }
    // Success — AuthContext updates user state, parent re-renders into
    // the admin UI. No further action needed here.
  };

  const handleBack = () => {
    setStep('email');
    setCode('');
    setError('');
  };

  // Stytch-only flow: single click → mint admin JWT via dev-login. The
  // user has already been authenticated by Stytch SSO at the Northflank
  // edge (otherwise they couldn't even load this page), so we don't ask
  // them for anything more.
  const handleSsoEnter = async () => {
    setSubmitting(true);
    setError('');
    const { error: loginError } = await devLogin();
    setSubmitting(false);
    if (loginError) {
      setError(loginError.message || 'Sign-in failed');
    }
  };

  // While we're waiting for /config to tell us which mode we're in, hold
  // the flicker — neither Stytch single-click nor email form should appear
  // before we know. ~50-100ms typically.
  if (devMode === null) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Stytch-only flow — single button. Stytch has already gated the URL,
  // so anyone who got here is authorised.
  if (devMode) {
    return (
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <Shield className="w-5 h-5" />
            Admin Portal
          </CardTitle>
          <CardDescription>
            You're authenticated via Flip SSO. Continue to the admin console.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <p className="text-sm text-destructive text-center" role="alert">
              {error}
            </p>
          )}
          <Button
            onClick={handleSsoEnter}
            disabled={submitting}
            className="w-full"
            size="lg"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Signing in…
              </>
            ) : (
              <>
                <KeyRound className="w-4 h-4 mr-2" />
                Continue
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            Access is restricted to authorised Flip directory groups.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Email-allowlist flow (devMode === false). Default fallback when no
  // edge-level SSO is configured.
  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="flex items-center justify-center gap-2">
          <Shield className="w-5 h-5" />
          Admin Portal
        </CardTitle>
        <CardDescription>
          {step === 'email'
            ? 'Sign in with your authorised email'
            : 'Enter the 6-digit code we just emailed you'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {error && (
          <p className="text-sm text-destructive text-center" role="alert">
            {error}
          </p>
        )}

        {step === 'email' ? (
          <div className="space-y-2">
            <Label htmlFor="admin-email">Email</Label>
            <Input
              id="admin-email"
              type="email"
              autoComplete="email"
              placeholder="you@getflip.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !submitting) {
                  e.preventDefault();
                  void handleSendCode();
                }
              }}
              disabled={submitting}
              autoFocus
            />
            <Button
              onClick={handleSendCode}
              disabled={submitting || !email.trim()}
              className="w-full"
              size="lg"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending code…
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-2" />
                  Send code
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              You'll receive a 6-digit code if your email is on the admin allowlist.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="admin-code">6-digit code</Label>
            <Input
              ref={codeInputRef}
              id="admin-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !submitting && code.length === 6) {
                  e.preventDefault();
                  void handleVerify();
                }
              }}
              disabled={submitting}
              className="text-center text-2xl font-mono tracking-[0.5em]"
            />
            <Button
              onClick={handleVerify}
              disabled={submitting || code.length !== 6}
              className="w-full"
              size="lg"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Verifying…
                </>
              ) : (
                'Sign in'
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={handleBack}
              disabled={submitting}
              className="w-full"
              size="sm"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Use a different email
            </Button>
            <p className="text-xs text-muted-foreground text-center pt-1">
              The code expires in 10 minutes. Sent to <strong>{email}</strong>.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
