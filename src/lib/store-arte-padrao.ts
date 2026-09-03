import {
  Activity, Baby, Biohazard, Bone, Brain, ClipboardList, Dna, Droplet, Droplets,
  Dumbbell, Eye, FlaskConical, HeartPulse, Microscope, Package, Pill, Scan,
  Scissors, ShieldPlus, ShoppingBag, Smile, Stethoscope, Syringe, TestTubes,
  Trophy, Waves, type LucideIcon,
} from "lucide-react";
import { foldText } from "./unified-store";

/**
 * Arte padrão do produto sem foto.
 *
 * O catálogo médico não tem e não vai ter foto: ninguém fotografa uma dosagem
 * de TSH. Antes disso aqui, os 3.785 exames apareciam todos com o mesmo ícone
 * de sacola de compras, o que além de feio apagava a única pista visual que a
 * prateleira poderia dar — que tipo de coisa é aquilo.
 *
 * A escolha é determinística e vem da taxonomia (subcategoria primeiro, que é
 * a mais específica; depois categoria, seção e por fim o tipo do produto).
 * Nada de aleatório: o mesmo produto tem que desenhar igual em toda tela e em
 * toda sessão, senão a lista pisca a cada render.
 */
export type ArtePadrao = {
  Icone: LucideIcon;
  /** Classe Tailwind do fundo. Tons suaves: a arte é pano de fundo, não banner. */
  fundo: string;
  /** Classe Tailwind do traço do ícone. */
  traco: string;
};

const PADRAO: ArtePadrao = {
  Icone: ShoppingBag,
  fundo: "bg-muted",
  traco: "text-muted-foreground",
};

/**
 * Cada entrada casa por palavra contida no rótulo já normalizado.
 *
 * A ordem importa: a primeira que casar vence, então o específico vem antes do
 * genérico ("ressonancia" antes de "imagem", "odonto" antes de "consulta").
 */
const REGRAS: Array<{ chaves: string[]; arte: ArtePadrao }> = [
  // --- Imagem -------------------------------------------------------------
  { chaves: ["ressonancia", "angiorm"], arte: { Icone: Brain, fundo: "bg-violet-500/10", traco: "text-violet-500" } },
  { chaves: ["tomografia", "angiotc"], arte: { Icone: Scan, fundo: "bg-indigo-500/10", traco: "text-indigo-500" } },
  { chaves: ["raio-x", "raio x", "raiox", "densitometria", "radiografia"], arte: { Icone: Bone, fundo: "bg-slate-500/10", traco: "text-slate-500" } },
  { chaves: ["ultrassonografia", "ultrassom", "ecografia"], arte: { Icone: Waves, fundo: "bg-sky-500/10", traco: "text-sky-500" } },
  { chaves: ["obstetric", "gestacao", "pre natal"], arte: { Icone: Baby, fundo: "bg-pink-500/10", traco: "text-pink-500" } },
  { chaves: ["endoscopia", "colonoscopia"], arte: { Icone: Eye, fundo: "bg-teal-500/10", traco: "text-teal-500" } },
  { chaves: ["imagem"], arte: { Icone: Scan, fundo: "bg-indigo-500/10", traco: "text-indigo-500" } },

  // --- Laboratório --------------------------------------------------------
  { chaves: ["hematologia", "hemograma"], arte: { Icone: Droplet, fundo: "bg-red-500/10", traco: "text-red-500" } },
  { chaves: ["hormonio", "hormonal", "endocrin"], arte: { Icone: Activity, fundo: "bg-fuchsia-500/10", traco: "text-fuchsia-500" } },
  { chaves: ["alergia", "imunologia"], arte: { Icone: ShieldPlus, fundo: "bg-amber-500/10", traco: "text-amber-500" } },
  { chaves: ["sorologia", "infecciosa"], arte: { Icone: Droplets, fundo: "bg-rose-500/10", traco: "text-rose-500" } },
  { chaves: ["microbiologia", "cultura"], arte: { Icone: Microscope, fundo: "bg-lime-600/10", traco: "text-lime-600" } },
  { chaves: ["genetica", "biologia molecular", "cariotipo"], arte: { Icone: Dna, fundo: "bg-cyan-500/10", traco: "text-cyan-500" } },
  { chaves: ["anatomia patologica", "citologia", "biopsia"], arte: { Icone: Microscope, fundo: "bg-purple-500/10", traco: "text-purple-500" } },
  { chaves: ["toxicologic", "ocupacional"], arte: { Icone: Biohazard, fundo: "bg-orange-500/10", traco: "text-orange-500" } },
  { chaves: ["urina", "fezes"], arte: { Icone: FlaskConical, fundo: "bg-yellow-600/10", traco: "text-yellow-600" } },
  { chaves: ["laboratorio", "bioquimica", "analises clinicas", "exame"], arte: { Icone: TestTubes, fundo: "bg-emerald-500/10", traco: "text-emerald-500" } },

  // --- Atendimento --------------------------------------------------------
  { chaves: ["odonto", "dentista", "dental"], arte: { Icone: Smile, fundo: "bg-cyan-600/10", traco: "text-cyan-600" } },
  { chaves: ["cardiolog", "coracao"], arte: { Icone: HeartPulse, fundo: "bg-red-600/10", traco: "text-red-600" } },
  { chaves: ["cirurgia"], arte: { Icone: Scissors, fundo: "bg-blue-600/10", traco: "text-blue-600" } },
  { chaves: ["procedimento", "ambulatorial", "vacina"], arte: { Icone: Syringe, fundo: "bg-green-600/10", traco: "text-green-600" } },
  { chaves: ["consulta", "medicina", "clinic", "telemedicina"], arte: { Icone: Stethoscope, fundo: "bg-blue-500/10", traco: "text-blue-500" } },

  // --- Resto da loja ------------------------------------------------------
  { chaves: ["suplemento", "whey", "proteina", "vitamina"], arte: { Icone: Pill, fundo: "bg-orange-600/10", traco: "text-orange-600" } },
  { chaves: ["desafio", "challenge"], arte: { Icone: Trophy, fundo: "bg-amber-600/10", traco: "text-amber-600" } },
  { chaves: ["academia", "treino", "musculacao", "personal"], arte: { Icone: Dumbbell, fundo: "bg-zinc-500/10", traco: "text-zinc-500" } },
  { chaves: ["protocolo", "plano", "programa"], arte: { Icone: ClipboardList, fundo: "bg-teal-600/10", traco: "text-teal-600" } },
  { chaves: ["produto", "loja", "fisico"], arte: { Icone: Package, fundo: "bg-stone-500/10", traco: "text-stone-500" } },
];

/**
 * Escolhe a arte a partir dos rótulos da taxonomia, do mais específico para o
 * mais genérico. Passe o que tiver — os vazios são ignorados.
 */
export function arteDaTaxonomia(...rotulos: Array<string | null | undefined>): ArtePadrao {
  for (const rotulo of rotulos) {
    if (!rotulo) continue;
    const alvo = foldText(rotulo);
    for (const regra of REGRAS) {
      if (regra.chaves.some((c) => alvo.includes(c))) return regra.arte;
    }
  }
  return PADRAO;
}
