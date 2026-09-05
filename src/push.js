/**
 * Camada de Web Push (notificações do navegador) via VAPID.
 * Envia notificações para os dispositivos inscritos de um usuário.
 */
const webpush = require('web-push');
const { getAll, getOne, query } = require('./database/db');

const PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT     = process.env.VAPID_SUBJECT || 'mailto:contato@tainaranails.com';

let enabled = false;
if (PUBLIC_KEY && PRIVATE_KEY) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
  enabled = true;
} else {
  console.warn('[push] VAPID keys ausentes — notificações push desativadas.');
}

/**
 * Envia uma notificação push para todos os dispositivos de um usuário.
 * Respeita a preferência notify_new_appointment. Inclui vibração conforme notify_vibrate.
 * @param {number} userId
 * @param {{title:string, body:string, url?:string}} payload
 */
async function notifyUser(userId, payload) {
  if (!enabled || !userId) return;

  try {
    const user = await getOne(
      'SELECT notify_new_appointment, notify_vibrate FROM users WHERE id = $1',
      [userId]
    );
    if (!user || user.notify_new_appointment === false) return;

    const subs = await getAll(
      'SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1',
      [userId]
    );
    if (subs.length === 0) return;

    const data = JSON.stringify({
      title: payload.title,
      body:  payload.body,
      url:   payload.url || '/',
      vibrate: user.notify_vibrate === false ? [] : [200, 100, 200],
    });

    await Promise.all(subs.map(async (s) => {
      const subscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      };
      try {
        await webpush.sendNotification(subscription, data);
      } catch (err) {
        // 404/410 = inscrição expirada/inválida → remove do banco
        if (err.statusCode === 404 || err.statusCode === 410) {
          await query('DELETE FROM push_subscriptions WHERE id = $1', [s.id]).catch(() => {});
        } else {
          console.error('[push] envio falhou:', err.statusCode || err.message);
        }
      }
    }));
  } catch (e) {
    console.error('[push] notifyUser erro:', e.message);
  }
}

/**
 * Descobre o user_id vinculado a uma profissional (para notificar a dona da agenda).
 * @param {number} professionalId
 * @returns {Promise<number|null>}
 */
async function getUserIdByProfessional(professionalId) {
  if (!professionalId) return null;
  const row = await getOne(
    'SELECT id FROM users WHERE professional_id = $1 AND active = TRUE LIMIT 1',
    [professionalId]
  );
  return row ? row.id : null;
}

module.exports = { notifyUser, getUserIdByProfessional, PUBLIC_KEY, enabled };
