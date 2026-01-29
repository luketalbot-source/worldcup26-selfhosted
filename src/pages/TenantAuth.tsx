import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { User, ArrowLeft, Loader2, LogIn } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { useIframeAuth } from '@/hooks/useIframeAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { PhoneInput } from '@/components/PhoneInput';
import { z } from 'zod';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { buildAuthorizationUrl } from '@/lib/oidc';

const REMEMBERED_PHONE_KEY = 'wc2026_remembered_phone';

type AuthStep = 'phone' | 'username' | 'verify';

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
  const [isOIDCLoading, setIsOIDCLoading] = useState(false);
  const [autoSSOTriggered, setAutoSSOTriggered] = useState(false);
  const verifyInFlightRef = useRef(false);
  const { sendOtp, verifyOtp, user } = useAuth();
  const navigate = useNavigate();
  
  // Iframe auth support
  const { isInIframe } = useIframeAuth({
    tenantId: tenant?.id || null,
    tenantUid,
    onAuthSuccess: () => {
      navigate(`/t/${tenantUid}`);
    },
    onAuthError: (err) => {
      setError(err);
      setIsOIDCLoading(false);
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

  // Redirect if already logged in
  useEffect(() => {
    if (user && tenantUid) {
      navigate(`/t/${tenantUid}`);
    }
  }, [user, navigate, tenantUid]);

  // Load remembered phone on mount
  useEffect(() => {
    const savedPhone = localStorage.getItem(REMEMBERED_PHONE_KEY);
    if (savedPhone) {
      setPhoneNumber(savedPhone);
      setRememberMe(true);
    }
  }, []);

  // Auto-trigger SSO for OIDC-only tenants in iframe
  useEffect(() => {
    if (
      !autoSSOTriggered &&
      !user &&
      !tenantLoading &&
      tenant?.auth_method === 'oidc' &&
      tenant?.oidc_config &&
      isInIframe
    ) {
      setAutoSSOTriggered(true);
      // Small delay to ensure parent app can send token via postMessage first
      const timer = setTimeout(() => {
        if (!user) {
          handleOIDCLogin();
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [tenant, tenantLoading, user, autoSSOTriggered, isInIframe]);

  const handleOIDCLogin = async () => {
    if (!tenant?.oidc_config) return;
    
    setIsOIDCLoading(true);
    setError('');

    try {
      const authUrl = await buildAuthorizationUrl(
        tenant.oidc_config.auth_url,
        tenant.oidc_config.client_id,
        tenant.oidc_config.redirect_uri,
        tenant.id
      );
      
      // Redirect to IDP
      window.location.href = authUrl;
    } catch (err) {
      console.error('OIDC login error:', err);
      setError('Failed to start SSO login');
      setIsOIDCLoading(false);
    }
  };

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
          setStep('username');
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
      setStep('phone');
    }
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

  // Determine which auth methods to show
  const showOTP = tenant.auth_method === 'otp' || tenant.auth_method === 'both';
  const showOIDC = (tenant.auth_method === 'oidc' || tenant.auth_method === 'both') && tenant.oidc_config;

  // If only OIDC is enabled, show simplified view
  if (tenant.auth_method === 'oidc' && tenant.oidc_config) {
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

            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-foreground mb-2">
                {t('auth.title')}
              </h2>
              <p className="text-muted-foreground">
                Sign in with your organization account
              </p>
            </div>

            <div className="space-y-4">
              {error && (
                <p className="text-sm text-destructive text-center">{error}</p>
              )}

              <Button
                onClick={handleOIDCLogin}
                disabled={isOIDCLoading}
                className="w-full h-12 rounded-xl bg-accent hover:bg-accent/90 text-accent-foreground font-semibold text-base"
              >
                {isOIDCLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <LogIn className="w-4 h-4 mr-2" />
                )}
                Sign in with SSO
              </Button>
            </div>
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
            {/* Step 1: Phone Number (and/or SSO) */}
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
                    {showOIDC && showOTP
                      ? 'Sign in with SSO or phone number'
                      : t('auth.phoneSubtitle', 'Enter your phone number to sign in or create an account')
                    }
                  </p>
                </div>

                <div className="space-y-4">
                  {/* SSO Button */}
                  {showOIDC && (
                    <>
                      <Button
                        onClick={handleOIDCLogin}
                        disabled={isOIDCLoading}
                        variant="outline"
                        className="w-full h-12 rounded-xl font-semibold text-base"
                      >
                        {isOIDCLoading ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <LogIn className="w-4 h-4 mr-2" />
                        )}
                        Sign in with SSO
                      </Button>

                      {showOTP && (
                        <div className="relative">
                          <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                          </div>
                          <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-background px-2 text-muted-foreground">
                              Or continue with
                            </span>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {/* Phone OTP Flow */}
                  {showOTP && (
                    <>
                      <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">
                          {t('auth.phoneLabel', 'Phone Number')}
                        </label>
                        <PhoneInput
                          value={phoneNumber}
                          onChange={setPhoneNumber}
                          autoFocus={!showOIDC}
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
                    </>
                  )}
                </div>
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
