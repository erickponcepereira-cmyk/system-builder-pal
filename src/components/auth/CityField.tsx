import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UFS } from "@/lib/compliance-gate";

/**
 * Cidade e UF no cadastro.
 *
 * Obrigatório porque a loja e os gratuitos passam a filtrar por localização —
 * sem cidade a pessoa não enxerga o que é dela e abre chamado. Vai para
 * `profiles.city` / `profiles.state`, que já existiam e nunca eram preenchidas
 * nos cadastros de aluno e profissional.
 */
export function CityField({
  city,
  uf,
  onCity,
  onUf,
  dark = true,
}: {
  city: string;
  uf: string;
  onCity: (v: string) => void;
  onUf: (v: string) => void;
  /** Formulários de cadastro rodam sobre fundo escuro fixo. */
  dark?: boolean;
}) {
  const inputClass = dark ? "bg-white/5 border-white/10 text-white placeholder:text-white/30" : "";
  const labelClass = dark ? "text-white/70" : "";
  const selectClass = dark
    ? "flex h-10 w-full rounded-md border border-white/10 bg-white/5 px-2 text-sm text-white"
    : "flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_5rem] gap-2">
      <div className="space-y-1.5">
        <Label className={labelClass} htmlFor="reg-city">Cidade *</Label>
        <Input
          id="reg-city"
          value={city}
          autoComplete="address-level2"
          onChange={(e) => onCity(e.target.value)}
          placeholder="Sua cidade"
          className={inputClass}
        />
      </div>
      <div className="space-y-1.5">
        <Label className={labelClass} htmlFor="reg-uf">UF *</Label>
        <select id="reg-uf" value={uf} onChange={(e) => onUf(e.target.value)} className={selectClass}>
          <option value="">--</option>
          {UFS.map((sigla) => <option key={sigla} value={sigla}>{sigla}</option>)}
        </select>
      </div>
    </div>
  );
}

/** Validação única, para os quatro cadastros darem a mesma mensagem. */
export function validateCity(city: string, uf: string): string | null {
  if (city.trim().length < 2) return "Informe a cidade onde você mora.";
  if (uf.length !== 2) return "Selecione o estado (UF).";
  return null;
}

export default CityField;
