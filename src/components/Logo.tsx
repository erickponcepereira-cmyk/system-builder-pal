import { useBranding } from "@/components/theme-provider";

type LogoProps = {
  className?: string;
  alt?: string;
  style?: React.CSSProperties;
  variant?: "full" | "icon" | "auto" | "dark" | "white";
};

export function Logo({
  className = "h-10 w-auto object-contain",
  alt,
  style,
  variant = "full",
}: LogoProps) {
  const { theme } = useBranding();
  const src = variant === "icon" ? theme.logoIcon : theme.logoFull;
  return (
    <img
      src={src}
      alt={alt ?? theme.name}
      className={className}
      style={style}
      draggable={false}
    />
  );
}
