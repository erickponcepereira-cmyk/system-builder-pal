import { Check, X, ShieldAlert } from "lucide-react";

interface Props {
  password: string;
  email?: string;
  name?: string;
  className?: string;
}

const COMMON_PASSWORDS = new Set([
  "senha", "senha123", "123456", "12345678", "123456789", "1234567890",
  "password", "password1", "password123", "qwerty", "qwerty123", "abc123",
  "admin", "admin123", "letmein", "welcome", "iloveyou", "monkey", "dragon",
  "fitness", "fitness123", "fitmind", "fitmind123", "brasil", "brasil123",
  "master", "master123", "coach", "coach123", "aluno", "aluno123",
]);

const SEQUENCES = ["0123456789", "abcdefghijklmnopqrstuvwxyz", "qwertyuiop", "asdfghjkl", "zxcvbnm"];

function hasSequence(pw: string): boolean {
  const low = pw.toLowerCase();
  for (const seq of SEQUENCES) {
    for (let i = 0; i <= seq.length - 4; i++) {
      const chunk = seq.slice(i, i + 4);
      if (low.includes(chunk) || low.includes(chunk.split("").reverse().join(""))) return true;
    }
  }
  return false;
}

function hasRepetition(pw: string): boolean {
  return /(.)\1{3,}/.test(pw);
}

function similarTo(pw: string, ref?: string): boolean {
  if (!ref) return false;
  const r = ref.toLowerCase().split(/[@\s.]/).filter((x) => x.length >= 4);
  const p = pw.toLowerCase();
  return r.some((piece) => p.includes(piece));
}

export interface StrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
  reasons: string[];
}

export function evaluatePassword(pw: string, email?: string, name?: string): StrengthResult {
  const reasons: string[] = [];
  if (!pw) return { score: 0, label: "Muito fraca", color: "bg-destructive", reasons: [] };

  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (pw.length >= 16) score++;

  const variety = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  if (variety >= 3) score++;
  if (variety === 4 && pw.length >= 10) score++;

  if (COMMON_PASSWORDS.has(pw.toLowerCase())) {
    score = 0;
    reasons.push("Esta senha está entre as mais comuns do mundo");
  }
  if (hasSequence(pw)) {
    score = Math.max(0, score - 2);
    reasons.push("Contém sequência óbvia (ex.: 1234, abcd, qwer)");
  }
  if (hasRepetition(pw)) {
    score = Math.max(0, score - 1);
    reasons.push("Contém caracteres repetidos em excesso");
  }
  if (similarTo(pw, email) || similarTo(pw, name)) {
    score = Math.max(0, score - 2);
    reasons.push("Muito parecida com seu e-mail ou nome");
  }

  const final = Math.max(0, Math.min(4, score)) as 0 | 1 | 2 | 3 | 4;
  const labels = ["Muito fraca", "Fraca", "Razoável", "Forte", "Muito forte"];
  const colors = ["bg-destructive", "bg-destructive", "bg-yellow-500", "bg-primary", "bg-emerald-500"];
  return { score: final, label: labels[final], color: colors[final], reasons };
}

export function PasswordStrengthMeter({ password, email, name, className = "" }: Props) {
  const result = evaluatePassword(password, email, name);

  const checks: Array<[string, boolean]> = [
    ["Mínimo 8 caracteres", password.length >= 8],
    ["1 letra maiúscula (A-Z)", /[A-Z]/.test(password)],
    ["1 letra minúscula (a-z)", /[a-z]/.test(password)],
    ["1 número (0-9)", /[0-9]/.test(password)],
    ["1 caractere especial (!@#$...)", /[^A-Za-z0-9]/.test(password)],
    ["Sem sequências óbvias (1234, abcd)", password.length > 0 && !hasSequence(password) && !hasRepetition(password)],
  ];

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                password && i < Math.max(1, result.score) ? result.color : "bg-white/10"
              }`}
            />
          ))}
        </div>
        {password && (
          <span
            className={`text-[11px] font-semibold ${
              result.score >= 3 ? "text-emerald-500" : result.score === 2 ? "text-yellow-500" : "text-destructive"
            }`}
          >
            {result.label}
          </span>
        )}
      </div>

      <ul className="space-y-1 text-[11px]">
        {checks.map(([label, ok]) => (
          <li key={label} className={`flex items-center gap-1.5 ${ok ? "text-emerald-500" : "text-muted-foreground"}`}>
            {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3 opacity-50" />}
            {label}
          </li>
        ))}
      </ul>

      {result.reasons.length > 0 && (
        <div className="flex items-start gap-1.5 rounded-lg border border-yellow-500/30 bg-yellow-500/5 px-2 py-1.5 text-[11px] text-yellow-600 dark:text-yellow-400">
          <ShieldAlert className="mt-0.5 h-3 w-3 flex-shrink-0" />
          <div>
            {result.reasons.map((r) => (
              <div key={r}>{r}</div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground leading-relaxed">
        Dica: senhas que já apareceram em vazamentos de dados serão rejeitadas pelo sistema, mesmo cumprindo os requisitos acima. Prefira combinar palavras aleatórias, números e símbolos.
      </p>
    </div>
  );
}
