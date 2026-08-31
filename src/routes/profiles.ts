import { NextFunction, Request, Response, Router } from "express";
import {
  addProfile,
  getProfileHistory,
  InvalidUsernameError,
  ListProfilesOptions,
  listProfiles,
  refreshAllProfiles,
  refreshProfile,
  removeProfile,
  snapshotsToCsv,
} from "../services/profileService";
import { InstagramNotFoundError, InstagramRateLimitError } from "../scraper/instagram";

export const profilesRouter = Router();

const MAX_HISTORY_DAYS = 365;

function handleScraperError(err: unknown, res: Response) {
  if (err instanceof InvalidUsernameError) {
    return res.status(400).json({ error: err.message });
  }
  if (err instanceof InstagramNotFoundError) {
    return res.status(404).json({ error: err.message });
  }
  if (err instanceof InstagramRateLimitError) {
    return res.status(429).json({ error: err.message });
  }
  return res.status(502).json({ error: err instanceof Error ? err.message : "Erro desconhecido" });
}

function parseDays(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 30;
  return Math.min(Math.trunc(n), MAX_HISTORY_DAYS);
}

const SORT_VALUES = ["username", "followers", "delta", "createdAt"] as const;
const ORDER_VALUES = ["asc", "desc"] as const;

function parseListOptions(query: Request["query"]): ListProfilesOptions {
  const q = typeof query.q === "string" && query.q.trim() ? query.q.trim() : undefined;
  const sort = SORT_VALUES.find((v) => v === query.sort);
  const order = ORDER_VALUES.find((v) => v === query.order);
  return { q, sort, order };
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

// GET /api/profiles?q=busca&sort=followers|username|delta|createdAt&order=asc|desc
profilesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const profiles = await listProfiles(parseListOptions(req.query));
    res.json(profiles);
  })
);

// GET /api/profiles/:username/history?days=30[&format=csv]
profilesRouter.get(
  "/:username/history",
  asyncHandler(async (req, res) => {
    const days = parseDays(req.query.days);
    const result = await getProfileHistory(req.params.username, days);
    if (!result) {
      return res.status(404).json({ error: "Perfil nao cadastrado." });
    }

    if (req.query.format === "csv") {
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${result.profile.username}-historico.csv"`
      );
      return res.send(snapshotsToCsv(result.snapshots));
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
