import cron from "node-cron";
import { refreshAllProfiles } from "./services/profileService";

export function startScheduler() {
  const schedule = process.env.CRON_SCHEDULE || "0 3 * * *";

  if (!cron.validate(schedule)) {
    throw new Error(`CRON_SCHEDULE invalido: "${schedule}"`);
  }

  cron.schedule(schedule, async () => {
    console.log(`[scheduler] iniciando coleta diaria de seguidores (${new Date().toISOString()})`);
    const results = await refreshAllProfiles();
    const ok = results.filter((r) => r.ok).length;
    const failed = results.length - ok;
    console.log(`[scheduler] coleta finalizada: ${ok} ok, ${failed} falharam`);
    for (const r of results.filter((r) => !r.ok)) {
      console.warn(`[scheduler] falha em @${r.username}: ${r.error}`);
    }
  });

  console.log(`[scheduler] agendado com expressao cron "${schedule}"`);
}
