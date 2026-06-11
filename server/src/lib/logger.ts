interface LogContext {
  [key: string]: unknown;
}

const isDevelopment = process.env.NODE_ENV === 'development';

function formatLog(level: string, message: string, context: LogContext = {}): void {
  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, level, message, ...context };
  
  const logString = isDevelopment 
    ? JSON.stringify(logEntry, null, 2) 
    : JSON.stringify(logEntry);
  
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
  }
};

export default logger;