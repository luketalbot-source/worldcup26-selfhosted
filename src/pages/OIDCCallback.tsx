import { useEffect, useState, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Loader2, ArrowLeft, Info, ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import { api } from '@/lib/apiClient';
import { setAccessToken } from '@/lib/auth';
import { retrievePKCEParams } from '@/lib/oidc';
import { Button } from '@/components/ui/button';

type CallbackStep = 'processing' | 'consent' | 'error';

const OIDCCallback = () => {
  const { tenantUid } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [step, setStep] = useState<CallbackStep>('processing');
  const [error, setError] = useState<string>('');
  const [consentSaving, setConsentSaving] = useState(false);

  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    // Read OIDC params from BOTH the query string and the URL fragment.
    // Most IdPs use ?code=... for response_type=code (we also force
    // response_mode=query in the auth URL), but Keycloak can be configured
    // to fragmentise on the client side — and tampering with that during
    // a deploy would silently break sign-in for everyone. Reading both is
    // cheap and bullet-proof.
    const queryParams = searchParams;
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const pick = (key: string) => queryParams.get(key) ?? hashParams.get(key);

    const code = pick('code');
    const state = pick('state');
    const errorParam = pick('error');
    const errorDescription = pick('error_description');

    // Handle IDP errors (both error= styles).
    if (errorParam) {
      console.error('[oidc-callback] IdP returned error:', errorParam, errorDescription);
      setError(errorDescription || errorParam);
      setStep('error');
      return;
    }

    if (!code || !state) {
      // No OIDC params at all? This page should only be reached as a
      // Keycloak redirect-back, but a misconfigured embed (e.g. the Flip
      // iframe src pointing at /auth/callback instead of /t/{uid}) can
      // land us here cold. Bail to the tenant root and let the embedded
      // postMessage auth flow (useIframeAuth) take over rather than
      // showing a confusing "Missing code/state" error.
      console.warn(
        '[oidc-callback] no OIDC params on landing — redirecting to tenant root.',
        'URL =', window.location.href,
        'search =', window.location.search,
        'hash =', window.location.hash
      );
      if (tenantUid) {
        navigate(`/t/${tenantUid}`, { replace: true });
      } else {
        setError('Missing authorization code or state');
        setStep('error');
      }
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

    // Exchange code for tokens (pass the PKCE verifier — required when the
    // IdP enforces PKCE, which Keycloak does by default for public clients).
    exchangeCode(code, params.tenantId, params.verifier);
  }, [searchParams]);

  const exchangeCode = async (code: string, tenantId: string, codeVerifier: string) => {
    setError('');

    try {
      // The backend derives a display name from the OIDC claims
      // (given_name + family_name preferred) so there's no longer a
      // needsUsername step. Consent may still be required on first login.
      const data = await api.post<{ access_token: string; needsConsent?: boolean }>(
        '/auth/oidc/callback',
        {
          code,
          state: searchParams.get('state'),
          tenant_id: tenantId,
          code_verifier: codeVerifier,
        }
      );

      setAccessToken(data.access_token);

      if (data.needsConsent) {
        setStep('consent');
        setIsLoading(false);
        return;
      }

      // Success - redirect to tenant app
      navigate(`/t/${tenantUid}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
      setStep('error');
    }
  };

  const handleConsentAgree = async () => {
    // Same flow for new and returning users now: backend has already written
    // profile.display_name from OIDC claims, so we just record consent and go.
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

  // Any step value other than the 3 handled above shouldn't happen; return
  // null to keep TypeScript happy and the component a total function.
  return null;
};

export default OIDCCallback;
