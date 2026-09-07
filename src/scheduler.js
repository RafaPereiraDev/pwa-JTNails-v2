/**
 * Agendador interno de lembretes (push).
 *
 * No Railway (que NÃO hiberna) este scheduler roda dentro do próprio processo,
 * dispensando cron externo. Ative com ENABLE_INTERNAL_CRON=true.
 *
 * Faz duas coisas:
 *  1) Aviso de "atendimento agora" para a profissional (a cada 5 min).
 *  2) Lembrete de aniversariantes da semana (uma vez por dia, às segundas de manhã).
 *
 * As mesmas rotas /api/public/cron/* continuam existindo para quem preferir
 * disparar por um agendador externo (ex.: no Render).
 */
const cron = require('node-cron');
const { getAll, getOne, query } = require('./database/db');
const { notifyUser, getUserIdByProfessional } = require('./push');

// Igual ao helper de public.js: janela seg-dom da semana do aniversário,
// transferindo para a semana seguinte quando cai em sábado/domingo.
function isWithinBirthdayWindow(birthDate, targetStr) {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}/.test(birthDate)) return false;
  const [ , bm, bd] = birthDate.slice(0, 10).split('-').map(Number);
  const [ty] = targetStr.split('-').map(Number);
  const bday = new Date(ty, bm - 1, bd, 12, 0, 0);
  if (isNaN(bday)) return false;
  const dow = bday.getDay();
  const isWeekend = dow === 0 || dow === 6;
  const diffToMonday = (dow === 0 ? -6 : 1 - dow);
  const monday = new Date(bday); monday.setDate(bday.getDate() + diffToMonday);
  if (isWeekend) monday.setDate(monday.getDate() + 7);
  const start = new Date(monday); start.setHours(0, 0, 0, 0);
  const end = new Date(monday); end.setDate(monday.getDate() + 6); end.setHours(23, 59, 59, 999);
  const toStr = (d) => d.toLocaleDateString('en-CA');
  return targetStr >= toStr(start) && targetStr <= toStr(end);
}

// (1) Lembrete no horário do atendimento — notifica a profissional
async function runUpcomingReminders() {
  const rows = await getAll(`
    SELECT a.id, a.professional_id,
      a.start_time::text AS start_time,
      a.fidelidade_resgatada, a.cupom_aniversario,
      c.name AS client_name, c.birth_date::text AS birth_date
    FROM appointments a
    JOIN clients c ON a.client_id = c.id
    WHERE a.status IN ('scheduled','confirmed','in_progress')
      AND a.reminder_sent = FALSE
      AND a.date = (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
      AND a.start_time BETWEEN
            ((NOW() AT TIME ZONE 'America/Sao_Paulo') - INTERVAL '6 minutes')::time
        AND ((NOW() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '1 minute')::time
  `);

  for (const a of rows) {
    const combo = a.fidelidade_resgatada && a.cupom_aniversario;
    const hora = String(a.start_time).slice(0, 5);
    let payload;
    if (a.cupom_aniversario && a.birth_date && /^\d{4}-\d{2}-\d{2}/.test(a.birth_date)) {
      const [ , mm, dd] = a.birth_date.slice(0, 10).split('-');
      const tipo = combo ? 'Combo Duplo' : 'Aniversário';
      payload = {
        title: '🎁 ATENDIMENTO AGORA (Aplicar Desconto!)',
        body:  `${a.client_name} (Aniversário: ${dd}/${mm}). Lembre-se de aplicar o desconto de ${tipo} na cobrança!`,
        url:   '/',
      };
    } else if (a.fidelidade_resgatada) {
      payload = {
        title: '🎁 ATENDIMENTO AGORA (Aplicar Desconto!)',
        body:  `${a.client_name} às ${hora}. Lembre-se de aplicar o desconto de Fidelidade na cobrança!`,
        url:   '/',
      };
    } else {
      payload = { title: '⏰ Atendimento agora', body: `${a.client_name} às ${hora}.`, url: '/' };
    }
    const userId = await getUserIdByProfessional(a.professional_id);
    if (userId) notifyUser(userId, payload);
    await query('UPDATE appointments SET reminder_sent = TRUE WHERE id = $1', [a.id]);
  }
  return rows.length;
}

// (2) Lembrete de aniversariantes da semana — notifica cada profissional
async function runBirthdayReminders() {
  const nowRow = await getOne(`SELECT (NOW() AT TIME ZONE 'America/Sao_Paulo')::date::text AS today`);
  const todayStr = nowRow.today;
  const rows = await getAll(`SELECT id, name, phone, birth_date::text AS birth_date FROM clients WHERE birth_date IS NOT NULL`);
  const aniversariantes = rows.filter(c => isWithinBirthdayWindow(c.birth_date, todayStr));
  if (!aniversariantes.length) return 0;

  const nomes = aniversariantes.map(c => c.name.split(' ')[0]).join(', ');
  const profs = await getAll('SELECT id FROM professionals WHERE active = TRUE');
  for (const p of profs) {
    const userId = await getUserIdByProfessional(p.id);
    if (userId) {
      notifyUser(userId, {
        title: '🎂 Aniversariantes da semana',
        body:  `Presenteie com desconto: ${nomes}. Avise para agendarem!`,
        url:   '/',
      });
    }
  }
  return aniversariantes.length;
}

// Inicia os agendadores (node-cron). Só faz efeito com ENABLE_INTERNAL_CRON=true.
// Fuso: America/Sao_Paulo para bater com o horário de funcionamento do salão.
function startScheduler() {
  if (String(process.env.ENABLE_INTERNAL_CRON || '').toLowerCase() !== 'true') {
    console.log('[scheduler] Cron interno desativado (defina ENABLE_INTERNAL_CRON=true para ativar).');
    return;
  }
  const tz = 'America/Sao_Paulo';
  console.log('[scheduler] Cron interno ativado (node-cron).');

  // Aviso de "atendimento agora" — a cada 5 minutos
  cron.schedule('*/5 * * * *', () => {
    runUpcomingReminders()
      .then(n => { if (n) console.log(`[scheduler] upcoming-reminders: ${n} atendimento(s) verificados.`); })
      .catch(e => console.error('[scheduler upcoming]', e.message));
  }, { timezone: tz });

  // Aniversariantes da semana — toda segunda às 08:00
  cron.schedule('0 8 * * 1', () => {
    runBirthdayReminders()
      .then(n => console.log(`[scheduler] birthday-reminders: ${n} aniversariante(s).`))
      .catch(e => console.error('[scheduler birthday]', e.message));
  }, { timezone: tz });
}

module.exports = { startScheduler, runUpcomingReminders, runBirthdayReminders };
