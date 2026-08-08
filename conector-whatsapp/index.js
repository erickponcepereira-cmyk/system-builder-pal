// Conector WhatsApp do FitMind Club.
//
// Roda num computador que fica ligado, pareado com o celular como se fosse o
// WhatsApp Web. A nuvem não alcança este PC, então é ele quem fala com o
// servidor: manda status, entrega o que chega e busca o que precisa sair.
//
// Uso: copie .env.example para .env, preencha e rode `npm start`.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import qrcode from "qrcode-terminal";
import pkg from "whatsapp-web.js";

const { Client, LocalAuth } = pkg;

// No Windows é comum o arquivo continuar como .env.example ou virar .env.txt
// (o Explorer esconde a extensão). Aceitamos as variações para não travar.
const PASTA = path.dirname(fileURLToPath(import.meta.url));
const CANDIDATOS = [".env", ".env.txt", ".env.example.txt", ".env.example"];

let arquivoUsado = null;
for (const nome of CANDIDATOS) {
  const caminho = path.join(PASTA, nome);
  if (!fs.existsSync(caminho)) continue;
  dotenv.config({ path: caminho, override: false });
  if (!arquivoUsado) arquivoUsado = nome;
  if (process.env.FITMIND_URL && process.env.FITMIND_CONEXAO_ID && process.env.FITMIND_SEGREDO) break;
}

const BASE = (process.env.FITMIND_URL || "").replace(/\/+$/, "");
const CONEXAO = process.env.FITMIND_CONEXAO_ID || "";
const SEGREDO = process.env.FITMIND_SEGREDO || "";

const faltando = [
  !BASE && "FITMIND_URL",
  !CONEXAO && "FITMIND_CONEXAO_ID",
  !SEGREDO && "FITMIND_SEGREDO",
].filter(Boolean);

if (faltando.length) {
  console.error("\nNão consegui iniciar: faltam dados de configuração.\n");
  console.error("Pasta:", PASTA);
  if (arquivoUsado) {
    console.error(`Arquivo lido: ${arquivoUsado}`);
    console.error("Campos vazios:", faltando.join(", "));
    console.error("Abra esse arquivo, preencha os campos acima (sem espaços antes do =) e rode de novo.");
  } else {
    console.error("Nenhum arquivo de configuração encontrado.");
    console.error("Esperava um destes nomes:", CANDIDATOS.join(", "));
    console.error('No PowerShell, dentro desta pasta, rode: Copy-Item .env.example .env');
  }
  console.error("");
  process.exit(1);
}

console.log(`configuração lida de ${arquivoUsado}`);

// Em vez de baixar um Chrome só para o conector (150 MB que costumam falhar no
// meio), usamos o navegador que já existe na máquina.
function acharNavegador() {
  const manual = (process.env.CHROME_PATH || "").trim();
  if (manual) {
    if (fs.existsSync(manual)) return manual;
    console.error(`CHROME_PATH aponta para um arquivo inexistente: ${manual}`);
  }

  const pf = process.env["ProgramFiles"] || "C:\\Program Files";
  const pf86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const local = process.env["LOCALAPPDATA"] || "";

  const candidatos = [
    `${pf}\\Google\\Chrome\\Application\\chrome.exe`,
    `${pf86}\\Google\\Chrome\\Application\\chrome.exe`,
    local && `${local}\\Google\\Chrome\\Application\\chrome.exe`,
    `${pf}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${pf86}\\Microsoft\\Edge\\Application\\msedge.exe`,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);

  return candidatos.find((c) => fs.existsSync(c)) || null;
}

const NAVEGADOR = acharNavegador();
if (!NAVEGADOR) {
  console.error("\nNão encontrei o Google Chrome (nem o Edge) neste computador.");
  console.error("Instale o Chrome em https://www.google.com/chrome e rode de novo,");
  console.error("ou preencha CHROME_PATH no arquivo de configuração com o caminho do chrome.exe.\n");
  process.exit(1);
}
console.log(`navegador: ${NAVEGADOR}`);

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
    executablePath: NAVEGADOR,
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
