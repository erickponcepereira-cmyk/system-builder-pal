// Traduz erros comuns do Supabase Auth e do servidor para PT-BR amigável.
export function translateAuthError(raw: unknown): string {
  const msg = (raw instanceof Error ? raw.message : String(raw || "")).toLowerCase();

  if (!msg) return "Não foi possível concluir a operação. Tente novamente.";

  if (msg.includes("invalid login credentials"))
    return "E-mail ou senha incorretos. Confira se não há espaços, letras trocadas ou Caps Lock ativo.";
  if (msg.includes("email not confirmed"))
    return "Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada e o spam.";
  if (msg.includes("user already registered") || msg.includes("already registered") || msg.includes("already been registered"))
    return "Este e-mail já está cadastrado. Tente fazer login ou use a opção 'Esqueci minha senha'.";
  if (msg.includes("user already exists") || (msg.includes("already") && msg.includes("user")))
    return "Já existe uma conta com este e-mail. Faça login para continuar.";
  if (msg.includes("password should be at least") || msg.includes("password is too short"))
    return "A senha é muito curta. Use no mínimo 8 caracteres, com 1 maiúscula e 1 número.";
  if (msg.includes("weak password") || msg.includes("password is too weak"))
    return "Senha fraca. Combine letras maiúsculas, minúsculas, números e símbolos.";
  if (msg.includes("unable to validate email") || msg.includes("invalid email") || msg.includes("invalid format"))
    return "E-mail inválido. Confira se está no formato nome@dominio.com.";
  if (msg.includes("rate limit") || msg.includes("too many requests"))
    return "Muitas tentativas seguidas. Aguarde alguns instantes e tente novamente.";
  if (msg.includes("network") || msg.includes("failed to fetch"))
    return "Falha de conexão. Verifique sua internet e tente novamente.";
  if (msg.includes("captcha"))
    return "Verificação de segurança falhou. Recarregue a página e tente novamente.";
  if (msg.includes("signup") && msg.includes("disabled"))
    return "Cadastros estão temporariamente desabilitados. Tente mais tarde.";

  // Caso já seja uma mensagem em PT vinda do servidor, devolve original.
  return raw instanceof Error ? raw.message : String(raw);
}
