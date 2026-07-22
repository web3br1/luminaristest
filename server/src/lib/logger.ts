interface LogContext {
  [key: string]: unknown;
}

const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * JSON.stringify replacer that makes Error values useful in logs. A plain `JSON.stringify(new Error())`
 * yields `{}` (Error's own enumerable props are none), so `logger.error('x', { error })` used to drop the
 * message and stack entirely. This serializes name/message/stack (and any custom enumerable props).
 */
function logReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...(value as unknown as Record<string, unknown>), // include any custom fields (e.g. AppError.errorCode)
    };
  }
  return value;
}

function formatLog(level: string, message: string, context: LogContext = {}): void {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, level, message, ...context };

  const logString = isDevelopment
    ? JSON.stringify(logEntry, logReplacer, 2)
    : JSON.stringify(logEntry, logReplacer);

  if (level === 'error') {
    console.error(logString);
  } else {
    console.log(logString);
  }
}

export const logger = {
  info(message: string, context: LogContext = {}) {
    formatLog('info', message, context);
  },

  error(message: string, context: LogContext = {}) {
    formatLog('error', message, context);
  },

  warn(message: string, context: LogContext = {}) {
    formatLog('warn', message, context);
  },

  debug(message: string, context: LogContext = {}) {
    if (isDevelopment) {
      formatLog('debug', message, context);
    }
  },
};

export default logger;
