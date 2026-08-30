import "dotenv/config";
import type { IncomingMessage, ServerResponse } from "http";

type ExpressApp = (req: IncomingMessage, res: ServerResponse) => void;

let app: ExpressApp | null = null;
let initError: unknown = null;
let initialized = false;

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
  ensureApp();

  if (initError || !app) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        error: "Falha ao inicializar o servidor.",
        details: initError instanceof Error ? initError.message : String(initError),
        stack: initError instanceof Error ? initError.stack : undefined,
      })
    );
    return;
  }

  try {
    app(req, res);
  } catch (err) {
    console.error("Erro ao processar requisicao:", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: "Erro ao processar requisicao.",
          details: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        })
      );
    }
  }
}
