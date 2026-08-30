import "dotenv/config";
import type { IncomingMessage, ServerResponse } from "http";
import { createServer } from "../src/server";

let app: ReturnType<typeof createServer> | null = null;
let initError: unknown = null;

try {
  app = createServer();
} catch (err) {
  initError = err;
  console.error("Falha ao inicializar o servidor:", err);
}

export default function handler(req: IncomingMessage, res: ServerResponse) {
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
  app(req, res);
}
