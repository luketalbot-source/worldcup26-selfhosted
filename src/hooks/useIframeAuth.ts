import { useEffect, useCallback, useRef, useState } from 'react';
import { api } from '@/lib/apiClient';
import { setAccessToken } from '@/lib/auth';
import { useAuth } from '@/contexts/AuthContext';
import { iframeMessageBridge } from '@/lib/iframeMessageBridge';

export interface IframeAuthMessage {
  type: 'OIDC_TOKEN' | 'AUTH_LOGOUT' | 'AUTH_USER_CHANGED';
  payload?: {
    id_token?: string;
    access_token?: string;
    // Decoded claims if token not available
    sub?: string;
    email?: string;
    name?: string;
    preferred_username?: string;
  };
}

interface UseIframeAuthOptions {
  tenantId: string | null;
  tenantUid: string | undefined;
  onAuthSuccess?: () => void;
  onAuthError?: (error: string) => void;
  onUserMismatch?: () => void;
}

/**
 * Hook for handling iframe authentication via postMessage
 *
 * Uses a global message bridge to ensure no messages are lost during
 * React component mount/unmount cycles (including StrictMode double-mount)
 */
export const useIframeAuth = ({
  tenantId,
  tenantUid,
  onAuthSuccess,
  onAuthError,
  onUserMismatch,
}: UseIframeAuthOptions) => {
  const { user, signOut } = useAuth();
  const processingRef = useRef(false);
  const [tokenReceived, setTokenReceived] = useState(false);

  // Handle direct token authentication
  const authenticateWithToken = useCallback(async (payload: IframeAuthMessage['payload']) => {
    if (!payload || !tenantId) {
      return false;
    }

    if (processingRef.current) {
      return false;
    }

    processingRef.current = true;

    try {
      // If we have an ID token, send it to the API. The backend now always
      // derives a display name from OIDC claims (given_name + family_name
      // preferred) so there's no longer a needsUsername retry path.
      if (payload.id_token) {
        const data = await api.post<{ access_token: string; error?: string }>(
          '/auth/oidc/token-auth',
          {
            id_token: payload.id_token,
            tenant_id: tenantId,
          }
        );

        if (data?.error) throw new Error(data.error);
        if (data?.access_token) setAccessToken(data.access_token);

        onAuthSuccess?.();
        return true;
      } else if (payload.sub) {
        onAuthError?.('Claims-based authentication requires an id_token');
        return false;
      }
    } catch (err) {
      onAuthError?.(err instanceof Error ? err.message : 'Authentication failed');
      return false;
    } finally {
      processingRef.current = false;
    }

    return false;
  }, [tenantId, onAuthSuccess, onAuthError]);

  // Handle user mismatch detection - returns true if mismatch found
  const checkUserMatch = useCallback(async (payload: IframeAuthMessage['payload']): Promise<boolean> => {
    if (!user || !payload?.sub) return false;

    let identity: { tenant_id: string; oidc_subject: string } | null = null;
    try {
      identity = await api.get<{ tenant_id: string; oidc_subject: string }>(
        '/auth/identity',
        tenantId ? { tenant_id: tenantId } : undefined
      );
    } catch {
      identity = null;
    }

    if (identity && identity.oidc_subject !== payload.sub) {
      await signOut();
      onUserMismatch?.();
      return true;
    }

    // Also check if NO identity found but user exists (edge case)
    if (!identity && payload.sub) {
      await signOut();
      onUserMismatch?.();
      return true;
    }

    return false;
  }, [user, signOut, onUserMismatch, tenantId]);

  // Use refs to keep callbacks up-to-date without recreating the subscription
  const authenticateWithTokenRef = useRef(authenticateWithToken);
  const checkUserMatchRef = useRef(checkUserMatch);
  const signOutRef = useRef(signOut);
  const onUserMismatchRef = useRef(onUserMismatch);
  const userRef = useRef(user);
  const tenantIdRef = useRef(tenantId);

  useEffect(() => {
    authenticateWithTokenRef.current = authenticateWithToken;
    checkUserMatchRef.current = checkUserMatch;
    signOutRef.current = signOut;
    onUserMismatchRef.current = onUserMismatch;
    userRef.current = user;
    tenantIdRef.current = tenantId;
  }, [authenticateWithToken, checkUserMatch, signOut, onUserMismatch, user, tenantId]);

  // Subscribe to the global message bridge
  useEffect(() => {
    const handleMessage = async (message: IframeAuthMessage) => {
      switch (message.type) {
        case 'OIDC_TOKEN':
          if (!tenantIdRef.current) {
            // The bridge will queue the message and replay it when we subscribe again
            // But we can also store it locally
            setTimeout(async () => {
              if (tenantIdRef.current && message.payload) {
                const success = await authenticateWithTokenRef.current(message.payload);
                if (success) {
                  setTokenReceived(true);
                }
              }
            }, 500);
            setTokenReceived(true); // Mark that we received a token (to suppress auto-SSO)
          } else {
            const success = await authenticateWithTokenRef.current(message.payload);
            if (success) {
              setTokenReceived(true);
            }
          }
          break;

        case 'AUTH_LOGOUT':
          if (userRef.current) {
            await signOutRef.current();
          }
          // Always trigger the mismatch callback to redirect to auth
          onUserMismatchRef.current?.();
          break;

        case 'AUTH_USER_CHANGED':
          if (userRef.current && message.payload?.sub) {
            // Check if different user, sign out if needed
            const wasMismatch = await checkUserMatchRef.current(message.payload);

            // After signing out the old user, authenticate the new one
            if (wasMismatch && message.payload?.id_token) {
              await authenticateWithTokenRef.current(message.payload);
            }
          } else if (!userRef.current && message.payload) {
            // No current user, just authenticate with the new token
            await authenticateWithTokenRef.current(message.payload);
          }
          break;
      }
    };

    const unsubscribe = iframeMessageBridge.subscribe(handleMessage);

    return () => {
      unsubscribe();
    };
  }, []); // Empty deps - refs handle updates

  // Send ready message to parent when mounted.
  //
  // We deliberately always claim isLoggedIn: false here, even when the
  // iframe has a cached session from a previous Flip user. Reason: when
  // a host user signs out and back in as someone else, the iframe still
  // holds the previous user's httpOnly refresh cookie + sessionStorage
  // — auto-restore would silently keep us as that stale user. Telling
  // the parent "I need auth" forces it to post the current OIDC_TOKEN,
  // which authenticateWithToken exchanges for a new app session
  // (replacing both the access token and the refresh cookie via
  // /auth/oidc/token-auth). If the parent posts the same user's token,
  // it's a harmless no-op refresh; if a different user, the session
  // switches cleanly.
  //
  // We send only on initial mount + tenant change — re-sending on every
  // user state change would loop (token arrives → user updates → effect
  // re-fires → token arrives again …).
  useEffect(() => {
    const isInIframe = window.parent !== window;
    if (isInIframe) {
      window.parent.postMessage({
        type: 'IFRAME_AUTH_READY',
        payload: { tenantUid, isLoggedIn: false },
      }, '*');
    }
  }, [tenantUid]);

  return {
    isInIframe: window.parent !== window,
    tokenReceived,
    authenticateWithToken,
  };
};
