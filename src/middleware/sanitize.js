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

function sanitizeValue(value) {
  if (typeof value === 'string') {
    // Remove caracteres de controle (exceto \n, \r, \t) e apara
    let clean = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
    if (clean.length > MAX_STRING_LENGTH) {
      clean = clean.slice(0, MAX_STRING_LENGTH);
    }
    return clean;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value)) {
      out[key] = sanitizeValue(value[key]);
    }
    return out;
  }
  return value;
}

function sanitizeBody(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body);
  }
  next();
}

module.exports = { sanitizeBody };
