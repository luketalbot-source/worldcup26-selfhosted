// src/lib/auth.ts
const ACCESS_TOKEN_KEY = 'wc26_access_token';
let memoryToken: string | null = null;
const listeners: Array<(user: AppUser | null) => void> = [];

export interface AppUser {
  id: string;    // JWT sub (uuid)
  email: string;
}

function decodePayload(token: string): { sub: string; email: string } | null {
  try {
    const [, payload] = token.split('.');
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

function notifyListeners(user: AppUser | null) {
  listeners.forEach(cb => cb(user));
}

export function getAccessToken(): string | null {
  if (memoryToken) return memoryToken;
  try {
    return sessionStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAccessToken(token: string): void {
  memoryToken = token;
  try { sessionStorage.setItem(ACCESS_TOKEN_KEY, token); } catch {}
  const p = decodePayload(token);
  notifyListeners(p ? { id: p.sub, email: p.email } : null);
}

export function clearAccessToken(): void {
  memoryToken = null;
  try { sessionStorage.removeItem(ACCESS_TOKEN_KEY); } catch {}
  notifyListeners(null);
}

export function getUser(): AppUser | null {
  const token = getAccessToken();
  if (!token) return null;
  const p = decodePayload(token);
  if (!p) return null;
  return { id: p.sub, email: p.email };
}

export function onAuthChange(cb: (user: AppUser | null) => void): () => void {
  listeners.push(cb);
  return () => {
    const idx = listeners.indexOf(cb);
    if (idx > -1) listeners.splice(idx, 1);
  };
}
