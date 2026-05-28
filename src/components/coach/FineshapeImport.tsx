import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Upload, FileSpreadsheet, Loader2 } from "lucide-react";

// --- CSV parser (delimiter ;, supports quoted fields) ---
function parseCSV(text: string): string[][] {
  // Remove BOM
  text = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ";") { row.push(field); field = ""; }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else field += c;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

const num = (v: string | undefined): number | null => {
  if (!v) return null;
  const s = v.trim().replace(/\./g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const mapGender = (g: string): "male" | "female" | "other" => {
  const v = (g || "").toLowerCase();
  if (v.startsWith("masc")) return "male";
  if (v.startsWith("fem")) return "female";
  return "other";
};

const mapMethod = (m: string): string => {
  const v = (m || "").toLowerCase();
  if (v.includes("bio")) return "bioimpedance";
  if (v.includes("dobra")) return "skinfold";
  if (v.includes("medida")) return "measurements";
  return "bioimpedance";
};

// parse dd/mm/yyyy HH:mm -> ISO
const parseDateBR = (s: string): string | null => {
  if (!s) return null;
  const m = s.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}))?$/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh = "00", mi = "00"] = m;
  return new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:00`).toISOString();
};

interface Props { coachId: string; onDone: () => void; }

export default function FineshapeImport({ coachId, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const [clientsFile, setClientsFile] = useState<File | null>(null);
  const [assessmentsFile, setAssessmentsFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const addLog = (s: string) => setLog((l) => [...l, s]);

  const runImport = async () => {
    if (!coachId) { toast.error("Coach não identificado"); return; }
    if (!clientsFile && !assessmentsFile) { toast.error("Selecione ao menos um arquivo"); return; }
    setBusy(true);
    setLog([]);
    try {
      // load existing clients of this coach to dedupe by normalized name
      // Paginate to bypass Supabase's default 1000-row limit (support unlimited clients)
      const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
      const byName = new Map<string, string>();
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data: page, error: pageErr } = await supabase
          .from("coach_evaluation_clients" as never)
          .select("id,name" as never)
          .eq("coach_id" as never, coachId as never)
          .range(from, from + PAGE - 1);
        if (pageErr) { addLog(`Erro ao carregar existentes: ${pageErr.message}`); break; }
        const rowsPage = (page as any[]) || [];
        rowsPage.forEach((c) => byName.set(norm(c.name), c.id));
        if (rowsPage.length < PAGE) break;
        from += PAGE;
      }
      addLog(`Clientes existentes carregados: ${byName.size}`);

      // --- Clients ---
      if (clientsFile) {
        const text = await clientsFile.text();
        const rows = parseCSV(text);
        const header = rows.shift() || [];
        const idx = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
        const iNome = idx("Nome"), iGen = idx("Gênero"), iAlt = idx("Altura"), iUni = idx("Medidas"),
          iNasc = idx("Dta Nasc."), iIdi = idx("Idioma"), iTel = idx("Telefone"), iEmail = idx("Email"),
          iGrp = idx("Grupos"), iNot = idx("Anotacoes");
        addLog(`Importando ${rows.length} clientes...`);
        const toInsert: any[] = [];
        for (const r of rows) {
          const name = (r[iNome] || "").trim();
          if (!name) continue;
          if (byName.has(norm(name))) continue;
          toInsert.push({
            coach_id: coachId,
            name: name.slice(0, 120),
            gender: mapGender(r[iGen] || ""),
            height: num(r[iAlt]),
            height_unit: (r[iUni] || "cm").includes("cm") ? "cm" : (r[iUni] || "cm"),
            birth_date: (r[iNasc] || "").trim() || null,
            language: (r[iIdi] || "pt").trim() || "pt",
            whatsapp: (r[iTel] || "").trim().slice(0, 24) || null,
            email: (r[iEmail] || "").trim().slice(0, 255) || null,
            notes: (r[iNot] || "").slice(0, 1000) || null,
            groups: (() => {
              const g = (r[iGrp] || "").trim();
              const list = g ? [g] : [];
              if (!list.includes("Importados Fineshape")) list.push("Importados Fineshape");
              return list;
            })(),
          });
        }
        // chunk insert
        const chunkSize = 200;
        let created = 0;
        for (let i = 0; i < toInsert.length; i += chunkSize) {
          const chunk = toInsert.slice(i, i + chunkSize);
          const { data, error } = await supabase
            .from("coach_evaluation_clients" as never)
            .insert(chunk as never)
            .select("id,name" as never);
          if (error) { addLog(`Erro lote ${i}: ${error.message}`); continue; }
          ((data as any[]) || []).forEach((c) => { byName.set(norm(c.name), c.id); created++; });
        }
        addLog(`Clientes criados: ${created} (duplicados ignorados: ${rows.length - created})`);
      }

      // --- Assessments ---
      if (assessmentsFile) {
        const text = await assessmentsFile.text();
        const rows = parseCSV(text);
        const header = rows.shift() || [];
        const idx = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
        const I = {
          nome: idx("Nome"), gen: idx("Gênero"), idade: idx("Idade"), alt: idx("Altura"),
          dta: idx("Dta Aval."), met: idx("Método"), peso: idx("Peso"),
          musc: idx("Músculo Esquel."), mm: idx("Massa Muscular"), gord: idx("%Gordura Bio"),
          tmb: idx("TMB"), imc: idx("IMC"), vis: idx("Gor. Visceral"), bAge: idx("Idade Corporal"),
          agua: idx("Água"), oss: idx("Massa Óssea"),
          pas: idx("PAS"), pad: idx("PAD"), fc: idx("Freq. Cardíaca"), glic: idx("Glicemia"),
        };
        addLog(`Processando ${rows.length} avaliações...`);

        // Pre-create missing clients seen here
        const missing: any[] = [];
        const seenMissing = new Set<string>();
        for (const r of rows) {
          const name = (r[I.nome] || "").trim();
          if (!name || byName.has(norm(name)) || seenMissing.has(norm(name))) continue;
          seenMissing.add(norm(name));
          missing.push({
            coach_id: coachId,
            name: name.slice(0, 120),
            gender: mapGender(r[I.gen] || ""),
            height: num(r[I.alt]),
            height_unit: "cm",
            language: "pt",
            groups: ["Importados Fineshape"],
          });
        }
        if (missing.length) {
          const { data } = await supabase
            .from("coach_evaluation_clients" as never)
            .insert(missing as never)
            .select("id,name" as never);
          ((data as any[]) || []).forEach((c) => byName.set(norm(c.name), c.id));
          addLog(`Clientes criados a partir das avaliações: ${missing.length}`);
        }

        const toInsert: any[] = [];
        const touchedClientIds = new Set<string>();
        let skipped = 0;
        for (const r of rows) {
          const name = (r[I.nome] || "").trim();
          const cid = byName.get(norm(name));
          if (!cid) { skipped++; continue; }
          touchedClientIds.add(cid);
          const date = parseDateBR(r[I.dta] || "") || new Date().toISOString();
          toInsert.push({
            client_id: cid,
            coach_id: coachId,
            assessment_date: date,
            method: mapMethod(r[I.met] || ""),
            age: num(r[I.idade]),
            height: num(r[I.alt]),
            weight: num(r[I.peso]),
            bmi: num(r[I.imc]),
            body_fat: num(r[I.gord]),
            skeletal_muscle: num(r[I.musc]),
            muscle_mass: num(r[I.mm]),
            visceral_fat: num(r[I.vis]),
            basal_metabolism: num(r[I.tmb]),
            body_age: num(r[I.bAge]),
            body_water: num(r[I.agua]),
            bone_mass: num(r[I.oss]),
            systolic_bp: num(r[I.pas]),
            diastolic_bp: num(r[I.pad]),
            heart_rate: num(r[I.fc]),
            blood_glucose: num(r[I.glic]),
            segment_analysis: {},
            photos: {},
            professional_notes: "Importado do Fineshape",
          });
        }

        // Garante que TODOS os clientes que receberam avaliações tenham a tag "Importados Fineshape"
        if (touchedClientIds.size > 0) {
          const { data: existingForTag } = await supabase
            .from("coach_evaluation_clients" as never)
            .select("id,groups" as never)
            .in("id" as never, Array.from(touchedClientIds) as never);
          for (const row of ((existingForTag as any[]) || [])) {
            const groups: string[] = Array.isArray(row.groups) ? row.groups : [];
            if (!groups.includes("Importados Fineshape")) {
              await supabase
                .from("coach_evaluation_clients" as never)
                .update({ groups: [...groups, "Importados Fineshape"] } as never)
                .eq("id" as never, row.id as never);
            }
          }
        }

        const chunkSize = 200;
        let created = 0;
        for (let i = 0; i < toInsert.length; i += chunkSize) {
          const chunk = toInsert.slice(i, i + chunkSize);
          const { error } = await supabase.from("coach_body_assessments" as never).insert(chunk as never);
          if (error) { addLog(`Erro lote ${i}: ${error.message}`); continue; }
          created += chunk.length;
        }
        addLog(`Avaliações importadas: ${created} (ignoradas: ${skipped})`);
      }

      toast.success("Importação concluída");
      onDone();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erro na importação");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 border-orange-500/40 text-orange-300 hover:bg-orange-500/10">
          <Upload className="w-4 h-4" /> Importar Fineshape
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg bg-zinc-950 border-white/10 text-white">
        <DialogHeader>
          <DialogTitle className="text-white">Importar dados do Fineshape</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="text-white/60">
            Envie os arquivos CSV exportados pelo Fineshape. Os clientes existentes (mesmo nome) não serão duplicados.
          </p>

          <div className="space-y-2">
            <label className="block text-white/80 font-medium">clientes.csv (lista de alunos)</label>
            <input type="file" accept=".csv,text/csv" onChange={(e) => setClientsFile(e.target.files?.[0] || null)}
              className="block w-full text-xs text-white/70 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-orange-500/20 file:text-orange-200" />
            {clientsFile && <div className="flex items-center gap-2 text-xs text-white/60"><FileSpreadsheet className="w-3 h-3" />{clientsFile.name}</div>}
          </div>

          <div className="space-y-2">
            <label className="block text-white/80 font-medium">avaliacoes.csv (histórico de avaliações)</label>
            <input type="file" accept=".csv,text/csv" onChange={(e) => setAssessmentsFile(e.target.files?.[0] || null)}
              className="block w-full text-xs text-white/70 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-orange-500/20 file:text-orange-200" />
            {assessmentsFile && <div className="flex items-center gap-2 text-xs text-white/60"><FileSpreadsheet className="w-3 h-3" />{assessmentsFile.name}</div>}
          </div>

          {log.length > 0 && (
            <div className="rounded-md bg-black/40 border border-white/10 p-3 max-h-40 overflow-auto text-xs font-mono space-y-1">
              {log.map((l, i) => <div key={i} className="text-white/70">{l}</div>)}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Fechar</Button>
          <Button onClick={runImport} disabled={busy || (!clientsFile && !assessmentsFile)}
            className="bg-orange-500 hover:bg-orange-600 text-white gap-2">
            {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Importando...</> : <><Upload className="w-4 h-4" /> Importar</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
