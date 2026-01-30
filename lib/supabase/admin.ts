import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const secretKey = process.env.SUPABASE_SECRET_KEY!;
  if (!secretKey) {
    throw new Error(
      "SUPABASE_SECRET_KEY is required for admin operations"
    );
  }
  return createClient(url, secretKey, {
    auth: { persistSession: false },
  });
}
