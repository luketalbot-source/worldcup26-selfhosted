import { useEffect, useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
      console.log('[useIframeAuth] authenticateWithToken called but missing data:', { 
        hasPayload: !!payload, 
        tenantId 
      });
      return false;
    }
    
    if (processingRef.current) {
      console.log('[useIframeAuth] Already processing a token, skipping');
      return false;
    }
    
    processingRef.current = true;
    console.log('[useIframeAuth] Processing token authentication');

    try {
      // If we have an ID token, send it to the edge function
      if (payload.id_token) {
        console.log('[useIframeAuth] Sending id_token to oidc-token-auth edge function');
        
        const { data, error } = await supabase.functions.invoke('oidc-token-auth', {
          body: {
            id_token: payload.id_token,
            tenant_id: tenantId,
          },
        });

        console.log('[useIframeAuth] Edge function response:', { data, error });

        if (error) {
          throw new Error(error.message || 'Token authentication failed');
        }

        if (data?.error) {
          if (data.needsUsername) {
            console.log('[useIframeAuth] New user needs username, using name from token');
            const username = payload.name || payload.preferred_username || payload.sub?.substring(0, 16);
            const { data: retryData, error: retryError } = await supabase.functions.invoke('oidc-token-auth', {
              body: {
                id_token: payload.id_token,
                tenant_id: tenantId,
                username,
              },
            });

            if (retryError || retryData?.error) {
              throw new Error(retryData?.error || retryError?.message || 'Failed to create account');
            }

            if (retryData?.token) {
              console.log('[useIframeAuth] Verifying OTP for new user');
              await supabase.auth.verifyOtp({
                token_hash: retryData.token,
                type: retryData.tokenType || 'magiclink',
              });
            }
          } else {
            throw new Error(data.error);
          }
        } else if (data?.token) {
          console.log('[useIframeAuth] Verifying OTP token');
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: data.token,
            type: data.tokenType || 'magiclink',
          });

          if (verifyError) {
            throw new Error(verifyError.message);
          }
          console.log('[useIframeAuth] OTP verified successfully');
        }

        onAuthSuccess?.();
        return true;
      } else if (payload.sub) {
        console.log('[useIframeAuth] No id_token, only sub claim - claims-based auth not implemented');
        onAuthError?.('Claims-based authentication requires an id_token');
        return false;
      }
    } catch (err) {
      console.error('[useIframeAuth] Auth error:', err);
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

    console.log('[useIframeAuth] Checking user match, current user:', user.id);
    
    const { data: identity } = await supabase
      .from('oidc_identities')
      .select('oidc_subject')
      .eq('user_id', user.id)
      .single();

    if (identity && identity.oidc_subject !== payload.sub) {
      console.log('[useIframeAuth] User mismatch detected - current:', identity.oidc_subject, 'new:', payload.sub);
      await signOut();
      onUserMismatch?.();
      return true;
    }
    
    // Also check if NO identity found but user exists (edge case)
    if (!identity && payload.sub) {
      console.log('[useIframeAuth] No OIDC identity for current user, signing out for new user');
      await signOut();
      onUserMismatch?.();
      return true;
    }
    
    return false;
  }, [user, signOut, onUserMismatch]);

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
      console.log('[useIframeAuth] Processing message from bridge:', message.type, { 
        hasPayload: !!message.payload,
        hasIdToken: !!message.payload?.id_token,
        hasSub: !!message.payload?.sub,
        tenantId: tenantIdRef.current,
      });

      switch (message.type) {
        case 'OIDC_TOKEN':
          if (!tenantIdRef.current) {
            console.log('[useIframeAuth] Tenant not ready yet, will retry when ready');
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
          console.log('[useIframeAuth] Logout signal received from parent');
          if (userRef.current) {
            await signOutRef.current();
          }
          // Always trigger the mismatch callback to redirect to auth
          onUserMismatchRef.current?.();
          break;

        case 'AUTH_USER_CHANGED':
          console.log('[useIframeAuth] User changed signal received', { 
            hasCurrentUser: !!userRef.current,
            newSub: message.payload?.sub 
          });
          
          if (userRef.current && message.payload?.sub) {
            // Check if different user, sign out if needed
            const wasMismatch = await checkUserMatchRef.current(message.payload);
            
            // After signing out the old user, authenticate the new one
            if (wasMismatch && message.payload?.id_token) {
              console.log('[useIframeAuth] Re-authenticating with new user token');
              await authenticateWithTokenRef.current(message.payload);
            }
          } else if (!userRef.current && message.payload) {
            // No current user, just authenticate with the new token
            await authenticateWithTokenRef.current(message.payload);
          }
          break;
      }
    };

    console.log('[useIframeAuth] Subscribing to message bridge');
    const unsubscribe = iframeMessageBridge.subscribe(handleMessage);
    
    return () => {
      console.log('[useIframeAuth] Unsubscribing from message bridge');
      unsubscribe();
    };
  }, []); // Empty deps - refs handle updates

  // Send ready message to parent when mounted
  useEffect(() => {
    const isInIframe = window.parent !== window;
    if (isInIframe) {
      console.log('[useIframeAuth] Sending IFRAME_AUTH_READY to parent');
      window.parent.postMessage({
        type: 'IFRAME_AUTH_READY',
        payload: { tenantUid, isLoggedIn: !!user },
      }, '*');
    }
  }, [tenantUid, user]);

  return {
    isInIframe: window.parent !== window,
    tokenReceived,
    authenticateWithToken,
  };
};
