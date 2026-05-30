type LogMeta = Record<string, unknown>;

function write(level: string, message: string, meta?: LogMeta): void {
  const payload = meta ? ` ${JSON.stringify(meta)}` : "";
  console.log(`${new Date().toISOString()} ${level.toUpperCase()} ${message}${payload}`);
}

export const logger = {
  info: (message: string, meta?: LogMeta) => write("info", message, meta),
  warn: (message: string, meta?: LogMeta) => write("warn", message, meta),
  error: (message: string, meta?: LogMeta) => write("error", message, meta)
};
