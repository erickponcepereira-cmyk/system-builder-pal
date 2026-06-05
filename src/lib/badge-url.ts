import { supabase } from "@/integrations/supabase/client";

/** Resolve a career-badges image reference (storage path OR absolute URL) into a public URL. */
export function resolveBadgeUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:")) {
    return value;
  }
  const { data } = supabase.storage.from("career-badges").getPublicUrl(value);
  return data.publicUrl || null;
}
