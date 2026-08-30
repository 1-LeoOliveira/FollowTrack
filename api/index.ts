import "dotenv/config";
import type { IncomingMessage, ServerResponse } from "http";

type ExpressApp = (req: IncomingMessage, res: ServerResponse) => void;

let app: ExpressApp | null = null;
let initError: unknown = null;
let initialized = false;
let currentRes: ServerResponse | null = null;

function sendDiagnostic(res: ServerResponse | null, label: string, err: unknown) {
  console.error(label, err);
  if (!res || res.headersSent) return;
  try {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: label,
        details: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      })
    );
  } catch {
    // resposta ja pode ter sido encerrada de outra forma; nada mais a fazer
  }
}

// Captura erros que escapam de qualquer try/catch sincrono normal (ex.: um
// evento "error" de EventEmitter sem listener, que o Node trata como
// excecao fatal do processo). Sem isso, esses casos derrubam a funcao
// inteira sem deixar rastro nenhum na resposta HTTP.
process.on("uncaughtException", (err) => sendDiagnostic(currentRes, "uncaughtException", err));
process.on("unhandledRejection", (err) => sendDiagnostic(currentRes, "unhandledRejection", err));

function ensureApp() {
  if (initialized) return;
  initialized = true;
  try {
    // require() em vez de import no topo do arquivo: assim, se qualquer
    // modulo na cadeia de imports (ex.: "new PrismaClient()" em db.ts)
    // lancar um erro sincrono durante o carregamento, esse try/catch
    // consegue pegar - um "import" estatico no topo do arquivo rodaria
    // antes deste bloco e o erro escaparia sem ser tratado.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createServer } = require("../src/server");
    app = createServer();
  } catch (err) {
    initError = err;
    console.error("Falha ao inicializar o servidor:", err);
  }
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
  currentRes = res;
  ensureApp();

  if (initError || !app) {
    sendDiagnostic(res, "Falha ao inicializar o servidor.", initError);
    return;
  }

  try {
    app(req, res);
  } catch (err) {
    sendDiagnostic(res, "Erro ao processar requisicao.", err);
  }
}
