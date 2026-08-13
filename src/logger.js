const levels = { debug: 10, info: 20, error: 30 };

function errorDetails(error) {
  if (!(error instanceof Error)) return { error: String(error) };
  return {
    error: error.message,
    errorName: error.name,
    stack: error.stack,
    ...(error.cause ? { cause: errorDetails(error.cause) } : {}),
  };
}

export function createLogger({
  level = process.env.LOG_LEVEL || 'info',
  write = (line) => process.stdout.write(line),
  now = () => new Date(),
} = {}) {
  const threshold = levels[level] ?? levels.info;

  function log(logLevel, message, details = {}) {
    if (levels[logLevel] < threshold) return;
    const entry = {
      timestamp: now().toISOString(),
      level: logLevel,
      message,
      ...details,
    };
    write(`${JSON.stringify(entry)}\n`);
  }

  return {
    debug: (message, details) => log('debug', message, details),
    info: (message, details) => log('info', message, details),
    error: (message, error, details = {}) =>
      log('error', message, { ...details, ...errorDetails(error) }),
  };
}

export const logger = createLogger();
