import { NextFunction, Request, Response, Router } from "express";
import {
  addProfile,
  getProfileHistory,
  listProfiles,
  refreshAllProfiles,
  refreshProfile,
  removeProfile,
} from "../services/profileService";
import { InstagramNotFoundError, InstagramRateLimitError } from "../scraper/instagram";

export const profilesRouter = Router();

function handleScraperError(err: unknown, res: Response) {
  if (err instanceof InstagramNotFoundError) {
    return res.status(404).json({ error: err.message });
  }
  if (err instanceof InstagramRateLimitError) {
    return res.status(429).json({ error: err.message });
  }
  return res.status(502).json({ error: err instanceof Error ? err.message : "Erro desconhecido" });
}

// Encaminha rejeicoes de handlers async para o error-handling middleware do
// Express (server.ts), em vez de virar uma unhandled promise rejection que
// derruba o processo inteiro.
function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

// POST /api/profiles  { "username": "danimoraisoficial" }
profilesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const { username } = req.body ?? {};
    if (!username || typeof username !== "string") {
      return res.status(400).json({ error: "Campo 'username' e obrigatorio." });
    }

    try {
      const profile = await addProfile(username);
      res.status(201).json(profile);
    } catch (err) {
      handleScraperError(err, res);
    }
  })
);

// GET /api/profiles
profilesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const profiles = await listProfiles();
    res.json(profiles);
  })
);

// GET /api/profiles/:username/history?days=30
profilesRouter.get(
  "/:username/history",
  asyncHandler(async (req, res) => {
    const days = Number(req.query.days) || 30;
    const result = await getProfileHistory(req.params.username, days);
    if (!result) {
      return res.status(404).json({ error: "Perfil nao cadastrado." });
    }
    res.json(result);
  })
);

// POST /api/profiles/:username/refresh
profilesRouter.post(
  "/:username/refresh",
  asyncHandler(async (req, res) => {
    try {
      const snapshot = await refreshProfile(req.params.username);
      res.json(snapshot);
    } catch (err) {
      handleScraperError(err, res);
    }
  })
);

// POST /api/profiles/refresh-all
profilesRouter.post(
  "/refresh-all",
  asyncHandler(async (_req, res) => {
    const results = await refreshAllProfiles();
    res.json(results);
  })
);

// DELETE /api/profiles/:username
profilesRouter.delete(
  "/:username",
  asyncHandler(async (req, res) => {
    const removed = await removeProfile(req.params.username);
    if (!removed) {
      return res.status(404).json({ error: "Perfil nao cadastrado." });
    }
    res.status(204).send();
  })
);
