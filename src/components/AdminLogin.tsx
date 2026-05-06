import { useState, useEffect, useRef } from 'react';
import { Loader2, Shield, Mail, ArrowLeft } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
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

// Email-allowlist admin login. Two steps:
//
//   1. User enters email → /auth/admin-login/start.
//      Server returns 200 regardless of whether the email is allowlisted
//      (so an attacker can't probe membership). If allowlisted, an email
//      with a 6-digit code is sent.
//
//   2. User enters the code → /auth/admin-login/verify. Server validates,
//      mints admin JWT, AuthContext lights up, parent re-renders into the
//      admin UI.
//
// Codes are 10-min single-use; rate-limited at 5/hour/email server-side.
type Step = 'email' | 'code';

export const AdminLogin = () => {
  const { adminLoginStart, adminLoginVerify } = useAuth();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const codeInputRef = useRef<HTMLInputElement | null>(null);

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
