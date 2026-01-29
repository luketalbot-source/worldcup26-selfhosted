import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

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
 * Supports:
 * - Receiving OIDC tokens from parent app (skip redirect flow)
 * - Logout signals from parent app
 * - User change detection (logout when parent user changes)
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

  // Handle direct token authentication
  const authenticateWithToken = useCallback(async (payload: IframeAuthMessage['payload']) => {
    if (!payload || !tenantId || processingRef.current) return;
    
    processingRef.current = true;

    try {
      // If we have an ID token, send it to the edge function
      if (payload.id_token) {
        const { data, error } = await supabase.functions.invoke('oidc-token-auth', {
          body: {
            id_token: payload.id_token,
            tenant_id: tenantId,
          },
        });

        if (error) {
          throw new Error(error.message || 'Token authentication failed');
        }

        if (data?.error) {
          if (data.needsUsername) {
            // New user needs username - for now, use name from token
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
              await supabase.auth.verifyOtp({
                token_hash: retryData.token,
                type: retryData.tokenType || 'magiclink',
              });
            }
          } else {
            throw new Error(data.error);
          }
        } else if (data?.token) {
          // Verify the token to sign in
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: data.token,
            type: data.tokenType || 'magiclink',
          });

          if (verifyError) {
            throw new Error(verifyError.message);
          }
        }

        onAuthSuccess?.();
      } else if (payload.sub) {
        // We only have claims, not a full token - need to use claims-based auth
        const { data, error } = await supabase.functions.invoke('oidc-claims-auth', {
          body: {
            oidc_subject: payload.sub,
            email: payload.email,
            name: payload.name || payload.preferred_username,
            tenant_id: tenantId,
          },
        });

        if (error) {
          throw new Error(error.message || 'Claims authentication failed');
        }

        if (data?.error) {
          throw new Error(data.error);
        }

        if (data?.token) {
          await supabase.auth.verifyOtp({
            token_hash: data.token,
            type: data.tokenType || 'magiclink',
          });
        }

        onAuthSuccess?.();
      }
    } catch (err) {
      console.error('Iframe auth error:', err);
      onAuthError?.(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      processingRef.current = false;
    }
  }, [tenantId, onAuthSuccess, onAuthError]);

  // Handle user mismatch detection
  const checkUserMatch = useCallback(async (payload: IframeAuthMessage['payload']) => {
    if (!user || !payload?.sub) return;

    // Get the current user's OIDC identity
    const { data: identity } = await supabase
      .from('oidc_identities')
      .select('oidc_subject')
      .eq('user_id', user.id)
      .single();

    if (identity && identity.oidc_subject !== payload.sub) {
      console.log('User mismatch detected, logging out');
      await signOut();
      onUserMismatch?.();
    }
  }, [user, signOut, onUserMismatch]);

  // Listen for postMessage events
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Basic security: could add origin check here if needed
      const message = event.data as IframeAuthMessage;
      
      if (!message?.type) return;

      switch (message.type) {
        case 'OIDC_TOKEN':
          await authenticateWithToken(message.payload);
          break;

        case 'AUTH_LOGOUT':
          await signOut();
          break;

        case 'AUTH_USER_CHANGED':
          if (user) {
            await checkUserMatch(message.payload);
          } else if (message.payload) {
            // Not logged in, try to authenticate
            await authenticateWithToken(message.payload);
          }
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [authenticateWithToken, checkUserMatch, signOut, user]);

  // Send ready message to parent when mounted
  useEffect(() => {
    if (window.parent !== window) {
      window.parent.postMessage({
        type: 'IFRAME_AUTH_READY',
        payload: { tenantUid, isLoggedIn: !!user },
      }, '*');
    }
  }, [tenantUid, user]);

  return {
    isInIframe: window.parent !== window,
    authenticateWithToken,
  };
};
