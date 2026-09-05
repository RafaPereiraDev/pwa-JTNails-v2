// ===== POLÍTICA DE SENHA — validação de força =====
// Regras (modernas, sem exigências rígidas desnecessárias):
//  - Mínimo de 8 caracteres.
//  - Bloqueia sequências numéricas/alfabéticas (123456, 654321, abcdef...).
//  - Bloqueia repetição do mesmo caractere (111111, aaaaaa).
//  - Bloqueia padrões de teclado (qwerty, asdf, 1qaz...).
//  - Bloqueia senhas muito comuns (dicionário curto).
//  - NÃO obriga símbolos nem maiúsculas: senha longa e sem padrão já é aceita.
//  - Opcionalmente usa zxcvbn (se instalado) para reforçar a análise de força.

const MIN_LENGTH = 8;

// Senhas mais comuns / óbvias em PT-BR e globais (lista curta, minúsculas).
const COMMON_PASSWORDS = new Set([
  'senha', 'senha123', '12345678', '123456789', '1234567890', 'password',
  'password1', 'password123', 'qwerty', 'qwerty123', 'abc12345', 'admin',
  'admin123', 'iloveyou', 'welcome', 'letmein', 'monkey', 'dragon',
  'sunshine', 'princess', 'football', 'baseball', 'trustno1', 'master',
  'batata', 'brasil', 'flamengo', 'corinthians', 'palmeiras', 'gremio',
  'unhas', 'unhas123', 'salao', 'salao123', 'manicure', 'atelier',
  'tainara', 'juliana', 'nails', 'nails123', 'teste', 'teste123',
  '11111111', '00000000', 'aaaaaaaa', 'senhasenha',
]);

// Fileiras de teclado (QWERTY) para detectar sequências digitadas em linha.
const KEYBOARD_ROWS = [
  'qwertyuiop', 'asdfghjkl', 'zxcvbnm',
  '1234567890', '0987654321',
  '1qaz', '2wsx', '3edc', 'qazwsx',
];

// Verifica se a senha contém uma sequência crescente/decrescente longa
// de dígitos ou letras (ex.: 123456, fedcba). Retorna true se achar.
function hasLongSequence(pwd, minRun = 5) {
  const s = pwd.toLowerCase();
  let asc = 1, desc = 1;
  for (let i = 1; i < s.length; i++) {
    const diff = s.charCodeAt(i) - s.charCodeAt(i - 1);
    asc  = diff === 1  ? asc + 1  : 1;
    desc = diff === -1 ? desc + 1 : 1;
    if (asc >= minRun || desc >= minRun) return true;
  }
  return false;
}

// Verifica repetição do mesmo caractere N vezes seguidas (ex.: aaaa, 1111).
function hasRepeatedChar(pwd, minRun = 4) {
  const re = new RegExp(`(.)\\1{${minRun - 1},}`);
  return re.test(pwd);
}

// Verifica se a senha é (ou contém em grande parte) um padrão de teclado.
function hasKeyboardPattern(pwd) {
  const s = pwd.toLowerCase();
  for (const row of KEYBOARD_ROWS) {
    for (let len = row.length; len >= 4; len--) {
      for (let start = 0; start + len <= row.length; start++) {
        const chunk = row.slice(start, start + len);
        if (s.includes(chunk) || s.includes(chunk.split('').reverse().join(''))) return true;
      }
    }
  }
  return false;
}

// Tenta carregar zxcvbn de forma opcional — não quebra se não estiver instalado.
let zxcvbn = null;
try { zxcvbn = require('zxcvbn'); } catch (_) { zxcvbn = null; }

/**
 * Valida a força de uma senha.
 * @param {string} password
 * @param {string[]} userInputs - termos a evitar (nome, telefone) para o zxcvbn
 * @returns {{ valid: boolean, error: string|null, score: number|null }}
 */
function validatePassword(password, userInputs = []) {
  const pwd = String(password || '');

  if (pwd.length < MIN_LENGTH)
    return { valid: false, error: `A senha deve ter pelo menos ${MIN_LENGTH} caracteres.`, score: null };

  if (/\s/.test(pwd))
    return { valid: false, error: 'A senha não pode conter espaços.', score: null };

  if (COMMON_PASSWORDS.has(pwd.toLowerCase()))
    return { valid: false, error: 'Essa senha é muito comum e fácil de adivinhar. Escolha outra.', score: 0 };

  if (hasRepeatedChar(pwd))
    return { valid: false, error: 'Evite repetir o mesmo caractere várias vezes (ex.: 1111, aaaa).', score: 0 };

  if (hasLongSequence(pwd))
    return { valid: false, error: 'Evite sequências óbvias (ex.: 12345, abcdef).', score: 0 };

  if (hasKeyboardPattern(pwd))
    return { valid: false, error: 'Evite padrões de teclado (ex.: qwerty, asdf).', score: 0 };

  // Análise de força real com zxcvbn, se disponível.
  // score vai de 0 (muito fraca) a 4 (muito forte). Bloqueia score <= 1.
  if (zxcvbn) {
    const inputs = userInputs.filter(Boolean).map(String);
    const result = zxcvbn(pwd, inputs);
    if (result.score <= 1) {
      const hint = (result.feedback && (result.feedback.warning ||
        (result.feedback.suggestions && result.feedback.suggestions[0]))) || '';
      return {
        valid: false,
        score: result.score,
        error: 'Essa senha é fraca e fácil de adivinhar. Tente uma combinação mais longa ou menos previsível.'
          + (hint ? ` (${hint})` : ''),
      };
    }
    return { valid: true, error: null, score: result.score };
  }

  // Sem zxcvbn: as regras acima já garantem um mínimo robusto.
  return { valid: true, error: null, score: null };
}

module.exports = { validatePassword, MIN_LENGTH };
