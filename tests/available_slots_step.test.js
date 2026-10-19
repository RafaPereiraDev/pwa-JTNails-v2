require('dotenv').config();
const http = require('http');
const express = require('express');
const { query, getAll, getOne } = require('../src/database/db');

const app = express();
app.use(express.json());
app.use('/api/public', require('../src/routes/public'));

function makeGet(server, path) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const options = {
      hostname: '127.0.0.1',
      port: addr.port,
      path,
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(body);
        } catch (_) {
          json = body;
        }
        resolve({ status: res.statusCode, body: json });
      });
    });

    req.on('error', reject);
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
  console.log(' TESTE DE GERAÇÃO DE SLOTS (STEP DE 45 MINUTOS) E CONFLITOS');
  console.log('=============================================================\n');

  const prof = await getOne(
    "SELECT id, name, work_start_time::text AS work_start_time, work_end_time::text AS work_end_time FROM professionals WHERE active = TRUE ORDER BY id LIMIT 1"
  );
  assert(Boolean(prof), `Profissional ativa encontrada: ${prof.name}`);

  // Garante que conhecemos o expediente para validar
  const profStart = (prof.work_start_time || '08:00').slice(0, 5);
  const profEnd = (prof.work_end_time || '19:30').slice(0, 5);
  console.log(`Profissional: ${prof.name} (${profStart} às ${profEnd})`);

  const svcs = await getAll("SELECT id, name, duration FROM services WHERE active = TRUE ORDER BY duration ASC");
  assert(svcs.length >= 1, `Serviços ativos encontrados: ${svcs.length}`);
  const svc45 = svcs.find(s => s.duration === 45) || svcs[0];

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));

  // Escolhe uma data futura segura (uma quarta-feira, sem conflitos conhecidos)
  // 2032-03-10 é uma quarta-feira
  const testDate = '2032-03-10';

  try {
    // Limpa eventuais resíduos de testes anteriores nesta data
    await query("DELETE FROM appointments WHERE date = $1", [testDate]);
    await query("DELETE FROM blocked_times WHERE date = $1", [testDate]);

    // ─────────────────────────────────────────────────────────────────────────
    // TESTE 1: Progressão em saltos de 45 minutos a partir do início do expediente
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[TESTE 1] Validando step de 45 minutos na geração de horários...');
    const res1 = await makeGet(server, `/api/public/available-slots?date=${testDate}&professional_id=${prof.id}&service_id=${svc45.id}`);
    assert(res1.status === 200, `Status 200 retornado (recebido: ${res1.status})`);
    assert(Array.isArray(res1.body.slots), 'Campo slots é um array');
    assert(res1.body.slots.length > 0, `Pelo menos 1 horário gerado (gerados: ${res1.body.slots.length})`);

    const slots = res1.body.slots;
    console.log(`  Slots gerados: ${slots.join(', ')}`);

    // Valida que o primeiro slot começa no início do expediente (se duracao couber)
    assert(slots[0] === profStart, `Primeiro slot é o início do expediente (${profStart})`);

    // Valida que a diferença entre slots consecutivos é de exatamente 45 minutos
    for (let i = 1; i < slots.length; i++) {
      const [hPrev, mPrev] = slots[i - 1].split(':').map(Number);
      const [hCurr, mCurr] = slots[i].split(':').map(Number);
      const diff = (hCurr * 60 + mCurr) - (hPrev * 60 + mPrev);
      assert(diff === 45, `Intervalo entre ${slots[i - 1]} e ${slots[i]} é exatamente 45 minutos (obtido: ${diff} min)`);
    }

    // Se o expediente for 08:00, os horários esperados devem ser 08:00, 08:45, 09:30, 10:15...
    if (profStart === '08:00') {
      const expectedPrefix = ['08:00', '08:45', '09:30', '10:15', '11:00'];
      for (let i = 0; i < expectedPrefix.length; i++) {
        assert(slots[i] === expectedPrefix[i], `Slot ${i} é ${expectedPrefix[i]} (obtido: ${slots[i]})`);
      }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TESTE 2: Respeito ao fim do expediente
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[TESTE 2] Validando que nenhum horário ultrapassa o fim do expediente...');
    const [hEnd, mEnd] = profEnd.split(':').map(Number);
    const endMinutes = hEnd * 60 + mEnd;

    for (const s of slots) {
      const [h, m] = s.split(':').map(Number);
      const slotEndMinutes = (h * 60 + m) + svc45.duration;
      assert(
        slotEndMinutes <= endMinutes,
        `Horário ${s} + duração (${svc45.duration} min) termina às ${Math.floor(slotEndMinutes/60)}:${String(slotEndMinutes%60).padStart(2,'0')} <= expediente ${profEnd}`
      );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TESTE 3: Verificação de Conflitos com Agendamento Existente
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[TESTE 3] Validando omissão de slots que conflitam com agendamentos existentes no banco...');
    // Criamos um agendamento fictício no banco: por exemplo, das 09:30 às 10:30
    // Isso deve omitir o slot 09:30 (pois 09:30 a 10:15 colide com 09:30-10:30)
    // E também deve omitir 08:45 se a duração do serviço (ex: 60min) ultrapassar 09:30!
    const clientRow = await getOne("SELECT id FROM clients LIMIT 1");
    const clientId = clientRow ? clientRow.id : (await query("INSERT INTO clients (name, phone) VALUES ('Cli Teste', '11999990000') RETURNING id")).rows[0].id;

    await query(`
      INSERT INTO appointments (professional_id, service_id, client_id, date, start_time, end_time, price, status)
      VALUES ($1, $2, $3, $4, '09:30', '10:15', 50, 'confirmed')
    `, [prof.id, svc45.id, clientId, testDate]);

    const res3 = await makeGet(server, `/api/public/available-slots?date=${testDate}&professional_id=${prof.id}&service_id=${svc45.id}`);
    assert(res3.status === 200, `Status 200 retornado`);
    const slotsWithConflict = res3.body.slots;
    console.log(`  Slots restantes após agendamento às 09:30: ${slotsWithConflict.join(', ')}`);

    assert(!slotsWithConflict.includes('09:30'), 'Slot 09:30 foi omitido com sucesso por conflito');
    assert(slotsWithConflict.includes('08:00'), 'Slot 08:00 permanece disponível');
    assert(slotsWithConflict.includes('08:45'), 'Slot 08:45 permanece disponível (termina às 09:30)');
    assert(slotsWithConflict.includes('10:15'), 'Slot 10:15 permanece disponível (inicia após término do agendamento às 10:15)');

    // ─────────────────────────────────────────────────────────────────────────
    // TESTE 4: Verificação de Conflitos com Bloqueio de Horário (blocked_times)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[TESTE 4] Validando omissão de slots colidentes com bloqueios...');
    await query(`
      INSERT INTO blocked_times (professional_id, date, start_time, end_time, reason)
      VALUES ($1, $2, '14:00', '14:45', 'Almoço/Intervalo')
    `, [prof.id, testDate]);

    const res4 = await makeGet(server, `/api/public/available-slots?date=${testDate}&professional_id=${prof.id}&service_id=${svc45.id}`);
    const slotsWithBlock = res4.body.slots;
    console.log(`  Slots restantes após bloqueio às 14:00: ${slotsWithBlock.join(', ')}`);

    assert(!slotsWithBlock.includes('14:00'), 'Slot 14:00 foi omitido por conflito com blocked_times');
    assert(slotsWithBlock.includes('13:15'), 'Slot 13:15 permanece disponível');
    assert(slotsWithBlock.includes('14:45'), 'Slot 14:45 permanece disponível');

    // ─────────────────────────────────────────────────────────────────────────
    // TESTE 5: Dias Fechados (Domingo / Segunda)
    // ─────────────────────────────────────────────────────────────────────────
    console.log('\n[TESTE 5] Validando dias fechados (domingos e segundas)...');
    // 2032-03-07 é Domingo, 2032-03-08 é Segunda
    const resDom = await makeGet(server, `/api/public/available-slots?date=2032-03-07&professional_id=${prof.id}&service_id=${svc45.id}`);
    assert(resDom.status === 200, 'Status 200 para domingo');
    assert(resDom.body.slots.length === 0, 'Domingo retorna array vazio de slots');

    const resSeg = await makeGet(server, `/api/public/available-slots?date=2032-03-08&professional_id=${prof.id}&service_id=${svc45.id}`);
    assert(resSeg.status === 200, 'Status 200 para segunda-feira');
    assert(resSeg.body.slots.length === 0, 'Segunda-feira retorna array vazio de slots');

    // Limpa dados criados para o teste
    await query("DELETE FROM appointments WHERE date = $1", [testDate]);
    await query("DELETE FROM blocked_times WHERE date = $1", [testDate]);
    console.log('\n  ✓ Limpeza dos dados de teste executada com sucesso.');

    console.log('\n=============================================================');
    console.log(' TODOS OS TESTES DE STEP 45 MIN PASSARAM COM SUCESSO! 🎉');
    console.log('=============================================================\n');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('\nErro na execução do teste:', err);
  process.exit(1);
});
