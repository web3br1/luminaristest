import { logger } from './logger';

interface MetricOptions {
  success: boolean;
  [key: string]: string | number | boolean | undefined;
}

export class Metrics {
  private static instance: Metrics;
  private constructor() {}

  public static getInstance(): Metrics {
    if (!Metrics.instance) {
      Metrics.instance = new Metrics();
    }
    return Metrics.instance;
  }

  startTimer(metricName: string): (options: MetricOptions) => void {
    const startTime = Date.now();
    
    return (options: MetricOptions) => {
      const duration = Date.now() - startTime;
      
      const logLevel = options.success ? 'info' : 'warn';
      const status = options.success ? 'success' : 'failure';
      
      logger[logLevel](`Metric: ${metricName}`, {
        ...options,
        duration,
        status,
        metricName
      });
    };
  }
}

export const metrics = Metrics.getInstance();