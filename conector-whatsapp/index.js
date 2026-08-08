// Conector WhatsApp do FitMind Club.
//
// Roda num computador que fica ligado, pareado com o celular como se fosse o
// WhatsApp Web. A nuvem não alcança este PC, então é ele quem fala com o
// servidor: manda status, entrega o que chega e busca o que precisa sair.
//
// Uso: copie .env.example para .env, preencha e rode `npm start`.

import "dotenv/config";
import qrcode from "qrcode-terminal";
import pkg from "whatsapp-web.js";

const { Client, LocalAuth } = pkg;

const BASE = (process.env.FITMIND_URL || "").replace(/\/+$/, "");
const CONEXAO = process.env.FITMIND_CONEXAO_ID || "";
const SEGREDO = process.env.FITMIND_SEGREDO || "";

if (!BASE || !CONEXAO || !SEGREDO) {
  console.error("Faltam dados no .env (FITMIND_URL, FITMIND_CONEXAO_ID, FITMIND_SEGREDO).");
  process.exit(1);
}

const cabecalhos = {
  "Content-Type": "application/json",
  "x-bot-conexao": CONEXAO,
  "x-bot-segredo": SEGREDO,
};

const log = (...a) => console.log(new Date().toLocaleTimeString("pt-BR"), ...a);

/** Fala com o FitMind. Erro de rede nunca derruba o conector. */
async function chamar(caminho, opcoes = {}) {
  try {
    const r = await fetch(`${BASE}${caminho}`, { ...opcoes, headers: cabecalhos });
    const texto = await r.text();
    let corpo = {};
    try {
      corpo = texto ? JSON.parse(texto) : {};
    } catch {
      corpo = { bruto: texto.slice(0, 200) };
    }
    if (!r.ok) log(`servidor respondeu ${r.status} em ${caminho}:`, corpo);
    return r.ok ? corpo : null;
  } catch (e) {
    log("sem conexão com o FitMind:", e.message);
    return null;
  }
}

const enviarEvento = (corpo) =>
  chamar("/api/bot/eventos", { method: "POST", body: JSON.stringify(corpo) });

const avisarStatus = (status, detalhe, numero) =>
  enviarEvento({ tipo: "status", status, detalhe: detalhe || null, numero: numero || null });

const cliente = new Client({
  authStrategy: new LocalAuth({ dataPath: "./sessao" }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  },
});

cliente.on("qr", (qr) => {
  console.log("\n=============================================");
  console.log(" Abra o WhatsApp do número oficial no celular:");
  console.log(" Configurações > Aparelhos conectados > Conectar aparelho");
  console.log(" e aponte a câmera para o QR Code abaixo.");
  console.log("=============================================\n");
  qrcode.generate(qr, { small: true });
  void avisarStatus("aguardando_qr", "Esperando leitura do QR Code");
});

cliente.on("authenticated", () => log("pareado com sucesso."));

cliente.on("ready", async () => {
  const numero = (cliente.info?.wid?.user || "").replace(/\D/g, "");
  log(`conectado como +${numero}`);
  await avisarStatus("conectado", "Conector no ar", numero);
});

cliente.on("auth_failure", async (m) => {
  log("falha de autenticação:", m);
  await avisarStatus("erro", String(m).slice(0, 300));
});

cliente.on("disconnected", async (motivo) => {
  log("desconectado:", motivo);
  await avisarStatus("desconectado", String(motivo).slice(0, 300));
  // sessão caiu: reinicia para pedir QR de novo se precisar
  setTimeout(() => cliente.initialize().catch((e) => log("falha ao reiniciar:", e.message)), 5000);
});

// Mensagem recebida — é aqui que o código FIT-XXXX chega e a conta é confirmada.
cliente.on("message", async (msg) => {
  if (msg.from.endsWith("@g.us")) return; // grupo não confirma conta
  const telefone = (msg.from.split("@")[0] || "").replace(/\D/g, "");
  if (!telefone) return;

  let nome = null;
  try {
    const contato = await msg.getContact();
    nome = contato?.pushname || contato?.name || null;
  } catch {
    /* contato indisponível: segue sem nome */
  }

  const resposta = await enviarEvento({
    tipo: "mensagem",
    telefone,
    nome,
    corpo: msg.body || "",
    waId: msg.id?._serialized || null,
    tipoMidia: msg.type === "chat" ? "texto" : msg.type,
  });
  log(`recebido de ${telefone}:`, msg.body?.slice(0, 60), resposta?.acao ? `→ ${resposta.acao}` : "");
});

/** Busca o que o sistema quer enviar e manda, um a um. */
async function girarFila() {
  if (!cliente.info) return;
  const res = await chamar("/api/bot/fila?limite=10");
  const mensagens = res?.mensagens || [];
  for (const m of mensagens) {
    try {
      const enviada = await cliente.sendMessage(`${m.telefone}@c.us`, m.corpo);
      await chamar("/api/bot/confirmar", {
        method: "POST",
        body: JSON.stringify({ id: m.id, status: "enviada", waId: enviada?.id?._serialized || null }),
      });
      log(`enviado para ${m.telefone}`);
    } catch (e) {
      await chamar("/api/bot/confirmar", {
        method: "POST",
        body: JSON.stringify({ id: m.id, status: "erro", erro: e.message }),
      });
      log(`erro ao enviar para ${m.telefone}:`, e.message);
    }
    // espaça os envios: rajada é o que faz o WhatsApp bloquear número
    await new Promise((r) => setTimeout(r, 4000));
  }
}

setInterval(() => void girarFila(), 5000);
setInterval(() => void enviarEvento({ tipo: "batimento" }), 60000);

log("iniciando… (a primeira vez baixa o navegador interno e pode demorar)");
cliente.initialize().catch((e) => {
  console.error("Não consegui iniciar:", e.message);
  process.exit(1);
});
