// Global message bridge that persists across component mounts
// This ensures we never miss postMessage events due to React re-renders

type IframeAuthMessage = {
  type: 'OIDC_TOKEN' | 'AUTH_LOGOUT' | 'AUTH_USER_CHANGED';
  payload?: {
    id_token?: string;
    sub?: string;
    email?: string;
    name?: string;
  };
};

type MessageHandler = (message: IframeAuthMessage) => void;

class IframeMessageBridge {
  private handlers: Set<MessageHandler> = new Set();
  private messageQueue: IframeAuthMessage[] = [];
  private isListening = false;

  constructor() {
    this.startListening();
  }

  private startListening() {
    if (this.isListening || typeof window === 'undefined') return;
    
    window.addEventListener('message', this.handleMessage);
    this.isListening = true;
    console.log('[IframeMessageBridge] Global listener started');
  }

  private handleMessage = (event: MessageEvent) => {
    // Log ALL incoming messages for debugging
    console.log('[IframeMessageBridge] Raw message received:', {
      type: event.data?.type,
      hasData: !!event.data,
      origin: event.origin,
    });

    const message = event.data as IframeAuthMessage;
    if (!message?.type) return;

    // Only process our known message types
    if (!['OIDC_TOKEN', 'AUTH_LOGOUT', 'AUTH_USER_CHANGED'].includes(message.type)) {
      return;
    }

    console.log('[IframeMessageBridge] Auth message received:', message.type);

    if (this.handlers.size > 0) {
      // Dispatch to all registered handlers
      this.handlers.forEach(handler => {
        try {
          handler(message);
        } catch (err) {
          console.error('[IframeMessageBridge] Handler error:', err);
        }
      });
    } else {
      // No handlers registered, queue the message
      console.log('[IframeMessageBridge] No handlers, queuing message:', message.type);
      this.messageQueue.push(message);
    }
  };

  subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    console.log('[IframeMessageBridge] Handler subscribed, total:', this.handlers.size);

    // Process any queued messages
    if (this.messageQueue.length > 0) {
      console.log('[IframeMessageBridge] Processing queued messages:', this.messageQueue.length);
      const queue = [...this.messageQueue];
      this.messageQueue = [];
      queue.forEach(msg => {
        try {
          handler(msg);
        } catch (err) {
          console.error('[IframeMessageBridge] Queued handler error:', err);
        }
      });
    }

    // Return unsubscribe function
    return () => {
      this.handlers.delete(handler);
      console.log('[IframeMessageBridge] Handler unsubscribed, remaining:', this.handlers.size);
    };
  }

  // For debugging
  getQueueLength(): number {
    return this.messageQueue.length;
  }
}

// Singleton instance
export const iframeMessageBridge = new IframeMessageBridge();
