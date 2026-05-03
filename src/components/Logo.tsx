import { useTheme } from "@/components/theme-provider";
import logoDark from "@/assets/fitmind-logo-dark.jpeg";
import logoWhite from "@/assets/fitmind-logo-white.jpeg";

type LogoProps = {
  className?: string;
  alt?: string;
  /** Force a variant regardless of theme */
  variant?: "auto" | "dark" | "white";
};

/**
 * FitMind logo that swaps based on theme.
 * - Dark theme: white logo (visible on dark background)
 * - Light theme: dark logo (visible on light background)
 */
export function Logo({ className = "h-10 w-auto object-contain", alt = "FitMind", variant = "auto" }: LogoProps) {
  const { theme } = useTheme();
  const src =
    variant === "white" ? logoWhite : variant === "dark" ? logoDark : theme === "dark" ? logoWhite : logoDark;
  return <img src={src} alt={alt} className={className} />;
}
