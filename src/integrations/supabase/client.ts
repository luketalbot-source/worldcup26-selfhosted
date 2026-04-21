// Supabase has been replaced by the custom API client.
// This stub throws at runtime if any missed call site tries to use it.
// Migrate callers to: import { api } from '@/lib/apiClient'

export const supabase = new Proxy({} as Record<string, unknown>, {
  get(_target, prop) {
    throw new Error(
      `supabase.${String(prop)} called — this file is a stub. ` +
      `Migrate the caller to use import { api } from '@/lib/apiClient'.`
    );
  },
});
