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
- `GET /api/profiles?q=busca&sort=followers|username|delta|createdAt&order=asc|desc` —
  lista os perfis com a ultima contagem, variacao (`delta`/`deltaPercent`),
  mini-historico (`sparkline`) e status de falha (`consecutiveFailures`,
  `lastError`).
- `GET /api/profiles/:username/history?days=30` — historico de seguidores.
  Adicione `&format=csv` para baixar como CSV em vez de JSON.
- `POST /api/profiles/:username/refresh` — forca uma coleta manual agora.
- `POST /api/profiles/refresh-all` — forca a coleta de todos os perfis agora.
- `DELETE /api/profiles/:username` — para de monitorar o perfil.
- `GET /api/cron/refresh` — usado pelo agendador (ver abaixo); protegido por
  `CRON_SECRET`.

Todas as rotas `/api/profiles/*` exigem o header `Authorization: Bearer <API_KEY>`
(ver secao "Usar esta API a partir de outro projeto" abaixo).

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

## Usar esta API a partir de outro projeto

1. Configure a variavel `API_KEY` no projeto na Vercel (**Settings →
   Environment Variables**) com um valor aleatorio — ela ainda nao existe
   por padrao, entao as rotas `/api/profiles/*` ficam abertas ate voce
   defini-la. Depois de criar, redeploy.
2. No outro projeto, chame a API passando essa chave no header
   `Authorization`:

```bash
curl https://followtrack-leo-oliveiras-projects.vercel.app/api/profiles \
  -H "Authorization: Bearer SUA_API_KEY"
```

```js
// fetch (Node.js ou navegador)
const res = await fetch(
  "https://followtrack-leo-oliveiras-projects.vercel.app/api/profiles",
  { headers: { Authorization: "Bearer SUA_API_KEY" } }
);
const perfis = await res.json();
```

```js
// cadastrar um novo perfil a partir do outro projeto
await fetch("https://followtrack-leo-oliveiras-projects.vercel.app/api/profiles", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer SUA_API_KEY",
  },
  body: JSON.stringify({ username: "danimoraisoficial" }),
});
```

**Importante sobre onde chamar a API:** se o "outro projeto" for algo que
roda no navegador do usuario (um site, um app), qualquer chave colocada no
codigo JS do frontend fica visivel para quem abrir o DevTools — nesse caso,
chame esta API a partir do **backend** desse outro projeto (ou de uma rota
serverless dele), nunca direto do frontend, para nao expor a `API_KEY`
publicamente. Se o outro projeto for um bot/servidor/script, chamar direto
como nos exemplos acima e seguro.

## Interface web

Alem da API, `public/` tem um dashboard com: resumo (perfis monitorados,
total de seguidores, maior crescimento), busca e ordenacao, mini-grafico de
tendencia e indicador de crescimento (%) em cada card, aviso quando um perfil
esta com falhas consecutivas de coleta, selecao de multiplos perfis para
comparar num unico grafico, e exportacao de historico em CSV.

## Robustez da coleta

- Retry automatico com backoff exponencial quando o Instagram responde com
  rate-limit (429), antes de desistir.
- Cada perfil guarda `consecutiveFailures`/`lastError`/`lastErrorAt` — reseta
  a zero na primeira coleta bem-sucedida seguinte.
- Validacao do formato do username antes de tentar fazer scraping.
- Logs estruturados (`src/utils/logger.ts`) em vez de `console.log` solto.

## Testes

```bash
npm test
```

Cobre a logica de parsing do scraper, geracao de CSV e as rotas HTTP
(autenticacao por API key, validacao de entrada, mapeamento de erros) com
`vitest` + `supertest`, usando o `profileService` mockado — nao depende de
banco de dados real.

## Exemplo de uso local

```bash
curl -X POST http://localhost:3000/api/profiles \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SUA_API_KEY" \
  -d '{"username":"danimoraisoficial"}'

curl http://localhost:3000/api/profiles \
  -H "Authorization: Bearer SUA_API_KEY"

curl "http://localhost:3000/api/profiles/danimoraisoficial/history?days=7" \
  -H "Authorization: Bearer SUA_API_KEY"
```
