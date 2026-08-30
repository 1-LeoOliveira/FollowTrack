import { prisma } from "../db";
import { fetchInstagramProfile } from "../scraper/instagram";

export async function addProfile(username: string) {
  const clean = username.trim().replace(/^@/, "");

  const existing = await prisma.profile.findUnique({ where: { username: clean } });
  if (existing) {
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

  const stats = await fetchInstagramProfile(username);

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
    },
  });

  return snapshot;
}

export async function listProfiles() {
  const profiles = await prisma.profile.findMany({
    where: { isActive: true },
    include: {
      snapshots: {
        orderBy: { fetchedAt: "desc" },
        take: 2,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return profiles.map((p) => {
    const [latest, previous] = p.snapshots;
    return {
      username: p.username,
      fullName: p.fullName,
      profilePicUrl: p.profilePicUrl,
      createdAt: p.createdAt,
      latest: latest ?? null,
      delta: latest && previous ? latest.followers - previous.followers : null,
    };
  });
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
