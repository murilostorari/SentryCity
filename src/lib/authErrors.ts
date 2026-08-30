/**
 * Tradução de mensagens de erro do Supabase Auth para português.
 *
 * O Supabase retorna mensagens de erro em inglês. Este utilitário
 * mapeia as mensagens conhecidas para português, facilitando a
 * experiência do usuário no nosso app.
 */

type ErrorMap = Record<string, string>;

const ERROR_MAP: ErrorMap = {
  // Auth geral
  'Invalid login credentials': 'Credenciais de login inválidas. Verifique seu email e senha.',
  'Invalid credentials': 'Credenciais inválidas. Verifique seus dados e tente novamente.',
  'User already registered': 'Este email já está registrado. Tente fazer login.',
  'User already exists': 'Este email já está registrado. Tente fazer login.',
  'Email already registered': 'Este email já está registrado. Tente fazer login.',
  'Email not confirmed': 'Email não confirmado. Verifique sua caixa de entrada (e spam) e confirme seu email.',
  'Signup requires a valid password': 'O cadastro requer uma senha válida.',
  'Signup requires a valid email': 'O cadastro requer um email válido.',
  'Password should be between 6 and 72 characters': 'A senha deve ter entre 6 e 72 caracteres.',
  'Password must be shorter than 72 characters': 'A senha deve ter no máximo 72 caracteres.',
  'Password is not strong enough': 'A senha não é forte o suficiente. Use pelo menos 6 caracteres.',
  'Email address is invalid': 'Este email não é válido.',
  'Email addresses from this provider are not supported': 'Emails deste provedor não são suportados.',
  'Email provider is not supported': 'Este provedor de email não é suportado.',
  'Unable to validate email': 'Não foi possível validar este email.',
  'Unable to validate password': 'Não foi possível validar esta senha.',
  'User not found': 'Usuário não encontrado.',
  'User is not authenticated': 'Usuário não autenticado. Faça login para continuar.',
  'Refresh Token is not valid': 'Token de atualização inválido. Faça login novamente.',
  'Session has expired': 'Sua sessão expirou. Faça login novamente.',
  'User account is not verified': 'Conta de usuário não verificada.',

  // Rate limiting / recuperação
  'For security purposes, you can only request this after': 'Por razões de segurança, você só pode solicitar uma nova redefinição após alguns segundos. Tente novamente em breve.',
  'For security reasons, this operation is rate limited': 'Por razões de segurança, esta operação está limitada. Tente novamente em breve.',
  'Please wait a few seconds before requesting a new email': 'Aguarde alguns segundos antes de solicitar um novo email.',
  'otp disabled': 'A verificação por código (OTP) está desativada.',

  // Reset de senha
  'Token is invalid': 'Este link de redefinição expirou ou é inválido. Solicite uma nova redefinição de senha.',
  'Token has expired': 'Este link de redefinição expirou. Solicite uma nova redefinição de senha.',
  'Invalid token': 'Token inválido. Solicite uma nova redefinição de senha.',

  // Outros
  'Database error': 'Erro interno. Tente novamente mais tarde.',
  'Unexpected error': 'Erro inesperado. Tente novamente mais tarde.',
  'Network request failed': 'Falha na conexão de rede. Verifique sua internet e tente novamente.',
};

/**
 * Traduz uma mensagem de erro do Supabase para português.
 * Faz correspondência exata primeiro, depois busca por substring.
 */
export function translateAuthError(message: string | undefined | null): string {
  if (!message) {
    return 'Ocorreu um erro desconhecido. Tente novamente.';
  }

  // Correspondência exata
  if (ERROR_MAP[message]) {
    return ERROR_MAP[message];
  }

  // Correspondência por substring (mais robusta para mensagens com variações)
  for (const [key, value] of Object.entries(ERROR_MAP)) {
    if (message.includes(key)) {
      return value;
    }
  }

  // Se não mapeado, retorna a mensagem original (tratada abaixo)
  return message;
}
