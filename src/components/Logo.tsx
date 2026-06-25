import splashLogo from "@/assets/fitmind-splash.png.asset.json";
import iconLogo from "@/assets/fitmind-icon.png.asset.json";

type LogoProps = {
  className?: string;
  alt?: string;
  /**
   * - "full" (default): logo principal FitMind Secrets (corredora + "mind")
   * - "icon": apenas o ícone FM (corredora + M) — para avatares, headers compactos, etc.
   * - mantemos "auto" | "dark" | "white" como aliases para compatibilidade
   */
  variant?: "full" | "icon" | "auto" | "dark" | "white";
};

/**
 * Logo oficial FitMind Club.
 * Sempre branca (sobre fundo escuro). Independente de tema.
 */
export function Logo({
  className = "h-10 w-auto object-contain",
  alt = "FitMind Club",
  variant = "full",
}: LogoProps) {
  const src = variant === "icon" ? iconLogo.url : splashLogo.url;
  return <img src={src} alt={alt} className={className} draggable={false} />;
}
