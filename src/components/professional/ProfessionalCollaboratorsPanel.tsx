import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { AlertTriangle, Copy, Loader2, Plus, Share2, Trash2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { getShareOrigin } from "@/lib/auth-redirects";
import {
  attachProfessionalCollaborator,

  detachProfessionalCollaborator,
  listEligibleStudents,
  listProfessionalCollaborators,
  type CollaboratorRow,
} from "@/lib/professional-collaborators.functions";

const MAX_COLLABS = 7;

type Props = {
  referralCode: string | null;
  professionalName: string;
};

export function ProfessionalCollaboratorsPanel({ referralCode, professionalName }: Props) {
  const [collabs, setCollabs] = useState<CollaboratorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);

  const link = referralCode ? `${getShareOrigin()}/r/${referralCode}` : "";
  const reached = collabs.length >= MAX_COLLABS;

  const reload = async () => {
    setLoading(true);
    try {
      const data = await listProfessionalCollaborators();
      setCollabs(data);
    } catch (e) {
      console.error(e);
      toast.error("Falha ao carregar colaboradores");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  const copy = () => {
    if (!link) return;
    navigator.clipboard.writeText(link);
    toast.success("Link copiado!");
  };

  const share = async () => {
    if (!link) return;
    const text = `Você foi convidado(a) para ser colaborador(a) de ${professionalName} no FitMind Club. Crie sua conta:`;
    if (navigator.share) {
      try {
        await navigator.share({ title: professionalName, text, url: link });
      } catch {
        /* ignore */
      }
    } else {
      copy();
    }
  };

  const remove = async (studentId: string) => {
    if (!confirm("Remover este colaborador?")) return;
    try {
      await detachProfessionalCollaborator({ data: { studentId } });
      toast.success("Colaborador removido");
      await reload();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro ao remover");
    }
  };

  if (!referralCode) {
    return (
      <div className="rounded-xl p-6 text-center" style={{ backgroundColor: "#1A1A1A" }}>
        <AlertTriangle className="h-8 w-8 text-yellow-400 mx-auto mb-2" />
        <p className="text-sm text-white/70">
          Código de indicação ainda não gerado. Atualize a página em instantes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl p-5 text-center" style={{ backgroundColor: "#1A1A1A" }}>
        <Users className="h-7 w-7 text-primary mx-auto mb-2" />
        <h2 className="text-base font-bold text-white">Convidar colaboradores</h2>
        <p className="mt-1 text-xs text-white/50">
          Compartilhe este link ou vincule um aluno que já é seu. Colaboradores mantêm{" "}
          <b className="text-white/80">acesso ao painel do aluno</b>, recebem{" "}
          <b className="text-white/80">produtos gratuitos</b> e{" "}
          <b className="text-white/80">desafios</b> enquanto você estiver ativo.
        </p>
        <p className="mt-2 text-[11px] text-white/60">
          Limite:{" "}
          <b className={reached ? "text-red-400" : "text-primary"}>
            {collabs.length} / {MAX_COLLABS}
          </b>{" "}
          colaboradores
        </p>

        {!reached ? (
          <>
            <div className="mt-4 inline-block bg-white p-3 rounded-xl">
              <QRCodeSVG value={link} size={180} />
            </div>

            <div className="mt-3 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-[11px] text-white/70 break-all">
              {link}
            </div>
            <p className="mt-2 text-[10px] text-white/40">
              Código: <span className="font-mono text-white/70">{referralCode}</span>
            </p>

            <div className="mt-4 flex gap-2">
              <button
                onClick={copy}
                className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-white/10 py-2 text-xs font-bold text-white hover:bg-white/20"
              >
                <Copy className="h-3.5 w-3.5" /> Copiar link
              </button>
              <button
                onClick={share}
                className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-primary py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90"
              >
                <Share2 className="h-3.5 w-3.5" /> Compartilhar
              </button>
            </div>

            <button
              onClick={() => setPickerOpen(true)}
              className="mt-3 w-full flex items-center justify-center gap-1 rounded-lg border border-primary/40 bg-primary/10 py-2 text-xs font-bold text-primary hover:bg-primary/20"
            >
              <Plus className="h-3.5 w-3.5" /> Vincular aluno existente
            </button>
          </>
        ) : (
          <div className="mt-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 p-3 text-xs text-yellow-200">
            Limite de {MAX_COLLABS} colaboradores atingido. Remova alguém para liberar novas vagas.
          </div>
        )}
      </div>

      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-white">Meus colaboradores</h3>
          <span className="text-[11px] text-white/50">
            {collabs.length} / {MAX_COLLABS}
          </span>
        </div>
        {loading ? (
          <p className="text-xs text-white/40">Carregando...</p>
        ) : collabs.length === 0 ? (
          <p className="text-xs text-white/40 text-center py-6">
            Nenhum colaborador vinculado ainda. Compartilhe o link acima ou vincule um aluno seu.
          </p>
        ) : (
          <div className="space-y-2">
            {collabs.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 rounded-lg bg-black/30 px-3 py-2"
              >
                {c.profile?.photo_url ? (
                  <img
                    src={c.profile.photo_url}
                    className="h-9 w-9 rounded-full object-cover"
                    alt={c.profile?.name || ""}
                  />
                ) : (
                  <div className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center text-xs text-white/60">
                    {c.profile?.name?.[0]?.toUpperCase() || "?"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {c.profile?.name || "—"}
                  </p>
                  <p className="text-[10px] text-white/40 truncate">
                    {c.profile?.email || c.profile?.phone || ""}
                  </p>
                  <p className="text-[10px] text-primary/80 truncate font-semibold">
                    Colaborador · {professionalName}
                  </p>
                </div>
                <button
                  onClick={() => remove(c.id)}
                  className="rounded-lg p-2 text-red-400 hover:bg-red-500/10"
                  title="Remover"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {pickerOpen && (
        <EligibleStudentsPicker
          onClose={() => setPickerOpen(false)}
          onAttached={async () => {
            setPickerOpen(false);
            await reload();
          }}
        />
      )}
    </div>
  );
}

function EligibleStudentsPicker({
  onClose,
  onAttached,
}: {
  onClose: () => void;
  onAttached: () => void;
}) {
  const [rows, setRows] = useState<CollaboratorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await listEligibleStudents();
        setRows(data);
      } catch (e) {
        console.error(e);
        toast.error("Falha ao carregar alunos");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (r.profile?.name || "").toLowerCase().includes(q) ||
      (r.profile?.email || "").toLowerCase().includes(q) ||
      (r.profile?.phone || "").toLowerCase().includes(q)
    );
  });

  const attach = async (studentId: string) => {
    setBusyId(studentId);
    try {
      await attachProfessionalCollaborator({ data: { studentId } });
      toast.success("Colaborador vinculado");
      onAttached();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Erro ao vincular");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/70 p-2 sm:p-4 overflow-y-auto overscroll-contain modal-safe items-start sm:items-center">
      <div
        className="w-full max-w-lg rounded-2xl border border-white/10 max-h-[90vh] flex flex-col"
        style={{ backgroundColor: "#111" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div>
            <h3 className="text-base font-bold text-white">Vincular aluno</h3>
            <p className="text-[11px] text-white/50">
              Alunos que já têm você como coach direto.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-white/60 hover:bg-white/5"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-3 border-b border-white/5">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, e-mail ou telefone..."
            className="w-full rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none focus:border-primary/50"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <div className="py-8 text-center">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-xs text-white/40 text-center py-6">
              {rows.length === 0
                ? "Você ainda não tem alunos disponíveis para vincular."
                : "Nenhum aluno encontrado com esse filtro."}
            </p>
          ) : (
            filtered.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 rounded-lg bg-black/30 px-3 py-2"
              >
                {r.profile?.photo_url ? (
                  <img
                    src={r.profile.photo_url}
                    className="h-9 w-9 rounded-full object-cover"
                    alt=""
                  />
                ) : (
                  <div className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center text-xs text-white/60">
                    {r.profile?.name?.[0]?.toUpperCase() || "?"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {r.profile?.name || "—"}
                  </p>
                  <p className="text-[10px] text-white/40 truncate">
                    {r.profile?.email || r.profile?.phone || ""}
                  </p>
                </div>
                <button
                  onClick={() => attach(r.id)}
                  disabled={busyId === r.id}
                  className="rounded-lg bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {busyId === r.id ? "..." : "Vincular"}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
