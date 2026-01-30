import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { User, ArrowLeft, Loader2, ExternalLink, Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { useIframeAuth } from '@/hooks/useIframeAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { PhoneInput } from '@/components/PhoneInput';
import { z } from 'zod';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { buildAuthorizationUrl } from '@/lib/oidc';

const REMEMBERED_PHONE_KEY = 'wc2026_remembered_phone';

type AuthStep = 'phone' | 'consent' | 'username' | 'verify';

const TenantAuth = () => {
  const { t } = useTranslation();
  const { tenantUid } = useParams();
  const { tenant, loading: tenantLoading, error: tenantError } = useTenant();
  const [step, setStep] = useState<AuthStep>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [username, setUsername] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isNewUser, setIsNewUser] = useState(false);
  const verifyInFlightRef = useRef(false);
  const { sendOtp, verifyOtp, user, signOut } = useAuth();
  const navigate = useNavigate();
  
  // Iframe auth support - handles postMessage tokens from parent
  const { isInIframe, tokenReceived } = useIframeAuth({
    tenantId: tenant?.id || null,
    tenantUid,
    onAuthSuccess: () => {
      navigate(`/t/${tenantUid}`);
    },
    onAuthError: (err) => {
      setError(err);
    },
    onUserMismatch: () => {
      // User changed in parent, will need to re-auth
      setError('');
    },
  });

  const usernameSchema = z.string()
    .min(2, t('auth.validation.minLength'))
    .max(20, t('auth.validation.maxLength'))
    .regex(/^[a-zA-Z0-9_]+$/, t('auth.validation.pattern'));

  const phoneSchema = z.string()
    .regex(/^\+[1-9]\d{6,14}$/, t('auth.validation.phoneFormat', 'Invalid phone format. Use +1234567890'));

  // Redirect if already logged in (but only if the logged-in user belongs to this tenant)
  useEffect(() => {
    const run = async () => {
      if (!user || !tenant?.id || !tenantUid) return;

      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('tenant_id')
          .eq('user_id', user.id)
          .maybeSingle();

        // If user is signed in for a different tenant, sign them out and keep them on this auth page.
        if (profile?.tenant_id && profile.tenant_id !== tenant.id) {
          await signOut();
          setError(t('auth.wrongTenant', 'You are signed in for a different organization. Please sign in again.'));
          return;
        }

        navigate(`/t/${tenantUid}`);
      } catch {
        // If profile lookup fails, fall back to navigating to the app.
        navigate(`/t/${tenantUid}`);
      }
    };

    run();
  }, [user, tenant?.id, tenantUid, navigate, signOut, t]);

  // Load remembered phone on mount
  useEffect(() => {
    const savedPhone = localStorage.getItem(REMEMBERED_PHONE_KEY);
    if (savedPhone) {
      setPhoneNumber(savedPhone);
      setRememberMe(true);
    }
  }, []);

  // For OIDC tenants: immediately redirect to SSO (clickless flow) ONLY outside third-party iframes.
  // In third-party iframes we rely on host-provided tokens (postMessage). Many IdPs block being framed.
  useEffect(() => {
    const triggerSSO = async () => {
      if (!tenant?.oidc_config) return;
      
      try {
        const authUrl = await buildAuthorizationUrl(
          tenant.oidc_config.auth_url,
          tenant.oidc_config.client_id,
          tenant.oidc_config.redirect_uri,
          tenant.id
        );
        console.log('[TenantAuth] Redirecting to SSO:', authUrl);
        window.location.href = authUrl;
      } catch (err) {
        console.error('[TenantAuth] SSO redirect error:', err);
        setError('Failed to start SSO login. Please contact support.');
      }
    };

    // Only trigger for OIDC-only tenants when not logged in and tenant is loaded
    // isInIframe is only true for third-party cross-origin iframes, not same-origin (Lovable preview)
    if (
      !user &&
      !tenantLoading &&
      tenant?.auth_method === 'oidc' &&
      tenant?.oidc_config &&
      !isInIframe
    ) {
      console.log('[TenantAuth] OIDC tenant detected, triggering immediate SSO redirect');
      triggerSSO();
    }
  }, [tenant, tenantLoading, user, isInIframe]);


  const handleSendOtp = async () => {
    if (!tenant) return;
    
    setIsLoading(true);
    setError('');

    try {
      const phoneResult = phoneSchema.safeParse(phoneNumber);
      if (!phoneResult.success) {
        setError(phoneResult.error.errors[0].message);
        setIsLoading(false);
        return;
      }

      // Pass tenant_id to sendOtp
      const { error: sendError, isNewUser: newUser } = await sendOtp(phoneNumber, tenant.id);
      
      if (sendError) {
        setError(sendError.message);
      } else {
        setIsNewUser(newUser);
        if (newUser) {
          // New users must consent before proceeding
          setStep('consent');
        } else {
          setStep('verify');
        }
      }
    } catch (err) {
      setError(t('auth.unexpectedError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleUsernameSubmit = async () => {
    setIsLoading(true);
    setError('');

    try {
      const usernameResult = usernameSchema.safeParse(username);
      if (!usernameResult.success) {
        setError(usernameResult.error.errors[0].message);
        setIsLoading(false);
        return;
      }

      setStep('verify');
    } catch (err) {
      setError(t('auth.unexpectedError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6 || !tenant) return;
    if (verifyInFlightRef.current) return;
    verifyInFlightRef.current = true;
    
    setIsLoading(true);
    setError('');

    try {
      const { error: verifyError } = await verifyOtp(
        phoneNumber, 
        otpCode, 
        isNewUser ? username : undefined,
        tenant.id
      );
      
      if (verifyError) {
        setError(verifyError.message);
        setOtpCode('');
      } else {
        if (rememberMe) {
          localStorage.setItem(REMEMBERED_PHONE_KEY, phoneNumber);
        } else {
          localStorage.removeItem(REMEMBERED_PHONE_KEY);
        }
        navigate(`/t/${tenantUid}`);
      }
    } catch (err) {
      setError(t('auth.unexpectedError'));
      setOtpCode('');
    } finally {
      setIsLoading(false);
      verifyInFlightRef.current = false;
    }
  };

  const handleBack = () => {
    setError('');
    if (step === 'verify') {
      setStep(isNewUser ? 'username' : 'phone');
      setOtpCode('');
      verifyInFlightRef.current = false;
    } else if (step === 'username') {
      setStep('consent');
    } else if (step === 'consent') {
      setStep('phone');
    }
  };

  const handleConsentAgree = () => {
    setStep('username');
  };

  const handleResendCode = async () => {
    if (!tenant) return;
    
    setIsLoading(true);
    setError('');
    setOtpCode('');

    try {
      const { error: sendError } = await sendOtp(phoneNumber, tenant.id);
      if (sendError) {
        setError(sendError.message);
      }
    } catch (err) {
      setError(t('auth.unexpectedError'));
    } finally {
      setIsLoading(false);
    }
  };

  // Show loading while checking tenant
  if (tenantLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show error if tenant not found
  if (tenantError || !tenant) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Tenant Not Found</h1>
          <p className="text-muted-foreground">The requested tenant does not exist.</p>
        </div>
      </div>
    );
  }

  // Block 'both' auth method - admin needs to fix configuration
  if (tenant.auth_method === 'both') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-sm mx-auto px-4">
          <h1 className="text-2xl font-bold text-foreground mb-2">Configuration Error</h1>
          <p className="text-muted-foreground mb-4">
            This tenant has an invalid authentication configuration. Please contact your administrator.
          </p>
          <p className="text-xs text-muted-foreground">
            Tenant auth_method must be either 'otp' or 'oidc', not 'both'.
          </p>
        </div>
      </div>
    );
  }

  // OIDC-only: show redirecting state (auto-redirect happens via useEffect)
  if (tenant.auth_method === 'oidc') {
    if (isInIframe) {
      return (
        <div className="min-h-screen bg-background">
          <main className="container py-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-sm mx-auto text-center space-y-4"
            >
              <div className="text-center">
                <span className="inline-block px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
                  {tenant.name}
                </span>
              </div>

              {error ? (
                <p className="text-sm text-destructive">{error}</p>
              ) : (
                <>
                  <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
                  <p className="text-muted-foreground">
                    Waiting for your organization to sign you in…
                  </p>
                </>
              )}
            </motion.div>
          </main>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background">
        <main className="container py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-sm mx-auto text-center"
          >
            {/* Tenant badge */}
            <div className="text-center mb-6">
              <span className="inline-block px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
                {tenant.name}
              </span>
            </div>

            {error ? (
              <div className="space-y-4">
                <p className="text-sm text-destructive">{error}</p>
                <p className="text-muted-foreground text-sm">
                  Please contact your administrator for assistance.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
                <p className="text-muted-foreground">
                  Redirecting to your organization's login...
                </p>
              </div>
            )}
          </motion.div>
        </main>
      </div>
    );
  }

  // OTP-only: show traditional phone auth flow

  return (
    <div className="min-h-screen bg-background">
      <main className="container py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-sm mx-auto"
        >
          {/* Tenant badge */}
          <div className="text-center mb-6">
            <span className="inline-block px-3 py-1 bg-primary/10 text-primary rounded-full text-sm font-medium">
              {tenant.name}
            </span>
          </div>

          {/* Back button */}
          {step !== 'phone' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="mb-4"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('common.back', 'Back')}
            </Button>
          )}

          <AnimatePresence mode="wait">
            {/* Step 1: Phone Number */}
            {step === 'phone' && (
              <motion.div
                key="phone"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold text-foreground mb-2">
                    {t('auth.title')}
                  </h2>
                  <p className="text-muted-foreground">
                    {t('auth.phoneSubtitle', 'Enter your phone number to sign in or create an account')}
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Phone OTP Flow */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      {t('auth.phoneLabel', 'Phone Number')}
                    </label>
                    <PhoneInput
                      value={phoneNumber}
                      onChange={setPhoneNumber}
                      autoFocus
                    />
                  </div>

                  {error && (
                    <p className="text-sm text-destructive">{error}</p>
                  )}

                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="remember" 
                      checked={rememberMe}
                      onCheckedChange={(checked) => setRememberMe(checked === true)}
                    />
                    <label 
                      htmlFor="remember" 
                      className="text-sm text-muted-foreground cursor-pointer select-none"
                    >
                      {t('auth.staySignedIn', 'Stay signed in')}
                    </label>
                  </div>

                  <Button
                    onClick={handleSendOtp}
                    disabled={isLoading || !phoneNumber.trim()}
                    className="w-full h-12 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground font-semibold text-base"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {t('auth.sendingCode', 'Sending code...')}
                      </>
                    ) : (
                      t('auth.sendCode', 'Send Verification Code')
                    )}
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step 1b: Privacy Consent (for new users) */}
            {step === 'consent' && (
              <motion.div
                key="consent"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="text-center mb-4">
                  <h2 className="text-2xl font-bold text-foreground mb-2">
                    Before we continue...
                  </h2>
                </div>

                {/* Info box */}
                <div className="bg-muted/50 border border-border rounded-xl p-5">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                    <div className="space-y-3">
                      <p className="text-foreground">
                        To use this app, you agree for your full name and match predictions to be stored
                      </p>
                      <a
                        href="https://trust.getflip.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-primary hover:underline text-sm font-medium"
                      >
                        More info
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                </div>

                {/* Big agree button styled as checkbox */}
                <button
                  onClick={handleConsentAgree}
                  className="w-full p-5 rounded-xl border-2 border-primary bg-primary/10 hover:bg-primary/20 transition-colors flex items-center justify-center gap-3"
                >
                  <div className="w-7 h-7 rounded-md border-2 border-primary bg-background flex items-center justify-center">
                    <svg className="w-5 h-5 text-primary opacity-0 group-hover:opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-lg font-semibold text-foreground">I agree!</span>
                </button>
              </motion.div>
            )}

            {/* Step 2: Username (for new users) */}
            {step === 'username' && (
              <motion.div
                key="username"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold text-foreground mb-2">
                    {t('auth.chooseUsername', 'Choose Your Username')}
                  </h2>
                  <p className="text-muted-foreground">
                    {t('auth.usernameSubtitle', 'This will be your display name on the leaderboard')}
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">
                      {t('auth.usernameLabel')}
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                      <Input
                        type="text"
                        placeholder={t('auth.usernamePlaceholder')}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="pl-10 h-12 rounded-xl"
                        autoComplete="username"
                        autoFocus
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('auth.usernameHint')}
                    </p>
                  </div>

                  {error && (
                    <p className="text-sm text-destructive">{error}</p>
                  )}

                  <Button
                    onClick={handleUsernameSubmit}
                    disabled={isLoading || !username.trim()}
                    className="w-full h-12 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground font-semibold text-base"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      t('auth.continue', 'Continue')
                    )}
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Verify OTP */}
            {step === 'verify' && (
              <motion.div
                key="verify"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
              >
                <div className="text-center mb-8">
                  <h2 className="text-2xl font-bold text-foreground mb-2">
                    {t('auth.enterCode', 'Enter Verification Code')}
                  </h2>
                  <p className="text-muted-foreground">
                    {t('auth.codeSentTo', 'We sent a 6-digit code to')}
                  </p>
                  <p className="font-medium text-foreground">{phoneNumber}</p>
                </div>

                <div className="space-y-6">
                  <div className="flex justify-center">
                    <InputOTP
                      maxLength={6}
                      value={otpCode}
                      onChange={(value) => setOtpCode(value)}
                      onComplete={handleVerifyOtp}
                    >
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>

                  {error && (
                    <p className="text-sm text-destructive text-center">{error}</p>
                  )}

                  <Button
                    onClick={handleVerifyOtp}
                    disabled={isLoading || otpCode.length !== 6}
                    className="w-full h-12 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground font-semibold text-base"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {t('auth.verifying', 'Verifying...')}
                      </>
                    ) : (
                      t('auth.verify', 'Verify & Sign In')
                    )}
                  </Button>

                  <div className="text-center">
                    <button
                      onClick={handleResendCode}
                      disabled={isLoading}
                      className="text-sm text-muted-foreground hover:text-foreground underline"
                    >
                      {t('auth.resendCode', "Didn't receive a code? Resend")}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </main>
    </div>
  );
};

export default TenantAuth;
