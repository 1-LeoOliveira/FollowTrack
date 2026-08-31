import cron from "node-cron";
import { refreshAllProfiles } from "./services/profileService";
import { log } from "./utils/logger";

export function startScheduler() {
  const schedule = process.env.CRON_SCHEDULE || "0 3 * * *";

  if (!cron.validate(schedule)) {
    throw new Error(`CRON_SCHEDULE invalido: "${schedule}"`);
  }

  cron.schedule(schedule, async () => {
    log.info("Iniciando coleta diaria de seguidores");
    const results = await refreshAllProfiles();
    const ok = results.filter((r) => r.ok).length;
    const failed = results.length - ok;
    log.info("Coleta finalizada", { ok, failed });
    for (const r of results.filter((r) => !r.ok)) {
      log.warn("Falha na coleta", { username: r.username, error: r.error });
    }
  });

  log.info("Agendador configurado", { schedule });
}
