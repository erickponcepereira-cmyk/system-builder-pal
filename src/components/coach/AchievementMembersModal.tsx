import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { X, Loader2, Users, Trophy } from "lucide-react";
import {
  getAchievementMembers,
  type AchievementKind,
  type AchievementMember,
} from "@/lib/coach-achievement-members.functions";

export type AchievementModalProps = {
  open: boolean;
  onClose: () => void;
  kind: AchievementKind;
  achievementKey: string;
  title: string;
  subtitle?: string;
  accentColor?: string;
};

export function AchievementMembersModal({
  open,
  onClose,
  kind,
  achievementKey,
  title,
  subtitle,
  accentColor = "#FF4230",
}: AchievementModalProps) {
  const fetchMembers = useServerFn(getAchievementMembers);
  const [members, setMembers] = useState<AchievementMember[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setMembers(null);
    fetchMembers({ data: { kind, key: achievementKey } })
      .then((r) => { if (active) setMembers(r); })
      .catch(() => { if (active) setMembers([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kind, achievementKey]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/70 p-3 sm:p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl p-5 my-4 max-h-[90vh] flex flex-col"
        style={{ backgroundColor: "#1A1A1A", border: `1px solid ${accentColor}33` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0"
              style={{ backgroundColor: `${accentColor}25`, border: `1px solid ${accentColor}55` }}
            >
              <Trophy className="h-5 w-5" style={{ color: accentColor }} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-white truncate">{title}</h3>
              {subtitle && <p className="text-[11px] text-white/50 truncate">{subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white flex-shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {loading && (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-white/40" />
            </div>
          )}
          {!loading && members && members.length === 0 && (
            <div className="text-center py-8">
              <Users className="h-8 w-8 text-white/10 mx-auto mb-2" />
              <p className="text-xs text-white/40">Ninguém nesta conquista ainda.</p>
            </div>
          )}
          {!loading && members && members.length > 0 && (
            <>
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-2 px-1">
                {members.length} {members.length === 1 ? "coach" : "coaches"}
              </p>
              <ul className="space-y-1.5">
                {members.map((m) => (
                  <li
                    key={m.coachId}
                    className="rounded-lg px-3 py-2.5 flex items-center justify-between gap-3"
                    style={{
                      backgroundColor: m.isMe ? `${accentColor}15` : "#0F0F0F",
                      border: m.isMe ? `1px solid ${accentColor}55` : "1px solid transparent",
                    }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate flex items-center gap-2">
                        {m.name}
                        {m.isMe && (
                          <span
                            className="text-[9px] font-bold rounded-full px-2 py-0.5"
                            style={{ backgroundColor: `${accentColor}30`, color: accentColor }}
                          >
                            VOCÊ
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-white/40 truncate">
                        Patrocinador: {m.sponsorName || "—"}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default AchievementMembersModal;
