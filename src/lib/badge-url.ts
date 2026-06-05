import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, { url: string; exp: number }>();
const TTL_SEC = 60 * 60 * 6; // 6h

function isAbsolute(v: string) {
  return v.startsWith("http://") || v.startsWith("https://") || v.startsWith("data:");
}

export async function getBadgeUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  if (isAbsolute(path)) return path;
  const now = Math.floor(Date.now() / 1000);
  const cached = cache.get(path);
  if (cached && cached.exp - 60 > now) return cached.url;
  const { data, error } = await supabase.storage
    .from("career-badges")
    .createSignedUrl(path, TTL_SEC);
  if (error || !data?.signedUrl) return null;
  cache.set(path, { url: data.signedUrl, exp: now + TTL_SEC });
  return data.signedUrl;
}

export function useBadgeUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(() => {
    if (!path) return null;
    if (isAbsolute(path)) return path;
    const c = cache.get(path);
    return c ? c.url : null;
  });
  useEffect(() => {
    let active = true;
    if (!path) { setUrl(null); return; }
    if (isAbsolute(path)) { setUrl(path); return; }
    getBadgeUrl(path).then((u) => { if (active) setUrl(u); });
    return () => { active = false; };
  }, [path]);
  return url;
}
