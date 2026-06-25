import splashLogo from "@/assets/fitmind-splash.png.asset.json";
import iconLogo from "@/assets/fitmind-icon.png.asset.json";

type LogoProps = {
  className?: string;
  alt?: string;
  style?: React.CSSProperties;
  variant?: "full" | "icon" | "auto" | "dark" | "white";
};

export function Logo({
  className = "h-10 w-auto object-contain",
  alt = "FitMind Club",
  style,
  variant = "full",
}: LogoProps) {
  const src = variant === "icon" ? iconLogo.url : splashLogo.url;
  return <img src={src} alt={alt} className={className} style={style} draggable={false} />;
}
