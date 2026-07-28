import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Server-only Supabase client, created lazily so a missing env var surfaces as
// a clear runtime error on first query rather than crashing at import/build
// time. Uses the service_role key: all access is server-side (server actions +
// the /api/agent route), so RLS stays locked down with no public policies.
let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. Add them to .env.local and restart.",
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
