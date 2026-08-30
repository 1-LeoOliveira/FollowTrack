import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import path from "path";
import { profilesRouter } from "./routes/profiles";
import { refreshAllProfiles } from "./services/profileService";

export function createServer() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, "../public")));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.get("/api", (_req, res) => {
    res.json({
      name: "Numero de Seguidores API",
      endpoints: {
        "GET /health": "verifica se a API esta rodando",
        "GET /api/profiles": "lista os perfis monitorados com a ultima contagem",
        "POST /api/profiles": 'cadastra um perfil, body: { "username": "..." }',
        "GET /api/profiles/:username/history?days=30": "historico de seguidores",
        "POST /api/profiles/:username/refresh": "forca uma coleta manual agora",
        "POST /api/profiles/refresh-all": "forca a coleta de todos os perfis agora",
        "DELETE /api/profiles/:username": "para de monitorar o perfil",
      },
    });
  });

  app.use("/api/profiles", profilesRouter);

  // Disparado pelo Vercel Cron Jobs (ver vercel.json). Protegido pelo header
  // que a Vercel injeta automaticamente quando a variavel CRON_SECRET esta
  // configurada no projeto. Fora da Vercel (dev local), CRON_SECRET fica
  // vazio e a checagem e pulada.
  app.get("/api/cron/refresh", async (req, res, next) => {
    try {
      const secret = process.env.CRON_SECRET;
      if (secret && req.headers.authorization !== `Bearer ${secret}`) {
        return res.status(401).json({ error: "Nao autorizado." });
      }

      const results = await refreshAllProfiles();
      res.json({ ranAt: new Date().toISOString(), results });
    } catch (err) {
      next(err);
    }
  });

  // Rede de seguranca: qualquer erro nao tratado num handler cai aqui em vez
  // de derrubar o processo (essencial numa funcao serverless da Vercel).
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : "Erro interno do servidor." });
  });

  return app;
}
