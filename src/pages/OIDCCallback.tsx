import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Loader2, User, ArrowLeft, Info, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '@/lib/apiClient';
import { setAccessToken } from '@/lib/auth';
import { retrievePKCEParams } from '@/lib/oidc';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type CallbackStep = 'processing' | 'consent' | 'username' | 'error';

const OIDCCallback = () => {
  const { t } = useTranslation();
  const { tenantUid } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [step, setStep] = useState<CallbackStep>('processing');
  const [error, setError] = useState<string>('');
  const [username, setUsername] = useState('');
  const [suggestedName, setSuggestedName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pkceParams, setPkceParams] = useState<{ verifier: string; state: string; tenantId: string } | null>(null);
  const [isNewUser, setIsNewUser] = useState(false);
  const [consentSaving, setConsentSaving] = useState(false);

  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const errorParam = searchParams.get('error');
    const errorDescription = searchParams.get('error_description');

    // Handle IDP errors
    if (errorParam) {
      setError(errorDescription || errorParam);
      setStep('error');
      return;
    }

    if (!code || !state) {
      setError('Missing authorization code or state');
      setStep('error');
      return;
    }

    // Retrieve PKCE params
    const params = retrievePKCEParams();
    if (!params) {
      setError('Session expired. Please try logging in again.');
      setStep('error');
      return;
    }

    // Validate state
    if (params.state !== state) {
      setError('Invalid state parameter. Please try logging in again.');
      setStep('error');
      return;
    }

    setPkceParams(params);

    // Exchange code for tokens (pass the PKCE verifier — required when the
    // IdP enforces PKCE, which Keycloak does by default for public clients).
    exchangeCode(code, params.tenantId, params.verifier);
  }, [searchParams]);

  const exchangeCode = async (code: string, tenantId: string, codeVerifier: string) => {
    setIsLoading(true);
    setError('');

    try {
      const data = await api.post<{ access_token: string; needsConsent?: boolean; needsUsername?: boolean; suggestedName?: string }>('/auth/oidc/callback', {
        code,
        state: searchParams.get('state'),
        tenant_id: tenantId,
        code_verifier: codeVerifier,
      });

      setAccessToken(data.access_token);

      if (data.needsUsername) {
        setSuggestedName(data.suggestedName || '');
        setIsNewUser(true);
        // New users go to consent first, then username
        setStep('consent');
        setIsLoading(false);
        return;
      }

      if (data.needsConsent) {
        setIsNewUser(false);
        setStep('consent');
        setIsLoading(false);
        return;
      }

      // Success - redirect to tenant app
      navigate(`/t/${tenantUid}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setStep('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUsernameSubmit = async () => {
    if (!username.trim() || !pkceParams) return;

    setIsLoading(true);
    setError('');
    try {
      const data = await api.post<{ access_token: string }>('/auth/oidc/callback', {
        code: searchParams.get('code'),
        state: searchParams.get('state'),
        tenant_id: pkceParams.tenantId,
        code_verifier: pkceParams.verifier,
        username: username.trim(),
      });

      setAccessToken(data.access_token);
      navigate(`/t/${tenantUid}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setStep('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConsentAgree = async () => {
    if (isNewUser) {
      // New user - proceed to username step (consent will be saved after username is set)
      setStep('username');
    } else {
      // Returning user - save consent now and redirect
      setConsentSaving(true);
      try {
        await api.patch('/profiles/me', { privacy_consent_at: new Date().toISOString() });
        navigate(`/t/${tenantUid}`);
      } catch (err) {
        setError('Failed to save consent. Please try again.');
        setStep('error');
      } finally {
        setConsentSaving(false);
      }
    }
  };

  const handleRetry = () => {
    navigate(`/t/${tenantUid}/auth`);
  };

  if (step === 'processing') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Completing sign in...</p>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-sm w-full text-center">
          <div className="text-destructive mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-foreground mb-2">Sign In Failed</h2>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Button onClick={handleRetry} className="w-full">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  // Consent step for new OIDC users
  if (step === 'consent') {
    return (
      <div className="min-h-screen bg-background">
        <main className="container py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-sm mx-auto"
          >
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
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
                disabled={consentSaving}
                className="w-full p-5 rounded-xl border-2 border-primary bg-primary/10 hover:bg-primary/20 transition-colors flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {consentSaving ? (
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                ) : (
                  <div className="w-7 h-7 rounded-md border-2 border-primary bg-background flex items-center justify-center">
                    <svg className="w-5 h-5 text-primary opacity-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
                <span className="text-lg font-semibold text-foreground">
                  {consentSaving ? 'Saving...' : 'I agree!'}
                </span>
              </button>
            </motion.div>
          </motion.div>
        </main>
      </div>
    );
  }

  // Username step for new OIDC users
  return (
    <div className="min-h-screen bg-background">
      <main className="container py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-sm mx-auto"
        >
          <AnimatePresence mode="wait">
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
                    {t('auth.usernameLabel', 'Username')}
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder={t('auth.usernamePlaceholder', 'Enter username')}
                      value={username || suggestedName}
                      onChange={(e) => setUsername(e.target.value)}
                      className="pl-10 h-12 rounded-xl"
                      autoComplete="username"
                      autoFocus
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t('auth.usernameHint', '2-20 characters, letters, numbers, and underscores only')}
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
          </AnimatePresence>
        </motion.div>
      </main>
    </div>
  );
};

export default OIDCCallback;
