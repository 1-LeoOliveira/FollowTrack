import axios from "axios";
import { log } from "../utils/logger";

export interface InstagramProfileStats {
  username: string;
  fullName: string | null;
  profilePicUrl: string | null;
  followers: number;
  following: number;
  posts: number;
}

export class InstagramNotFoundError extends Error {
  constructor(username: string) {
    super(`Perfil do Instagram "${username}" nao foi encontrado.`);
    this.name = "InstagramNotFoundError";
  }
}

export class InstagramRateLimitError extends Error {
  constructor() {
    super("Instagram bloqueou/limitou as requisicoes (rate limit). Tente novamente mais tarde.");
    this.name = "InstagramRateLimitError";
  }
}

const USERNAME_PATTERN = /^[a-zA-Z0-9._]{1,30}$/;

export function isValidInstagramUsername(username: string): boolean {
  return USERNAME_PATTERN.test(username);
}

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

// App id publico usado pelo proprio site do Instagram nas chamadas do frontend.
const IG_APP_ID = "936619743392459";

const RATE_LIMIT_RETRIES = 2;
const RATE_LIMIT_BASE_DELAY_MS = 1500;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildHeaders() {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    "X-IG-App-ID": IG_APP_ID,
    Accept: "*/*",
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  };
  if (process.env.IG_SESSION_COOKIE) {
    headers["Cookie"] = process.env.IG_SESSION_COOKIE;
  }
  return headers;
}

async function fetchViaWebProfileInfo(username: string): Promise<InstagramProfileStats> {
  const url = `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(
    username
  )}`;

  const response = await axios.get(url, {
    headers: buildHeaders(),
    timeout: 15000,
    validateStatus: () => true,
  });

  if (response.status === 404) {
    throw new InstagramNotFoundError(username);
  }
  if (response.status === 429) {
    throw new InstagramRateLimitError();
  }
  if (response.status !== 200) {
    throw new Error(`Resposta inesperada do Instagram (status ${response.status}).`);
  }

  const user = response.data?.data?.user;
  if (!user) {
    throw new InstagramNotFoundError(username);
  }

  return {
    username: user.username,
    fullName: user.full_name ?? null,
    profilePicUrl: user.profile_pic_url_hd ?? user.profile_pic_url ?? null,
    followers: user.edge_followed_by?.count ?? 0,
    following: user.edge_follow?.count ?? 0,
    posts: user.edge_owner_to_timeline_media?.count ?? 0,
  };
}

// Fallback: extrai os numeros da meta tag og:description da pagina publica.
// Menos preciso (numeros grandes vem abreviados, ex: "1,2 mi seguidores"),
// usado apenas se o endpoint JSON principal falhar.
async function fetchViaHtmlFallback(username: string): Promise<InstagramProfileStats> {
  const url = `https://www.instagram.com/${encodeURIComponent(username)}/`;

  const response = await axios.get(url, {
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8" },
    timeout: 15000,
    validateStatus: () => true,
  });

  if (response.status === 404) {
    throw new InstagramNotFoundError(username);
  }
  if (response.status === 429) {
    throw new InstagramRateLimitError();
  }
  if (response.status !== 200) {
    throw new Error(`Resposta inesperada do Instagram (status ${response.status}).`);
  }

  const html: string = response.data;
  const match = html.match(
    /<meta property="og:description" content="([\d.,]+)\s*(\w+)?[^"]*Followers[^"]*"/i
  );

  if (!match) {
    throw new Error(
      `Nao foi possivel extrair os dados do perfil "${username}" via fallback HTML.`
    );
  }

  const followers = parseAbbreviatedNumber(match[1] + (match[2] ?? ""));

  return {
    username,
    fullName: null,
    profilePicUrl: null,
    followers,
    following: 0,
    posts: 0,
  };
}

export function parseAbbreviatedNumber(raw: string): number {
  const cleaned = raw.replace(/,/g, "").trim();
  const multiplierMatch = cleaned.match(/^([\d.]+)\s*([kKmMbB])?$/);
  if (!multiplierMatch) {
    const asInt = parseInt(cleaned.replace(/\D/g, ""), 10);
    return Number.isNaN(asInt) ? 0 : asInt;
  }
  const value = parseFloat(multiplierMatch[1]);
  const suffix = (multiplierMatch[2] ?? "").toLowerCase();
  const multiplier = suffix === "k" ? 1_000 : suffix === "m" ? 1_000_000 : suffix === "b" ? 1_000_000_000 : 1;
  return Math.round(value * multiplier);
}

async function fetchOnce(username: string): Promise<InstagramProfileStats> {
  try {
    return await fetchViaWebProfileInfo(username);
  } catch (err) {
    if (err instanceof InstagramNotFoundError || err instanceof InstagramRateLimitError) {
      throw err;
    }
    log.warn("Endpoint principal falhou, tentando fallback HTML", {
      username,
      error: err instanceof Error ? err.message : String(err),
    });
    return await fetchViaHtmlFallback(username);
  }
}

export async function fetchInstagramProfile(username: string): Promise<InstagramProfileStats> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt++) {
    try {
      return await fetchOnce(username);
    } catch (err) {
      lastErr = err;
      if (!(err instanceof InstagramRateLimitError) || attempt === RATE_LIMIT_RETRIES) {
        throw err;
      }
      const delay = RATE_LIMIT_BASE_DELAY_MS * 2 ** attempt;
      log.warn("Rate limit do Instagram, tentando de novo apos backoff", {
        username,
        attempt: attempt + 1,
        delayMs: delay,
      });
      await sleep(delay);
    }
  }

  throw lastErr;
}
