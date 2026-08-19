/**
 * Limite de tempo para envio de arquivo.
 *
 * O `upload` do storage não tem timeout próprio. Numa conexão ruim de celular
 * — que é o caso da recepção da academia e de qualquer parceiro na rua — a
 * promessa simplesmente não resolve: o botão fica girando, nada é salvo e
 * nenhum erro aparece. O usuário não tem como saber se deve esperar ou tentar
 * de novo, e foi exatamente esse o relato.
 *
 * Isto não cancela a requisição (o cliente do storage não expõe AbortSignal),
 * mas devolve o controle para a tela com uma mensagem honesta. Se o envio
 * terminar depois, o arquivo pode ter subido — por isso a mensagem sugere
 * conferir antes de repetir, em vez de afirmar que falhou.
 */
export async function comLimiteDeTempo<T>(
  tarefa: Promise<T>,
  ms = 45000,
  mensagem = "O envio demorou demais. Confira sua conexão e veja se a imagem já apareceu antes de tentar de novo.",
): Promise<T> {
  let relogio: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      tarefa,
      new Promise<never>((_, reject) => {
        relogio = setTimeout(() => reject(new Error(mensagem)), ms);
      }),
    ]);
  } finally {
    if (relogio) clearTimeout(relogio);
  }
}

/**
 * Recusa cedo o que o navegador do celular não vai conseguir processar.
 *
 * Melhor dizer "essa foto é grande demais" na hora de escolher do que deixar a
 * pessoa esperar o recorte, o envio, e só então falhar — ou pior, travar sem
 * mensagem nenhuma.
 */
export function conferirImagem(file: File | Blob, limiteMb = 25): string | null {
  const tipo = (file as File).type || "";
  if (tipo && !tipo.startsWith("image/")) {
    return "Esse arquivo não é uma imagem.";
  }
  // HEIC/HEIF é o padrão de câmera de vários aparelhos e o Chrome não decodifica.
  if (/hei[cf]/i.test(tipo)) {
    return "Formato HEIC não abre no navegador. No celular, mude a câmera para JPG ou envie pela galeria como cópia.";
  }
  const mb = file.size / (1024 * 1024);
  if (mb > limiteMb) {
    return `Imagem muito grande (${mb.toFixed(0)} MB). Envie uma com até ${limiteMb} MB.`;
  }
  if (file.size === 0) {
    return "O arquivo chegou vazio. Tente escolher a foto de novo.";
  }
  return null;
}
