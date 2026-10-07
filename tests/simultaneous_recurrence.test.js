require('dotenv').config();
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');
const { query, getAll } = require('../src/database/db');

// Configuração do app de teste
const app = express();
app.use(express.json());
app.use('/api/appointments', require('../src/routes/appointments'));

// Helper para fazer requisições HTTP locais no app Express
function makeRequest(server, method, path, body, token) {
  return new Promise((resolve, reject) => {
    const dataString = body ? JSON.stringify(body) : '';
    const addr = server.address();
    const options = {
      hostname: '127.0.0.1',
      port: addr.port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(dataString),
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
      }
    };

    const req = http.request(options, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(responseBody);
        } catch (_) {
          json = responseBody;
        }
        resolve({ status: res.statusCode, body: json });
      });
    });

    req.on('error', reject);
    if (dataString) req.write(dataString);
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FALHA: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function runTests() {
  console.log('\n=============================================================');
  console.log(' INICIANDO TESTES AUTOMATIZADOS DE RECORRÊNCIA SIMULTÂNEA');
  console.log('=============================================================\n');

  // Garante que group_id existe na tabela
  await query('ALTER TABLE appointments ADD COLUMN IF NOT EXISTS group_id TEXT');
  await query('CREATE INDEX IF NOT EXISTS idx_appointments_group ON appointments(group_id)');

  // Busca dados de apoio (profissionais e cliente para os testes)
  const profs = await getAll('SELECT id, name FROM professionals ORDER BY id');
  assert(profs.length >= 2, `Pelo menos 2 profissionais no banco (encontradas: ${profs.length})`);
  const prof1 = profs[0];
  const prof2 = profs[1];

  const svcs = await getAll('SELECT id, name, duration, price FROM services WHERE active = TRUE ORDER BY id');
  assert(svcs.length >= 2, `Pelo menos 2 serviços ativos no banco (encontrados: ${svcs.length})`);
  const svc1 = svcs[0];
  const svc2 = svcs[1];

  let client = await getAll('SELECT id, name FROM clients LIMIT 1');
  if (client.length === 0) {
    const res = await query("INSERT INTO clients (name, phone) VALUES ('Cliente Teste', '11999998888') RETURNING id, name");
    client = res.rows;
  }
  const clientId = client[0].id;

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  const token = jwt.sign({ id: 1, role: 'master', name: 'Master' }, process.env.JWT_SECRET);

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // TESTE 1: 52 sessões semanais simultâneas (104 agendamentos)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[TESTE 1] Criação de 52 sessões semanais simultâneas (104 agendamentos)...');
    const res1 = await makeRequest(server, 'POST', '/api/appointments', {
      client_id: clientId,
      date: '2031-01-07', // Terça-feira no futuro
      start_time: '09:00',
      plan: 'weekly',
      sessions_count: 52,
      allow_overlap: true,
      simultaneous: [
        { professional_id: prof1.id, service_ids: [svc1.id], price: 50 },
        { professional_id: prof2.id, service_ids: [svc2.id], price: 60 }
      ]
    }, token);

    assert(res1.status === 201, `Status 201 retornado (recebido: ${res1.status})`);
    assert(res1.body.simultaneous === true, 'Campo simultaneous é true');
    assert(res1.body.created === 104, `Exatamente 104 agendamentos criados (recebido: ${res1.body.created})`);
    assert(res1.body.sessions_count === 52, `Exatamente 52 sessões confirmadas (recebido: ${res1.body.sessions_count})`);
    assert(Boolean(res1.body.series_id), `series_id gerado: ${res1.body.series_id}`);

    const seriesId1 = res1.body.series_id;
    const dbAppts1 = await getAll(`
      SELECT id, professional_id, date::text, start_time::text, group_id, series_id
      FROM appointments
      WHERE series_id = $1
      ORDER BY date, start_time, professional_id
    `, [seriesId1]);

    assert(dbAppts1.length === 104, `104 registros encontrados no banco para series_id ${seriesId1}`);

    const distinctDates1 = new Set(dbAppts1.map(a => a.date));
    assert(distinctDates1.size === 52, `Exatamente 52 datas distintas geradas`);

    const distinctGroups1 = new Set(dbAppts1.map(a => a.group_id));
    assert(distinctGroups1.size === 52, `Exatamente 52 group_ids distintos (1 por data da série)`);

    // Valida cada par em cada data
    for (const d of distinctDates1) {
      const pair = dbAppts1.filter(a => a.date === d);
      assert(pair.length === 2, `Data ${d} possui exatamente 2 profissionais agendadas`);
      assert(pair[0].start_time === '09:00:00' && pair[1].start_time === '09:00:00', `Par na data ${d} mantém o mesmo start_time (09:00:00)`);
      assert(pair[0].group_id === pair[1].group_id, `Par na data ${d} compartilha o mesmo group_id (${pair[0].group_id})`);
      assert(pair[0].series_id === seriesId1 && pair[1].series_id === seriesId1, `Par na data ${d} compartilha o mesmo series_id`);
      const pairProfIds = pair.map(a => a.professional_id).sort();
      assert(pairProfIds[0] === Math.min(prof1.id, prof2.id) && pairProfIds[1] === Math.max(prof1.id, prof2.id), `Par na data ${d} contém as duas profissionais distintas`);
    }

    // Limpa dados do teste 1
    await query('DELETE FROM appointment_services WHERE appointment_id IN (SELECT id FROM appointments WHERE series_id = $1)', [seriesId1]);
    await query('DELETE FROM appointments WHERE series_id = $1', [seriesId1]);
    console.log('  ✓ Dados do Teste 1 limpos com sucesso.');

    // ─────────────────────────────────────────────────────────────────────────
    // TESTE 2: Recorrência quinzenal simultânea (6 sessões = 12 agendamentos)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[TESTE 2] Criação de recorrência quinzenal simultânea (6 sessões = 12 agendamentos)...');
    const res2 = await makeRequest(server, 'POST', '/api/appointments', {
      client_id: clientId,
      date: '2031-02-04',
      start_time: '14:30',
      frequency: 'biweekly',
      sessions_count: 6,
      allow_overlap: true,
      simultaneous: [
        { professional_id: prof1.id, service_ids: [svc1.id], price: 45 },
        { professional_id: prof2.id, service_ids: [svc2.id], price: 55 }
      ]
    }, token);

    assert(res2.status === 201, `Status 201 retornado (recebido: ${res2.status})`);
    assert(res2.body.simultaneous === true, 'Campo simultaneous é true');
    assert(res2.body.created === 12, `Exatamente 12 agendamentos criados (recebido: ${res2.body.created})`);
    assert(res2.body.sessions_count === 6, `Exatamente 6 sessões (recebido: ${res2.body.sessions_count})`);

    const seriesId2 = res2.body.series_id;
    const dbAppts2 = await getAll(`
      SELECT id, professional_id, date::text, start_time::text, group_id, series_id
      FROM appointments
      WHERE series_id = $1
      ORDER BY date, start_time, professional_id
    `, [seriesId2]);

    assert(dbAppts2.length === 12, `12 registros encontrados no banco para series_id ${seriesId2}`);
    const distinctDates2 = [...new Set(dbAppts2.map(a => a.date))].sort();
    assert(distinctDates2.length === 6, `Exatamente 6 datas quinzenais geradas`);

    // Valida intervalo de 14 dias entre datas consecutivas
    for (let i = 0; i < distinctDates2.length - 1; i++) {
      const d1 = new Date(distinctDates2[i] + 'T12:00:00Z');
      const d2 = new Date(distinctDates2[i+1] + 'T12:00:00Z');
      const diffDays = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
      assert(diffDays === 14, `Intervalo de ${diffDays} dias entre ${distinctDates2[i]} e ${distinctDates2[i+1]} é exatamente 14 dias`);
    }

    const distinctGroups2 = new Set(dbAppts2.map(a => a.group_id));
    assert(distinctGroups2.size === 6, `Exatamente 6 group_ids distintos (1 por data da série)`);

    for (const d of distinctDates2) {
      const pair = dbAppts2.filter(a => a.date === d);
      assert(pair.length === 2, `Data ${d} possui exatamente 2 profissionais`);
      assert(pair[0].start_time === '14:30:00' && pair[1].start_time === '14:30:00', `Mesmo start_time 14:30:00`);
      assert(pair[0].group_id === pair[1].group_id, `Compartilham o mesmo group_id na data ${d}`);
      assert(pair[0].series_id === seriesId2 && pair[1].series_id === seriesId2, `Compartilham o mesmo series_id`);
    }

    // Limpa dados do teste 2
    await query('DELETE FROM appointment_services WHERE appointment_id IN (SELECT id FROM appointments WHERE series_id = $1)', [seriesId2]);
    await query('DELETE FROM appointments WHERE series_id = $1', [seriesId2]);
    console.log('  ✓ Dados do Teste 2 limpos com sucesso.');

    // ─────────────────────────────────────────────────────────────────────────
    // TESTE 3: Recorrência mensal simultânea (4 sessões = 8 agendamentos)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[TESTE 3] Criação de recorrência mensal simultânea (4 sessões = 8 agendamentos)...');
    const res3 = await makeRequest(server, 'POST', '/api/appointments', {
      client_id: clientId,
      date: '2031-03-10',
      start_time: '11:00',
      recurrence: {
        frequency: 'monthly',
        count: 4
      },
      allow_overlap: true,
      simultaneous: [
        { professional_id: prof1.id, service_ids: [svc1.id], price: 70 },
        { professional_id: prof2.id, service_ids: [svc2.id], price: 80 }
      ]
    }, token);

    assert(res3.status === 201, `Status 201 retornado (recebido: ${res3.status})`);
    assert(res3.body.created === 8, `Exatamente 8 agendamentos criados (recebido: ${res3.body.created})`);
    assert(res3.body.sessions_count === 4, `Exatamente 4 sessões mensais (recebido: ${res3.body.sessions_count})`);

    const seriesId3 = res3.body.series_id;
    const dbAppts3 = await getAll(`
      SELECT id, professional_id, date::text, start_time::text, group_id, series_id
      FROM appointments
      WHERE series_id = $1
      ORDER BY date, start_time, professional_id
    `, [seriesId3]);

    assert(dbAppts3.length === 8, `8 registros encontrados no banco para series_id ${seriesId3}`);
    const distinctDates3 = [...new Set(dbAppts3.map(a => a.date))].sort();
    assert(distinctDates3.length === 4, `Exatamente 4 datas mensais geradas`);
    assert(distinctDates3[0] === '2031-03-10', 'Data 1: 2031-03-10');
    assert(distinctDates3[1] === '2031-04-10', 'Data 2: 2031-04-10');
    assert(distinctDates3[2] === '2031-05-10', 'Data 3: 2031-05-10');
    assert(distinctDates3[3] === '2031-06-10', 'Data 4: 2031-06-10');

    for (const d of distinctDates3) {
      const pair = dbAppts3.filter(a => a.date === d);
      assert(pair.length === 2, `Data ${d} possui par de profissionais`);
      assert(pair[0].start_time === '11:00:00' && pair[1].start_time === '11:00:00', `Mesmo start_time 11:00:00`);
      assert(pair[0].group_id === pair[1].group_id, `Compartilham o mesmo group_id na data ${d}`);
      assert(pair[0].series_id === seriesId3 && pair[1].series_id === seriesId3, `Compartilham o mesmo series_id`);
    }

    // Limpa dados do teste 3
    await query('DELETE FROM appointment_services WHERE appointment_id IN (SELECT id FROM appointments WHERE series_id = $1)', [seriesId3]);
    await query('DELETE FROM appointments WHERE series_id = $1', [seriesId3]);
    console.log('  ✓ Dados do Teste 3 limpos com sucesso.');

    // ─────────────────────────────────────────────────────────────────────────
    // TESTE 4: Validação de Conflito Atômico e Retorno das Datas Colidentes
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[TESTE 4] Validação de conflito de horário com retorno de datas colidentes e rollback atômico...');
    // Cria um agendamento prévio conflitante na 2ª data da série
    const conflictDate = '2031-07-15';
    const preConflict = await query(`
      INSERT INTO appointments
        (client_id, professional_id, service_id, date, start_time, end_time, price, status)
      VALUES ($1, $2, $3, $4, '15:00', '16:00', 50, 'scheduled')
      RETURNING id
    `, [clientId, prof1.id, svc1.id, conflictDate]);
    const conflictApptId = preConflict.rows[0].id;

    // Tenta criar série semanal a partir de 2031-07-08 às 15:00 sem allow_overlap
    const res4 = await makeRequest(server, 'POST', '/api/appointments', {
      client_id: clientId,
      date: '2031-07-08',
      start_time: '15:00',
      plan: 'weekly',
      sessions_count: 3,
      allow_overlap: false, // Encaixe DESMARCADO
      simultaneous: [
        { professional_id: prof1.id, service_ids: [svc1.id], price: 50 },
        { professional_id: prof2.id, service_ids: [svc2.id], price: 60 }
      ]
    }, token);

    assert(res4.status === 409, `Retornou HTTP 409 Conflict (recebido: ${res4.status})`);
    assert(Array.isArray(res4.body.conflicting_dates), 'Campo conflicting_dates é um array');
    assert(res4.body.conflicting_dates.includes(conflictDate), `Lista de colisão contém a data exata ${conflictDate}`);

    // Verifica que NENHUM agendamento da série foi inserido (atomicidade/rollback seguro)
    const checkOrphans = await getAll(`
      SELECT id FROM appointments
      WHERE client_id = $1 AND date IN ('2031-07-08', '2031-07-22')
    `, [clientId]);
    assert(checkOrphans.length === 0, `Nenhum agendamento órfão criado no banco após o conflito (rollback seguro confirmado)`);

    // Remove o agendamento de conflito prévio
    await query('DELETE FROM appointments WHERE id = $1', [conflictApptId]);
    console.log('  ✓ Teste 4 de conflito e atomicidade validado com sucesso.');

    console.log('\n=============================================================');
    console.log(' TODOS OS TESTES PASSARAM COM SUCESSO! 🎉');
    console.log('=============================================================\n');

  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('\n❌ ERRO NOS TESTES:', err);
  process.exit(1);
});
