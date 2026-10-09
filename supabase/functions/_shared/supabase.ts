// supabase/functions/_shared/supabase.ts
import { createClient } from "npm:@supabase/supabase-js@2";

export function getEnv(key: string): string | undefined {
  if (typeof (globalThis as any).Deno !== "undefined" && (globalThis as any).Deno?.env) {
    return (globalThis as any).Deno.env.get(key);
  }
  const proc = (globalThis as any).process;
  if (typeof proc !== "undefined" && proc?.env) {
    return proc.env[key];
  }
  return undefined;
}

/**
 * Initializes and returns an authoritative Supabase admin client
 * using the official Supabase Edge Runtime npm import strategy.
 */
export async function getSupabaseAdminClient(
  envGetter: (key: string) => string | undefined = getEnv
): Promise<any> {
  const supabaseUrl = envGetter("SUPABASE_URL");
  const serviceRoleKey = envGetter("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Initializes and returns a user-scoped Supabase client that forwards the caller's JWT
 * using the standard anonymous / publishable key. Never uses the service-role key.
 */
export async function getSupabaseUserClient(
  authHeader: string,
  envGetter: (key: string) => string | undefined = getEnv
): Promise<any> {
  const supabaseUrl = envGetter("SUPABASE_URL");
  const anonKey =
    envGetter("SUPABASE_ANON_KEY") || envGetter("SUPABASE_PUBLISHABLE_KEY");

  if (!supabaseUrl || !anonKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variable");
  }

  return createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

