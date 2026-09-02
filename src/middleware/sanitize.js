/**
 * Middleware de sanitização de entrada.
 * - Apara espaços em branco no início/fim de todas as strings do body
 * - Limita o comprimento máximo de qualquer string para evitar abuso
 * - Remove caracteres de controle invisíveis
 *
 * Não substitui a validação específica de cada rota — é uma camada base
 * aplicada a todas as requisições com corpo JSON.
 */

const MAX_STRING_LENGTH = 5000;

// Campos que carregam conteúdo grande e legítimo (ex: imagem em base64).
// Não devem ser truncados pelo limite de string; cada rota valida o próprio tamanho.
const EXEMPT_KEYS = new Set(['photo']);

function sanitizeValue(value, key) {
  if (typeof value === 'string') {
    // Remove caracteres de controle (exceto \n, \r, \t) e apara
    let clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
    // Não trunca campos isentos (data URLs de imagem, etc.)
    if (!EXEMPT_KEYS.has(key) && clean.length > MAX_STRING_LENGTH) {
      clean = clean.slice(0, MAX_STRING_LENGTH);
    }
    return clean;
  }
  if (Array.isArray(value)) {
    return value.map(v => sanitizeValue(v, key));
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) {
      out[k] = sanitizeValue(value[k], k);
    }
    return out;
  }
  return value;
}

function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body, null);
  }
  next();
}

module.exports = { sanitizeBody };
