import { useBadgeUrl } from "@/lib/badge-url";

interface Props {
  path: string | null | undefined;
  alt: string;
  className?: string;
}

export function BadgeImage({ path, alt, className }: Props) {
  const url = useBadgeUrl(path);
  if (!url) return null;
  return <img src={url} alt={alt} className={className} />;
}
