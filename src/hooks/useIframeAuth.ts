import { useEffect, useCallback, useRef, useState } from 'react';
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
  const [tokenReceived, setTokenReceived] = useState(false);
  
  // Queue to store messages that arrive before tenant is ready
  const messageQueueRef = useRef<IframeAuthMessage[]>([]);

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
          // Verify the token to sign in
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
        // We only have claims, not a full token - this path needs a separate edge function
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

  // Handle user mismatch detection
  const checkUserMatch = useCallback(async (payload: IframeAuthMessage['payload']) => {
    if (!user || !payload?.sub) return;

    console.log('[useIframeAuth] Checking user match');
    
    // Get the current user's OIDC identity
    const { data: identity } = await supabase
      .from('oidc_identities')
      .select('oidc_subject')
      .eq('user_id', user.id)
      .single();

    if (identity && identity.oidc_subject !== payload.sub) {
      console.log('[useIframeAuth] User mismatch detected, logging out');
      await signOut();
      onUserMismatch?.();
    }
  }, [user, signOut, onUserMismatch]);

  // Process queued messages when tenant becomes available
  useEffect(() => {
    if (tenantId && messageQueueRef.current.length > 0) {
      console.log('[useIframeAuth] Tenant ready, processing queued messages:', messageQueueRef.current.length);
      const messages = [...messageQueueRef.current];
      messageQueueRef.current = [];
      
      messages.forEach(async (message) => {
        if (message.type === 'OIDC_TOKEN' && message.payload) {
          const success = await authenticateWithToken(message.payload);
          if (success) {
            setTokenReceived(true);
          }
        }
      });
    }
  }, [tenantId, authenticateWithToken]);

  // Listen for postMessage events - use refs to avoid recreating listener
  const authenticateWithTokenRef = useRef(authenticateWithToken);
  const checkUserMatchRef = useRef(checkUserMatch);
  const signOutRef = useRef(signOut);
  const userRef = useRef(user);
  const tenantIdRef = useRef(tenantId);

  // Keep refs updated
  useEffect(() => {
    authenticateWithTokenRef.current = authenticateWithToken;
    checkUserMatchRef.current = checkUserMatch;
    signOutRef.current = signOut;
    userRef.current = user;
    tenantIdRef.current = tenantId;
  }, [authenticateWithToken, checkUserMatch, signOut, user, tenantId]);

  // Single stable listener
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Log ALL messages for debugging
      console.log('[useIframeAuth] Raw postMessage received:', {
        type: event.data?.type,
        hasData: !!event.data,
        origin: event.origin,
      });

      const message = event.data as IframeAuthMessage;
      
      if (!message?.type) return;

      console.log('[useIframeAuth] Processing message:', message.type, { 
        hasPayload: !!message.payload,
        hasIdToken: !!message.payload?.id_token,
        hasSub: !!message.payload?.sub,
        tenantId: tenantIdRef.current,
      });

      switch (message.type) {
        case 'OIDC_TOKEN':
          if (!tenantIdRef.current) {
            console.log('[useIframeAuth] Tenant not ready, queuing OIDC_TOKEN message');
            messageQueueRef.current.push(message);
            setTokenReceived(true);
          } else {
            const success = await authenticateWithTokenRef.current(message.payload);
            if (success) {
              setTokenReceived(true);
            }
          }
          break;

        case 'AUTH_LOGOUT':
          console.log('[useIframeAuth] Logout signal received');
          await signOutRef.current();
          break;

        case 'AUTH_USER_CHANGED':
          console.log('[useIframeAuth] User changed signal received');
          if (userRef.current) {
            await checkUserMatchRef.current(message.payload);
          } else if (message.payload) {
            await authenticateWithTokenRef.current(message.payload);
          }
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    console.log('[useIframeAuth] Message listener attached (stable)');
    
    return () => {
      window.removeEventListener('message', handleMessage);
      console.log('[useIframeAuth] Message listener removed');
    };
  }, []); // No dependencies - stable listener

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
