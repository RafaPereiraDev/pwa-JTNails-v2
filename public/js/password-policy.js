// ===== POLÍTICA DE SENHA (frontend) — feedback imediato à cliente =====
// Espelha as regras do backend (src/utils/passwordPolicy.js). A validação
// definitiva é sempre a do servidor; aqui é só para orientar o usuário.
(function (global) {
  const MIN_LENGTH = 8;

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

  const KEYBOARD_ROWS = [
    'qwertyuiop', 'asdfghjkl', 'zxcvbnm',
    '1234567890', '0987654321',
    '1qaz', '2wsx', '3edc', 'qazwsx',
  ];

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

  function hasRepeatedChar(pwd, minRun = 4) {
    return new RegExp(`(.)\\1{${minRun - 1},}`).test(pwd);
  }

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

  // Retorna { valid, error }
  function validatePassword(password) {
    const pwd = String(password || '');
    if (pwd.length < MIN_LENGTH)
      return { valid: false, error: `A senha deve ter pelo menos ${MIN_LENGTH} caracteres.` };
    if (/\s/.test(pwd))
      return { valid: false, error: 'A senha não pode conter espaços.' };
    if (COMMON_PASSWORDS.has(pwd.toLowerCase()))
      return { valid: false, error: 'Essa senha é muito comum e fácil de adivinhar. Escolha outra.' };
    if (hasRepeatedChar(pwd))
      return { valid: false, error: 'Evite repetir o mesmo caractere várias vezes (ex.: 1111, aaaa).' };
    if (hasLongSequence(pwd))
      return { valid: false, error: 'Evite sequências óbvias (ex.: 12345, abcdef).' };
    if (hasKeyboardPattern(pwd))
      return { valid: false, error: 'Evite padrões de teclado (ex.: qwerty, asdf).' };
    return { valid: true, error: null };
  }

  // Estimativa simples de força (0-4) só para a barra visual — não bloqueia nada.
  function estimateStrength(password) {
    const pwd = String(password || '');
    if (!pwd) return 0;
    let score = 0;
    if (pwd.length >= 8)  score++;
    if (pwd.length >= 12) score++;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
    if (/\d/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    // Penaliza padrões óbvios
    const bad = validatePassword(pwd);
    if (!bad.valid && bad.error && !bad.error.includes('pelo menos')) score = Math.min(score, 1);
    return Math.min(score, 4);
  }

  global.PasswordPolicy = { validatePassword, estimateStrength, MIN_LENGTH };
})(window);
