# Migração para o Railway

Guia para migrar o sistema do Render para o Railway. O código já está pronto — a
migração é basicamente configuração. Tempo estimado: 20–30 minutos.

## Por que Railway
- **Não hiberna** (no Render free, o app dormia).
- Deploy simples via GitHub e PostgreSQL integrado.

---

## Passo 1 — Criar o projeto e o banco
1. Crie uma conta em https://railway.app e faça login com o GitHub.
2. **New Project → Deploy from GitHub repo** e escolha `RafaPereiraDev/Tainara-nails`.
3. No mesmo projeto: **New → Database → Add PostgreSQL**.
4. O Railway cria a variável `DATABASE_URL` automaticamente. Se o serviço do app
   não enxergar, copie a `DATABASE_URL` do banco (aba Variables do Postgres) e cole
   nas variáveis do serviço do app (use a referência `${{Postgres.DATABASE_URL}}`).

## Passo 2 — Variáveis de ambiente (no serviço do app)
Defina em **Variables**:

```
NODE_ENV=production
JWT_SECRET=<gere um segredo forte>
JWT_EXPIRES_IN=12h
CLIENT_JWT_EXPIRES_IN=30d
CORS_ORIGINS=https://SEU_DOMINIO.up.railway.app
SEED_ADMIN_PASSWORD=<defina>
SEED_TAINARA_PASSWORD=<defina>
SEED_PROF2_PASSWORD=<defina>
VAPID_PUBLIC_KEY=<sua chave>
VAPID_PRIVATE_KEY=<sua chave>
VAPID_SUBJECT=mailto:contato@seudominio.com
```

Notas:
- `PORT` — NÃO defina manualmente; o Railway injeta sozinho (o código lê `process.env.PORT`).
- As chaves VAPID são usadas pela notificação push de novo agendamento.

## Passo 3 — SSL do banco
O código já trata SSL automaticamente (`src/database/db.js`):
- Se `DATABASE_URL` apontar para `localhost`, SSL desligado.
- Caso contrário, SSL ligado. Para o Railway, o padrão atual (`rejectUnauthorized:false`)
  funciona. Se quiser verificação estrita, defina `DATABASE_CA` com o certificado do
  provedor (o Railway normalmente não exige).

## Passo 4 — Migrar os dados do banco (Render → Railway)
As tabelas são criadas sozinhas no primeiro boot (o `initDatabase` roda as migrations).
Para levar os DADOS existentes (clientes, agendamentos, etc.):

1. Faça um dump do Postgres do Render:
   ```
   pg_dump "<DATABASE_URL_DO_RENDER>" --no-owner --no-privileges -f backup.sql
   ```
2. Restaure no Postgres do Railway:
   ```
   psql "<DATABASE_URL_DO_RAILWAY>" -f backup.sql
   ```
Se for começar do zero (sem migrar dados), pule este passo — o seed cria o
usuário master e as profissionais na primeira inicialização.

## Passo 5 — Deploy e domínio
1. O Railway builda e sobe automaticamente (usa `npm start` → `node server.js`).
2. Em **Settings → Networking → Generate Domain**, gere o domínio público.
3. Ajuste `CORS_ORIGINS` para o domínio final.
4. Acesse `/agendar` (área pública) e `/` (painel) para validar.

## Rollback
O Render continua funcionando em paralelo até você apontar o tráfego para o Railway.
Se algo der errado, é só voltar a usar a URL do Render — nada é destrutivo.
