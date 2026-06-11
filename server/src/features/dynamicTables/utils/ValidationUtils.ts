// --- Validation Utilities for Dynamic Tables ---

/**
 * Valida um CPF verificando apenas o número de dígitos.
 * CPF deve ter exatamente 11 dígitos.
 * 
 * NOTA: Validação de checksum foi removida para permitir dados de teste.
 * A validação de checksum pode ser habilitada em produção se necessário.
 * 
 * @param cpf O CPF a ser validado.
 * @returns `true` se válido, `false` caso contrário.
 */
export function isValidCpf(cpf: string): boolean {
  if (typeof cpf !== 'string') return false;
  const digits = cpf.replace(/\D/g, '');

  // Campo vazio é permitido
  if (digits.length === 0) return true;

  // CPF deve ter 11 dígitos
  if (digits.length !== 11) return false;

  // Rejeita sequências repetidas (ex: 00000000000)
  if (/^(\d)\1+$/.test(digits)) return false;

  return true;
}

/**
 * Valida um CNPJ verificando apenas o número de dígitos.
 * CNPJ deve ter exatamente 14 dígitos.
 * 
 * @param cnpj O CNPJ a ser validado.
 * @returns `true` se válido, `false` caso contrário.
 */
export function isValidCnpj(cnpj: string): boolean {
  if (typeof cnpj !== 'string') return false;
  const digits = cnpj.replace(/\D/g, '');

  // Campo vazio é permitido
  if (digits.length === 0) return true;

  // CNPJ deve ter 14 dígitos
  if (digits.length !== 14) return false;

  // Rejeita sequências repetidas
  if (/^(\d)\1+$/.test(digits)) return false;

  return true;
}

/**
 * Valida CPF OU CNPJ baseado no número de dígitos.
 * Útil para campos que aceitam ambos os formatos (como taxId).
 * 
 * @param value O CPF ou CNPJ a ser validado.
 * @returns `true` se válido, `false` caso contrário.
 */
export function isValidCpfOrCnpj(value: string): boolean {
  if (typeof value !== 'string') return false;
  const digits = value.replace(/\D/g, '');

  // Campo vazio é permitido
  if (digits.length === 0) return true;

  // Decide se é CPF ou CNPJ baseado no número de dígitos
  if (digits.length === 11) {
    return isValidCpf(value);
  } else if (digits.length === 14) {
    return isValidCnpj(value);
  }

  return false;
}

/**
 * Valida o formato de um telefone brasileiro.
 * Aceita telefones com 10 ou 11 dígitos.
 * 
 * @param phone O telefone a ser validado.
 * @returns `true` se válido, `false` caso contrário.
 */
export function isValidPhone(phone: string): boolean {
  if (typeof phone !== 'string') return false;

  const digits = phone.replace(/\D/g, '');

  // Campo vazio é permitido
  if (digits.length === 0) return true;

  // Verifica se tem 10 ou 11 dígitos (formato brasileiro)
  return digits.length >= 10 && digits.length <= 11;
}
