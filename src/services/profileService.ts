import { prisma } from "../db";
import { fetchInstagramProfile, isValidInstagramUsername } from "../scraper/instagram";
import { log } from "../utils/logger";

export class InvalidUsernameError extends Error {
  constructor(username: string) {
    super(
      `Nome de usuario "${username}" invalido. Use apenas letras, numeros, pontos e underline (ate 30 caracteres).`
    );
    this.name = "InvalidUsernameError";
  }
}

function cleanUsername(username: string) {
  return username.trim().replace(/^@/, "");
}

export async function addProfile(username: string) {
  const clean = cleanUsername(username);
  if (!isValidInstagramUsername(clean)) {
    throw new InvalidUsernameError(clean);
  }

  const existing = await prisma.profile.findUnique({ where: { username: clean } });
  if (existing) {
    if (!existing.isActive) {
      // Perfil ja existia mas tinha sido removido (soft-delete) - reativa
      // em vez de deixar o cadastro parecer bem-sucedido sem aparecer na lista.
      return prisma.profile.update({ where: { id: existing.id }, data: { isActive: true } });
    }
    return existing;
  }

  const stats = await fetchInstagramProfile(clean);

  const profile = await prisma.profile.create({
    data: {
      username: stats.username,
      fullName: stats.fullName,
      profilePicUrl: stats.profilePicUrl,
      snapshots: {
        create: {
          followers: stats.followers,
          following: stats.following,
          posts: stats.posts,
        },
      },
    },
  });

  return profile;
}

export async function refreshProfile(username: string) {
  const profile = await prisma.profile.findUnique({ where: { username } });
  if (!profile) {
    throw new Error(`Perfil "${username}" nao esta cadastrado.`);
  }

  let stats;
  try {
    stats = await fetchInstagramProfile(username);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.profile.update({
      where: { id: profile.id },
      data: {
        consecutiveFailures: { increment: 1 },
        lastError: message,
        lastErrorAt: new Date(),
      },
    });
    log.error("Falha ao coletar perfil", { username, error: message });
    throw err;
  }

  const snapshot = await prisma.snapshot.create({
    data: {
      profileId: profile.id,
      followers: stats.followers,
      following: stats.following,
      posts: stats.posts,
    },
  });

  await prisma.profile.update({
    where: { id: profile.id },
    data: {
      fullName: stats.fullName ?? profile.fullName,
      profilePicUrl: stats.profilePicUrl ?? profile.profilePicUrl,
      consecutiveFailures: 0,
      lastError: null,
      lastErrorAt: null,
    },
  });

  return snapshot;
}

export interface ListProfilesOptions {
  q?: string;
  sort?: "username" | "followers" | "delta" | "createdAt";
  order?: "asc" | "desc";
}

function computeGrowth(latest?: { followers: number }, previous?: { followers: number }) {
  if (!latest || !previous) return { delta: null, deltaPercent: null };
  const delta = latest.followers - previous.followers;
  const deltaPercent = previous.followers > 0 ? (delta / previous.followers) * 100 : null;
  return { delta, deltaPercent };
}

export async function listProfiles(options: ListProfilesOptions = {}) {
  const profiles = await prisma.profile.findMany({
    where: {
      isActive: true,
      ...(options.q ? { username: { contains: options.q, mode: "insensitive" } } : {}),
    },
    include: {
      snapshots: {
        orderBy: { fetchedAt: "desc" },
        take: 14,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  let mapped = profiles.map((p) => {
    const [latest, previous] = p.snapshots;
    const { delta, deltaPercent } = computeGrowth(latest, previous);
    const sparkline = p.snapshots.map((s) => s.followers).reverse();
    return {
      username: p.username,
      fullName: p.fullName,
      profilePicUrl: p.profilePicUrl,
      createdAt: p.createdAt,
      latest: latest ?? null,
      delta,
      deltaPercent,
      sparkline,
      consecutiveFailures: p.consecutiveFailures,
      lastError: p.lastError,
      lastErrorAt: p.lastErrorAt,
    };
  });

  const sort = options.sort ?? "createdAt";
  const order = options.order ?? (sort === "username" ? "asc" : "desc");
  const dir = order === "asc" ? 1 : -1;

  mapped = mapped.sort((a, b) => {
    switch (sort) {
      case "username":
        return dir * a.username.localeCompare(b.username);
      case "followers":
        return dir * ((a.latest?.followers ?? -1) - (b.latest?.followers ?? -1));
      case "delta":
        return dir * ((a.delta ?? 0) - (b.delta ?? 0));
      default:
        return dir * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }
  });

  return mapped;
}

export async function getProfileHistory(username: string, days: number) {
  const profile = await prisma.profile.findUnique({ where: { username } });
  if (!profile) {
    return null;
  }

  const since = new Date();
  since.setDate(since.getDate() - days);

  const snapshots = await prisma.snapshot.findMany({
    where: { profileId: profile.id, fetchedAt: { gte: since } },
    orderBy: { fetchedAt: "asc" },
  });

  return { profile, snapshots };
}

export function snapshotsToCsv(snapshots: { fetchedAt: Date; followers: number; following: number; posts: number }[]) {
  const header = "data,seguidores,seguindo,posts";
  const rows = snapshots.map(
    (s) => `${s.fetchedAt.toISOString()},${s.followers},${s.following},${s.posts}`
  );
  return [header, ...rows].join("\n");
}

export async function removeProfile(username: string) {
  const profile = await prisma.profile.findUnique({ where: { username } });
  if (!profile) {
    return false;
  }
  await prisma.profile.update({ where: { id: profile.id }, data: { isActive: false } });
  return true;
}

export async function refreshAllProfiles() {
  const profiles = await prisma.profile.findMany({ where: { isActive: true } });
  const results: { username: string; ok: boolean; error?: string }[] = [];

  for (const profile of profiles) {
    try {
      await refreshProfile(profile.username);
      results.push({ username: profile.username, ok: true });
    } catch (err) {
      results.push({
        username: profile.username,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    // Espaca as requisicoes para reduzir a chance de rate-limit do Instagram.
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  return results;
}
