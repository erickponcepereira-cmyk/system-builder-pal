import { Award, Crown, Star, Trophy, Gem, Shield, Medal } from "lucide-react";
import { cn } from "@/lib/utils";

export type PatentLevel =
  | "coach"
  | "senior_coach"
  | "manager"
  | "senior_manager"
  | "director"
  | "senior_director"
  | "master_director";

const PATENT_CONFIG: Record<
  PatentLevel,
  { name: string; icon: typeof Award; color: string; bg: string; border: string }
> = {
  coach: { name: "Coach", icon: Award, color: "#9CA3AF", bg: "rgba(156,163,175,0.15)", border: "rgba(156,163,175,0.4)" },
  senior_coach: { name: "Senior Coach", icon: Medal, color: "#10B981", bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.4)" },
  manager: { name: "Manager", icon: Shield, color: "#3B82F6", bg: "rgba(59,130,246,0.15)", border: "rgba(59,130,246,0.4)" },
  senior_manager: { name: "Senior Manager", icon: Star, color: "#8B5CF6", bg: "rgba(139,92,246,0.15)", border: "rgba(139,92,246,0.4)" },
  director: { name: "Director", icon: Trophy, color: "#F59E0B", bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.4)" },
  senior_director: { name: "Senior Director", icon: Gem, color: "#EC4899", bg: "rgba(236,72,153,0.15)", border: "rgba(236,72,153,0.4)" },
  master_director: { name: "Master Director", icon: Crown, color: "#EAB308", bg: "rgba(234,179,8,0.2)", border: "rgba(234,179,8,0.5)" },
};

interface PatentBadgeProps {
  patent: PatentLevel;
  size?: "sm" | "md" | "lg";
  showName?: boolean;
}

export function PatentBadge({ patent, size = "md", showName = true }: PatentBadgeProps) {
  const config = PATENT_CONFIG[patent];
  const Icon = config.icon;

  const sizes = {
    sm: { box: "h-7 w-7", icon: "h-3.5 w-3.5", text: "text-[10px]" },
    md: { box: "h-10 w-10", icon: "h-5 w-5", text: "text-xs" },
    lg: { box: "h-14 w-14", icon: "h-7 w-7", text: "text-sm" },
  };
  const s = sizes[size];

  return (
    <div className="inline-flex items-center gap-2">
      <div
        className={cn("flex items-center justify-center rounded-xl border", s.box)}
        style={{ backgroundColor: config.bg, borderColor: config.border }}
      >
        <Icon className={s.icon} style={{ color: config.color }} />
      </div>
      {showName && (
        <span className={cn("font-bold", s.text)} style={{ color: config.color }}>
          {config.name}
        </span>
      )}
    </div>
  );
}

export const PATENT_LEVELS: PatentLevel[] = [
  "coach",
  "senior_coach",
  "manager",
  "senior_manager",
  "director",
  "senior_director",
  "master_director",
];

export function getPatentConfig(patent: PatentLevel) {
  return PATENT_CONFIG[patent];
}
