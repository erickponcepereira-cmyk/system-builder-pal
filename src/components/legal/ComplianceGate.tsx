import { useEffect, useState } from "react";
import { FileText, Loader2, MapPin } from "lucide-react";
import { toast } from "sonner";

import { recordTermsAcceptance } from "@/lib/terms-acceptance.functions";
import {
  CURATION_DOC,
  TERMS_PDF_URL,
  TERMS_TITLE,
  TERMS_VERSION,
  type TermType,
} from "@/lib/terms";
import {
  EMPTY_PENDING,
  loadPendingCompliance,
  saveCity,
  UFS,
  type PendingCompliance,
} from "@/lib/compliance-gate";

/**
 * Porta de conformidade: roda em toda área autenticada e só libera o app
 * depois que a pessoa aceita a versão vigente dos termos aplicáveis a ela e
 * informa a cidade.
 *
 * Por que bloqueia em vez de avisar: o aceite precisa ter valor probatório, e
 * um aviso dispensável não prova nada. A cidade é obrigatória porque loja e
 * gratuitos por localização dependem dela — sem cidade, a pessoa não vê o que
 * é dela e abre chamado.
 *
 * O registro vai para `terms_acceptances` com versão, IP e user-agent, um
 * registro por termo. É o que sustenta comprovação futura.
 */
export function ComplianceGate() {
  const [pending, setPending] = useState<PendingCompliance>(EMPTY_PENDING);
  const [accepted, setAccepted] = useState(false);
  const [city, setCity] = useState("");
  const [uf, setUf] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await loadPendingCompliance();
        if (!active) return;
        setPending(data);
        setCity(data.currentCity || "");
        setUf(data.currentState || "");
      } catch (error) {
        console.error("[compliance-gate]", error);
        if (active) setPending({ ...EMPTY_PENDING, loading: false });
      }
    })();
    return () => { active = false; };
  }, []);

  if (pending.loading) return null;

  const needsTerms = pending.pendingTerms.length > 0;
  const needsCity = pending.needsCity;
  if (!needsTerms && !needsCity) return null;

  const canSubmit =
    (!needsTerms || accepted) &&
    (!needsCity || (city.trim().length >= 2 && uf.trim().length === 2)) &&
    !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      if (needsCity && pending.profileId) {
        await saveCity(pending.profileId, city, uf);
      }

      // Um registro por termo: é assim que se prova o que foi aceito e quando.
      for (const termType of pending.pendingTerms) {
        await recordTermsAcceptance({
          data: {
            termType,
            termVersion: TERMS_VERSION[termType],
            context: {
              origin: "compliance_gate",
              curation_doc: CURATION_DOC.url,
              roles: pending.roles,
            },
          },
        });
      }

      toast.success("Tudo certo. Obrigado!");
      setPending({ ...pending, pendingTerms: [], needsCity: false });
    } catch (error) {
      console.error("[compliance-gate] gravar", error);
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-background/95 p-4 backdrop-blur-sm sm:items-center">
      <div className="my-auto w-full max-w-md rounded-2xl border border-border bg-card p-5">
        <h2 className="text-lg font-bold text-foreground">
          {needsTerms
            ? "Atualizamos nossos termos"
            : pending.currentCity ? "Falta o seu estado" : "Falta a sua cidade"}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {needsTerms
            ? "Para continuar, revise e aceite a versão atual. Leva um minuto e vale para o seu perfil."
            : pending.currentCity
              ? "Confirme seu estado para a gente mostrar a loja e os gratuitos disponíveis perto de você."
              : "Precisamos da sua cidade para mostrar a loja e os gratuitos disponíveis perto de você."}
        </p>

        {needsTerms && (
          <div className="mt-4 flex flex-col gap-2">
            {pending.pendingTerms.map((termType) => (
              <TermLink key={termType} termType={termType} />
            ))}
            <a
              href={CURATION_DOC.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2.5 transition-colors hover:bg-accent"
            >
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 text-xs font-medium text-foreground">{CURATION_DOC.title}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">abrir</span>
            </a>
          </div>
        )}

        {needsCity && (
          <div className="mt-4">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <MapPin className="h-3.5 w-3.5 text-primary" /> Onde você mora
            </label>
            <div className="flex gap-2">
              <input
                value={city}
                onChange={(event) => setCity(event.target.value)}
                placeholder="Cidade"
                autoComplete="address-level2"
                className="min-w-0 flex-1 rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
              />
              <select
                value={uf}
                onChange={(event) => setUf(event.target.value)}
                aria-label="Estado"
                className="w-20 shrink-0 rounded-xl border border-border bg-muted px-2 py-2.5 text-sm text-foreground outline-none focus:border-primary"
              >
                <option value="">UF</option>
                {UFS.map((sigla) => (
                  <option key={sigla} value={sigla}>{sigla}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {needsTerms && (
          <label className="mt-4 flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
              className="mt-0.5 shrink-0"
            />
            <span className="text-[11px] leading-relaxed text-muted-foreground">
              Li, compreendi e aceito os documentos acima, e comprometo-me a respeitar a
              Carta de Identidade e Princípios Institucionais da FitMind durante minha
              atuação no ecossistema.
            </span>
          </label>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {saving ? "Salvando..." : "Continuar"}
        </button>

        <p className="mt-3 text-center text-[10px] leading-relaxed text-muted-foreground">
          Registramos data, hora e versão do seu aceite para comprovação futura.
        </p>
      </div>
    </div>
  );
}

function TermLink({ termType }: { termType: Exclude<TermType, "desafio"> }) {
  return (
    <a
      href={TERMS_PDF_URL[termType]}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 rounded-xl border border-border bg-muted px-3 py-2.5 transition-colors hover:bg-accent"
    >
      <FileText className="h-4 w-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1 text-xs font-medium text-foreground">{TERMS_TITLE[termType]}</span>
      <span className="shrink-0 text-[10px] text-muted-foreground">v{TERMS_VERSION[termType]}</span>
    </a>
  );
}

export default ComplianceGate;
