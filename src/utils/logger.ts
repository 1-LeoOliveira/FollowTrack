type LogMeta = Record<string, unknown>;

function line(level: string, msg: string, meta?: LogMeta) {
  const timestamp = new Date().toISOString();
  const metaStr = meta && Object.keys(meta).length ? " " + JSON.stringify(meta) : "";
  return `[${timestamp}] [${level}] ${msg}${metaStr}`;
}

export const log = {
  info(msg: string, meta?: LogMeta) {
    console.log(line("INFO", msg, meta));
  },
  warn(msg: string, meta?: LogMeta) {
    console.warn(line("WARN", msg, meta));
  },
  error(msg: string, meta?: LogMeta) {
    console.error(line("ERROR", msg, meta));
  },
};
