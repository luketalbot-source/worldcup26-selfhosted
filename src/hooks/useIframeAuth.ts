import { useEffect, useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { User } from '@supabase/supabase-js';

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
  const [isProcessing, setIsProcessing] = useState(false);
  const pendingAuthPayloadRef = useRef<IframeAuthMessage['payload'] | null>(null);

  const getCurrentOidcSubject = useCallback((u: User | null) => {
    if (!u) return null;
    const meta = (u.user_metadata || {}) as Record<string, unknown>;
    const sub = meta.oidc_subject || meta.sub;
    return typeof sub === 'string' && sub.length > 0 ? sub : null;
  }, []);

  // Handle direct token authentication
  const authenticateWithToken = useCallback(async (payload: IframeAuthMessage['payload']) => {
    if (!payload || processingRef.current) return;

    // Race fix: the parent can send the token before the tenant is loaded.
    // Queue the payload and process it as soon as tenantId becomes available.
    if (!tenantId) {
      pendingAuthPayloadRef.current = payload;
      setIsProcessing(true);
      return;
    }
    
    setIsProcessing(true);
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
        // We cannot safely authenticate with only decoded claims unless the backend provides a dedicated flow.
        // Avoid invoking non-existent functions; instead show a clear error so the host integration can be fixed.
        throw new Error('Host did not provide an id_token for SSO. Please pass an id_token in the postMessage payload.');
      }
    } catch (err) {
      console.error('Iframe auth error:', err);
      onAuthError?.(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      processingRef.current = false;
      setIsProcessing(false);
    }
  }, [tenantId, onAuthSuccess, onAuthError]);

  // Process any queued auth payload once tenantId becomes available
  useEffect(() => {
    if (!tenantId) return;
    if (processingRef.current) return;
    const pending = pendingAuthPayloadRef.current;
    if (!pending) return;
    pendingAuthPayloadRef.current = null;
    authenticateWithToken(pending);
  }, [tenantId, authenticateWithToken]);

  // Handle user mismatch + session switch
  const handleUserChanged = useCallback(async (payload: IframeAuthMessage['payload']) => {
    // If parent explicitly indicates no user (empty payload), sign out
    if (!payload || (!payload.sub && !payload.id_token)) {
      await signOut();
      return;
    }

    // If we're not logged in, just authenticate
    if (!user) {
      await authenticateWithToken(payload);
      return;
    }

    // Only switch if we can definitively confirm a DIFFERENT user
    // (both have sub claims and they don't match)
    const currentSub = getCurrentOidcSubject(user);
    const incomingSub = payload.sub;

    // Only sign out and re-auth if BOTH subs exist and they differ
    if (currentSub && incomingSub && currentSub !== incomingSub) {
      await signOut();
      onUserMismatch?.();
      await authenticateWithToken(payload);
    }
    // Otherwise, keep the current session - don't disrupt a working login
  }, [authenticateWithToken, getCurrentOidcSubject, onUserMismatch, signOut, user]);

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
          await handleUserChanged(message.payload);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [authenticateWithToken, handleUserChanged, signOut]);

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
    isProcessing,
    authenticateWithToken,
  };
};
