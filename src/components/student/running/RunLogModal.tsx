import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, ImagePlus, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ModalShell } from "@/components/ui/ModalShell";
import { useImageCrop } from "@/components/ui/ImageCropProvider";
import { todayISOLocal } from "@/lib/date-only";
import { ACTIVITY_TYPES, formatPace, parseDuration } from "@/lib/running";
import type { RunLog } from "@/components/student/running/types";

interface Props {
  profileId: string;
  run: RunLog | null;
  onClose: () => void;
  onSaved: () => void;
}

export function RunLogModal({ profileId, run, onClose, onSaved }: Props) {
  const { cropToBlob } = useImageCrop();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(run?.run_date ?? todayISOLocal());
  const [distance, setDistance] = useState(run ? String(run.distance_km) : "");
  const [duration, setDuration] = useState(
    run ? secondsToInput(run.duration_seconds) : "",
  );
  const [activity, setActivity] = useState(run?.activity_type ?? "corrida_rua");
  const [isRace, setIsRace] = useState(run?.is_race ?? false);
  const [raceName, setRaceName] = useState(run?.race_name ?? "");
  const [location, setLocation] = useState(run?.location ?? "");
  const [notes, setNotes] = useState(run?.notes ?? "");
  const [photoPath, setPhotoPath] = useState<string | null>(run?.photo_url ?? null);
  const [uploading, setUploading] = useState(false);

  const distanceKm = Number(String(distance).replace(",", "."));
  const durationSeconds = parseDuration(duration);

  const paceSeconds = useMemo(() => {
    if (!distanceKm || distanceKm <= 0 || !durationSeconds) return null;
    return Math.round(durationSeconds / distanceKm);
  }, [distanceKm, durationSeconds]);

  useEffect(() => {
    if (!isRace) setRaceName("");
  }, [isRace]);

  const uploadPhoto = async (file: File) => {
    if (!file.type.startsWith("image/")) return toast.error("Envie uma imagem.");
    const cropped = await cropToBlob(file, { title: "Ajustar comprovante" });
    if (!cropped) return;
    setUploading(true);
    const { data: userData } = await supabase.auth.getUser();
    const ext = cropped.type === "image/png" ? "png" : "jpg";
    const path = `${userData.user?.id}/runs/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("evolution-photos")
      .upload(path, cropped, { contentType: cropped.type });
    setUploading(false);
    if (error) return toast.error(error.message);
    setPhotoPath(path);
    toast.success("Comprovante anexado");
  };

  const save = async () => {
    if (!date) return toast.error("Informe a data da corrida.");
    if (!distanceKm || distanceKm <= 0) return toast.error("Informe a distância em km.");
    if (!durationSeconds || durationSeconds <= 0) return toast.error("Informe o tempo total (ex: 52:30).");
    if (isRace && !raceName.trim()) return toast.error("Informe o nome da prova.");

    setSaving(true);
    const payload = {
      profile_id: profileId,
      run_date: date,
      distance_km: distanceKm,
      duration_seconds: durationSeconds,
      pace_seconds: paceSeconds ?? Math.round(durationSeconds / distanceKm),
      activity_type: activity,
      is_race: isRace,
      race_name: isRace ? raceName.trim() : null,
      location: location.trim() || null,
      notes: notes.trim() || null,
      photo_url: photoPath,
      source: run?.source ?? "manual",
    };

    const { error } = run
      ? await supabase.from("run_logs").update(payload as never).eq("id", run.id)
      : await supabase.from("run_logs").insert(payload as never);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(run ? "Corrida atualizada" : "Corrida registrada!");
    onSaved();
  };

  return (
    <ModalShell
      header={
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-foreground">
              {run ? "Editar corrida" : "Registrar corrida"}
            </h3>
            <p className="text-[11px] text-muted-foreground">O pace é calculado automaticamente.</p>
          </div>
          <button onClick={onClose} className="rounded-full bg-white/10 p-2 text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      }
      footer={
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-xl bg-white/5 py-3 text-sm font-semibold text-muted-foreground">
            Cancelar
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground">Data</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="field-control w-full" />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground">Distância (km)</span>
            <input
              inputMode="decimal"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
              placeholder="10,5"
              className="field-control w-full"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground">Tempo total</span>
            <input
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="52:30 ou 1:12:30"
              className="field-control w-full"
            />
          </label>
          <div className="space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground">Pace</span>
            <div className="flex h-[42px] items-center rounded-xl border border-border bg-muted px-3 text-sm font-bold text-foreground">
              {paceSeconds ? `${formatPace(paceSeconds)} /km` : "—"}
            </div>
          </div>
        </div>

        <label className="block space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground">Tipo de atividade</span>
          <select value={activity} onChange={(e) => setActivity(e.target.value)} className="field-control w-full">
            {ACTIVITY_TYPES.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setIsRace(false)}
            className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${!isRace ? "bg-primary text-primary-foreground" : "bg-white/5 text-muted-foreground"}`}
          >
            Treino
          </button>
          <button
            type="button"
            onClick={() => setIsRace(true)}
            className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${isRace ? "bg-primary text-primary-foreground" : "bg-white/5 text-muted-foreground"}`}
          >
            Prova / evento
          </button>
        </div>

        {isRace && (
          <label className="block space-y-1">
            <span className="text-[11px] font-semibold text-muted-foreground">Nome da prova</span>
            <input value={raceName} onChange={(e) => setRaceName(e.target.value)} className="field-control w-full" placeholder="Meia Maratona de Cuiabá" />
          </label>
        )}

        <label className="block space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground">Cidade / local</span>
          <input value={location} onChange={(e) => setLocation(e.target.value)} className="field-control w-full" placeholder="Cuiabá/MT" />
        </label>

        <label className="block space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground">Observações</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="field-control w-full" placeholder="Como foi o treino?" />
        </label>

        <div className="space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground">Foto / comprovante (opcional)</span>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-white/5 py-3 text-sm font-semibold text-muted-foreground disabled:opacity-60"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
            {photoPath ? "Trocar imagem" : "Anexar imagem"}
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

function secondsToInput(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
