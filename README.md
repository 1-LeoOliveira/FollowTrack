# Numero de Seguidores

API que cadastra perfis publicos do Instagram e acompanha o numero de
seguidores automaticamente a cada 24 horas, guardando o historico num banco
Postgres. Inclui uma interface web simples em `public/`.

## Aviso importante

Este projeto obtem os dados fazendo scraping da pagina/endpoint publico do
Instagram (nao existe uma API oficial que permita consultar seguidores de
qualquer perfil de terceiros). Isso **viola os Termos de Servico do
Instagram** e pode resultar em bloqueio temporario do IP que faz as
requisicoes se voce monitorar muitos perfis ou rodar com muita frequencia.
IPs de datacenter (Vercel, AWS etc.) tendem a ser bloqueados com mais
frequencia que IPs residenciais. Use por sua conta e risco, preferencialmente
para poucos perfis e com o agendamento padrao de uma vez por dia.

## Como rodar localmente

Requer um banco Postgres acessivel (local via Docker, ou o mesmo banco
hospedado que voce for usar em producao — ver secao de deploy abaixo).

```bash
npm install
cp .env.example .env        # preencha DATABASE_URL e DIRECT_URL
npm run prisma:migrate      # cria as tabelas (primeira vez)
npm run dev                 # sobe a API em http://localhost:3000
```

## Endpoints

- `POST /api/profiles` — cadastra um perfil e faz a primeira coleta
  imediatamente. Body: `{ "username": "danimoraisoficial" }`
- `GET /api/profiles` — lista os perfis cadastrados com a ultima contagem.
- `GET /api/profiles/:username/history?days=30` — historico de seguidores.
- `POST /api/profiles/:username/refresh` — forca uma coleta manual agora.
- `POST /api/profiles/refresh-all` — forca a coleta de todos os perfis agora.
- `DELETE /api/profiles/:username` — para de monitorar o perfil.
- `GET /api/cron/refresh` — usado pelo agendador (ver abaixo); protegido por
  `CRON_SECRET`.

## Agendamento automatico

- **Local / servidor proprio (`npm run dev` ou `npm start`):** um job
  `node-cron` roda dentro do proprio processo Node, disparando a coleta no
  horario definido por `CRON_SCHEDULE` no `.env` (padrao `0 3 * * *`, 3h da
  manha). Exige que o processo fique rodando continuamente.
- **Vercel:** funcoes serverless nao mantêm processo persistente, entao o
  `node-cron` nao funciona la. Em vez disso, o arquivo `vercel.json` declara
  um **Vercel Cron Job** que chama `GET /api/cron/refresh` uma vez por dia.

## Deploy na Vercel

1. Suba o projeto para um repositorio no GitHub e importe-o em
   [vercel.com/new](https://vercel.com/new).
2. Crie um banco Postgres e conecte ao projeto: na aba **Storage** do
   projeto na Vercel, crie um banco (Neon/Vercel Postgres) — isso injeta as
   variaveis de conexao automaticamente. Se preferir usar outro provedor
   (Neon, Supabase, etc.), crie o banco la e configure manualmente as
   variaveis abaixo em **Settings → Environment Variables**:
   - `DATABASE_URL` — connection string **com pool** (usada em runtime pela
     API).
   - `DIRECT_URL` — connection string **direta/sem pool** (usada so para
     rodar migrations).
   - `CRON_SECRET` — qualquer string aleatoria. A Vercel injeta
     automaticamente `Authorization: Bearer <CRON_SECRET>` nas chamadas do
     Cron Job, e a rota `/api/cron/refresh` valida esse header.
3. Rode as migrations contra o banco criado (uma vez, a partir da sua
   maquina, apontando `DATABASE_URL`/`DIRECT_URL` do `.env` para o banco de
   producao):
   ```bash
   npm run prisma:deploy
   ```
4. Faça o deploy (push no Git, ou `npx vercel --prod`). A partir dai, a
   Vercel executa `GET /api/cron/refresh` automaticamente todo dia às 3h
   (horario definido em `vercel.json`), coletando os seguidores de todos os
   perfis cadastrados.

**Sobre o limite de tempo da funcao:** `vercel.json` define `maxDuration: 60`
para a funcao da API. Se voce monitorar muitos perfis (a coleta espera ~3s
entre cada um para reduzir o risco de bloqueio), a rotina de refresh pode
ultrapassar o limite do seu plano na Vercel — nesse caso, reduza a pausa em
`src/services/profileService.ts` ou divida a coleta em lotes.

## Exemplo de uso

```bash
curl -X POST http://localhost:3000/api/profiles \
  -H "Content-Type: application/json" \
  -d '{"username":"danimoraisoficial"}'

curl http://localhost:3000/api/profiles

curl http://localhost:3000/api/profiles/danimoraisoficial/history?days=7
```
