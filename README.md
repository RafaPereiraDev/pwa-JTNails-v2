# Tainara Nails — Sistema de Gestão

Sistema web de gestão para salão de manicure/nail design: agenda, clientes, serviços, profissionais, controle financeiro e relatórios.

## Stack

- **Backend:** Node.js + Express
- **Banco de dados:** SQLite (via `node:sqlite`, nativo do Node 22+)
- **Autenticação:** JWT + bcryptjs
- **Frontend:** HTML/CSS/JS (SPA vanilla)
- **Segurança:** helmet, rate limiting, CORS configurável, sanitização de entrada

## Requisitos

- Node.js 22 ou superior

## Como rodar localmente

1. Instale as dependências:
   ```bash
   npm install
   ```

2. Crie o arquivo `.env` a partir do modelo:
   ```bash
   cp .env.example .env
   ```
   Edite o `.env` e defina ao menos o `JWT_SECRET`. Para gerar um segredo forte:
   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

3. Inicie o servidor:
   ```bash
   npm start
   ```

4. Acesse `http://localhost:3000`.

Na primeira execução com banco vazio, as credenciais iniciais são exibidas no console (em ambiente de desenvolvimento).

## Variáveis de ambiente

Veja `.env.example` para a lista completa. As principais:

| Variável | Descrição |
|---|---|
| `PORT` | Porta do servidor (padrão 3000) |
| `JWT_SECRET` | Segredo para assinar tokens JWT (obrigatório) |
| `JWT_EXPIRES_IN` | Expiração do token (ex: `12h`) |
| `NODE_ENV` | `development` ou `production` |
| `CORS_ORIGINS` | Origens permitidas em produção (separadas por vírgula) |
| `SEED_*_PASSWORD` | Senhas iniciais do seed (obrigatórias em produção) |

## Scripts

- `npm start` — inicia o servidor
- `npm run dev` — inicia com hot-reload (nodemon)

## Segurança

- Senhas armazenadas com bcrypt (salt 10)
- Tokens JWT com segredo via variável de ambiente
- Rate limiting nas rotas (login protegido contra força bruta)
- Cabeçalhos de segurança HTTP via helmet
- CORS restrito por ambiente
- Queries SQL parametrizadas
