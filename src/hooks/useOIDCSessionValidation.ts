import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface OIDCConfig {
  auth_url: string;
  client_id: string;
  redirect_uri: string;
}

interface UseOIDCSessionValidationProps {
  tenantId: string | null;
  userId: string | null;
  onSessionInvalid: () => void;
}

/**
 * Hook to validate OIDC sessions on app load.
 * For users who authenticated via SSO, this performs a silent re-auth check
 * using prompt=none to verify the user is still logged in at the IdP.
 */
export const useOIDCSessionValidation = ({
  tenantId,
  userId,
  onSessionInvalid,
}: UseOIDCSessionValidationProps) => {
  const [isValidating, setIsValidating] = useState(false);
  const validationAttemptedRef = useRef(false);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const { signOut } = useAuth();

  useEffect(() => {
    if (!tenantId || !userId || validationAttemptedRef.current) return;

    const validateOIDCSession = async () => {
      try {
        // Check if user has an OIDC identity for this tenant
        const { data: oidcIdentity } = await supabase
          .from('oidc_identities')
          .select('id, oidc_subject')
          .eq('user_id', userId)
          .eq('tenant_id', tenantId)
          .maybeSingle();

        if (!oidcIdentity) {
          // User didn't use OIDC, no validation needed
          console.log('[OIDCValidation] User does not have OIDC identity, skipping validation');
          return;
        }

        console.log('[OIDCValidation] User has OIDC identity, checking IdP session');

        // Get tenant's OIDC config
        const { data: tenant } = await supabase
          .from('tenants')
          .select('id, auth_method')
          .eq('id', tenantId)
          .single();

        if (!tenant || tenant.auth_method !== 'oidc') {
          console.log('[OIDCValidation] Tenant is not OIDC-only, skipping validation');
          return;
        }

        const { data: oidcConfig } = await supabase
          .from('tenant_oidc_config')
          .select('auth_url, client_id, redirect_uri')
          .eq('tenant_id', tenantId)
          .single();

        if (!oidcConfig) {
          console.log('[OIDCValidation] No OIDC config found, skipping validation');
          return;
        }

        setIsValidating(true);
        validationAttemptedRef.current = true;

        // Perform silent re-auth check using a hidden iframe
        const isValid = await performSilentAuthCheck(oidcConfig);

        if (!isValid) {
          console.log('[OIDCValidation] IdP session invalid, signing out user');
          await signOut();
          onSessionInvalid();
        } else {
          console.log('[OIDCValidation] IdP session is valid');
        }
      } catch (err) {
        console.error('[OIDCValidation] Error validating OIDC session:', err);
        // On error, don't sign out - let user continue
      } finally {
        setIsValidating(false);
      }
    };

    validateOIDCSession();
  }, [tenantId, userId, onSessionInvalid, signOut]);

  const performSilentAuthCheck = (oidcConfig: OIDCConfig): Promise<boolean> => {
    return new Promise((resolve) => {
      // Clean up any existing iframe
      if (iframeRef.current) {
        document.body.removeChild(iframeRef.current);
        iframeRef.current = null;
      }

      // Build silent auth URL with prompt=none
      const silentAuthUrl = new URL(oidcConfig.auth_url);
      silentAuthUrl.searchParams.set('response_type', 'code');
      silentAuthUrl.searchParams.set('client_id', oidcConfig.client_id);
      // Use a special silent callback path that just posts a message
      silentAuthUrl.searchParams.set('redirect_uri', `${window.location.origin}/oidc-silent-callback.html`);
      silentAuthUrl.searchParams.set('scope', 'openid');
      silentAuthUrl.searchParams.set('prompt', 'none');
      silentAuthUrl.searchParams.set('state', 'silent_check');

      // Create hidden iframe
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = silentAuthUrl.toString();
      iframeRef.current = iframe;

      // Set timeout for response
      const timeout = setTimeout(() => {
        console.log('[OIDCValidation] Silent auth check timed out');
        cleanup();
        // Timeout - assume session is valid to avoid disrupting user
        resolve(true);
      }, 10000);

      const handleMessage = (event: MessageEvent) => {
        // Only accept messages from our silent callback
        if (event.origin !== window.location.origin) return;
        
        if (event.data?.type === 'oidc_silent_callback') {
          cleanup();
          
          if (event.data.error) {
            // Common errors: login_required, interaction_required, consent_required
            console.log('[OIDCValidation] IdP returned error:', event.data.error);
            resolve(false);
          } else if (event.data.code) {
            // Got a code, session is valid
            console.log('[OIDCValidation] IdP returned auth code, session valid');
            resolve(true);
          } else {
            // Unknown response, assume valid
            resolve(true);
          }
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        window.removeEventListener('message', handleMessage);
        if (iframeRef.current && document.body.contains(iframeRef.current)) {
          document.body.removeChild(iframeRef.current);
          iframeRef.current = null;
        }
      };

      window.addEventListener('message', handleMessage);
      document.body.appendChild(iframe);
    });
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (iframeRef.current && document.body.contains(iframeRef.current)) {
        document.body.removeChild(iframeRef.current);
      }
    };
  }, []);

  return { isValidating };
};
