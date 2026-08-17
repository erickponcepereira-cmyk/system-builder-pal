import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Check, RefreshCw, X } from "lucide-react";

/**
 * Captura de rosto no navegador, com dicas de qualidade.
 *
 * IMPORTANTE: as medidas aqui são DICA, não veredito. A escala de nitidez varia
 * demais entre câmeras — o mesmo rosto dá números diferentes no iPhone e num
 * notebook. Quem recusa foto ruim de verdade é o leitor facial, e o erro dele
 * volta para a tela. Barrar por heurística mal calibrada só impediria a pessoa
 * de mandar uma foto que funcionaria.
 *
 * Sem biblioteca externa: câmera do navegador e medida no canvas.
 */

type Estado = "iniciando" | "pronto" | "erro" | "revisando";

type Medida = {
  nitidez: number;
  luz: number;
  rosto: boolean | null;
  avisos: string[];
};

// Faixas frouxas, só para pegar o obviamente ruim. Ajustadas depois de medir
// num iPhone: foto boa deu nitidez ~10, então o limiar antigo de 55 reprovava
// tudo.
const NITIDEZ_BAIXA = 3;
const LUZ_MIN = 45;
const LUZ_MAX = 225;

function medir(canvas: HTMLCanvasElement, temRosto: boolean | null): Medida {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { nitidez: 0, luz: 0, rosto: temRosto, avisos: [] };

  const { width: w, height: h } = canvas;
  const mx = Math.floor(w * 0.25), my = Math.floor(h * 0.2);
  const mw = Math.floor(w * 0.5), mh = Math.floor(h * 0.6);
  const d = ctx.getImageData(mx, my, mw, mh).data;

  const cinza = new Float32Array(mw * mh);
  let soma = 0;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    cinza[p] = g;
    soma += g;
  }
  const luz = soma / (mw * mh);

  let sq = 0, sm = 0, n = 0;
  for (let y = 1; y < mh - 1; y++) {
    for (let x = 1; x < mw - 1; x++) {
      const i = y * mw + x;
      const lap = 4 * cinza[i] - cinza[i - 1] - cinza[i + 1] - cinza[i - mw] - cinza[i + mw];
      sm += lap; sq += lap * lap; n++;
    }
  }
  const nitidez = n ? Math.sqrt(sq / n - (sm / n) ** 2) : 0;

  const avisos: string[] = [];
  if (temRosto === false) avisos.push("Não encontrei um rosto no oval");
  if (luz < LUZ_MIN) avisos.push("Parece escuro");
  if (luz > LUZ_MAX) avisos.push("Parece claro demais");
  if (nitidez < NITIDEZ_BAIXA) avisos.push("Pode estar tremida");

  return { nitidez, luz, rosto: temRosto, avisos };
}

export function CapturaRosto({ onPronta, onCancelar }: {
  onPronta: (base64: string) => void;
  onCancelar: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const [estado, setEstado] = useState<Estado>("iniciando");
  const [erro, setErro] = useState("");
  const [medida, setMedida] = useState<Medida | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);

  const ligarCamera = useCallback(async () => {
    try {
      if (!stream.current) {
        stream.current = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 960 }, height: { ideal: 960 } },
          audio: false,
        });
      }
      if (video.current) {
        video.current.srcObject = stream.current;
        // O Safari do iPhone pausa o vídeo depois de desenhar no canvas. Sem
        // este play() de novo, "Repetir" deixava a tela preta.
        await video.current.play();
      }
      setEstado("pronto");
    } catch {
      setErro("Não consegui abrir a câmera. Verifique a permissão do navegador.");
      setEstado("erro");
    }
  }, []);

  useEffect(() => {
    void ligarCamera();
    return () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  }, [ligarCamera]);

  const capturar = async () => {
    const v = video.current, c = canvas.current;
    if (!v || !c || !v.videoWidth) return;

    const lado = Math.min(v.videoWidth, v.videoHeight);
    c.width = lado; c.height = lado;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, (v.videoWidth - lado) / 2, (v.videoHeight - lado) / 2, lado, lado, 0, 0, lado, lado);

    let temRosto: boolean | null = null;
    const Det = (window as unknown as { FaceDetector?: new (o?: unknown) => { detect: (s: unknown) => Promise<unknown[]> } }).FaceDetector;
    if (Det) {
      try {
        const rostos = await new Det({ fastMode: true }).detect(c);
        temRosto = rostos.length === 1;
      } catch { temRosto = null; }
    }

    setMedida(medir(c, temRosto));
    setPrevia(c.toDataURL("image/jpeg", 0.92));
    setEstado("revisando");
  };

  const confirmar = () => {
    if (!previa) return;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    onPronta(previa);
  };

  const refazer = () => {
    setPrevia(null); setMedida(null);
    setEstado("iniciando");
    void ligarCamera();
  };

  const fechar = () => {
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    onCancelar();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3" onClick={fechar}>
      <div
        className="w-full max-w-sm space-y-3 rounded-2xl border border-white/10 bg-[#12171C] p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-white">Foto para o leitor facial</p>
          <button type="button" onClick={fechar} className="rounded p-1 text-white/60 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>

        {estado === "erro" ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-400">{erro}</p>
        ) : (
          <div className="relative aspect-square overflow-hidden rounded-xl bg-black">
            {previa ? (
              <img src={previa} alt="" className="h-full w-full object-cover" />
            ) : (
              <video ref={video} playsInline muted autoPlay className="h-full w-full scale-x-[-1] object-cover" />
            )}

            {!previa && (
              <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full">
                <defs>
                  <mask id="mascara-rosto">
                    <rect width="100" height="100" fill="white" />
                    <ellipse cx="50" cy="46" rx="27" ry="35" fill="black" />
                  </mask>
                </defs>
                <rect width="100" height="100" fill="rgba(0,0,0,.45)" mask="url(#mascara-rosto)" />
                <ellipse cx="50" cy="46" rx="27" ry="35" fill="none" stroke="#56B9D8" strokeWidth="0.7" strokeDasharray="3 2" />
              </svg>
            )}
          </div>
        )}

        <canvas ref={canvas} className="hidden" />

        {estado === "revisando" && medida && (
          <div className={`rounded-xl border p-2.5 ${medida.avisos.length ? "border-amber-500/30 bg-amber-500/10" : "border-green-500/30 bg-green-500/10"}`}>
            {medida.avisos.length ? (
              <>
                <p className="text-sm font-bold text-amber-400">{medida.avisos.join(" · ")}</p>
                <p className="mt-0.5 text-[11px] text-white/60">
                  É só uma dica. Se a foto parecer boa para você, pode usar — quem
                  decide de verdade é o leitor.
                </p>
              </>
            ) : (
              <p className="text-sm font-bold text-green-400">Parece boa</p>
            )}
            <p className="mt-1 font-mono text-[11px] text-white/40">
              nitidez {medida.nitidez.toFixed(1)} · luz {Math.round(medida.luz)}
              {medida.rosto === null ? " · rosto não verificado" : medida.rosto ? " · 1 rosto" : " · rosto não encontrado"}
            </p>
          </div>
        )}

        {estado === "pronto" && (
          <p className="text-[11px] text-white/50">
            Rosto de frente dentro do oval, boa luz, sem boné nem óculos escuros.
          </p>
        )}

        <div className="flex gap-2">
          {estado === "revisando" ? (
            <>
              <button
                type="button" onClick={refazer}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/10 px-3 py-2.5 text-sm font-bold text-white hover:bg-white/15"
              >
                <RefreshCw className="h-4 w-4" /> Repetir
              </button>
              <button
                type="button" onClick={confirmar}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground"
              >
                <Check className="h-4 w-4" /> Usar esta
              </button>
            </>
          ) : (
            <button
              type="button" onClick={() => void capturar()} disabled={estado !== "pronto"}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-40"
            >
              <Camera className="h-4 w-4" /> Tirar foto
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
