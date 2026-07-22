/**
 * Unit tests for the Metrics timing helper — the timer computes a duration and routes success→info /
 * failure→warn, forwarding extra context. (A thin log-based helper by design, not a metrics backend.)
 */
import { metrics } from '../monitoring';
import { logger } from '../logger';

describe('metrics.startTimer', () => {
  it('logs success at info with a numeric duration, the metric name, and extra context', () => {
    const spy = jest.spyOn(logger, 'info').mockImplementation(() => {});
    const end = metrics.startTimer('my_op');
    end({ success: true, count: 3 });

    expect(spy).toHaveBeenCalledTimes(1);
    const [msg, ctx] = spy.mock.calls[0] as [string, Record<string, unknown>];
    expect(msg).toContain('my_op');
    expect(ctx.status).toBe('success');
    expect(ctx.metricName).toBe('my_op');
    expect(typeof ctx.duration).toBe('number');
    expect(ctx.count).toBe(3);
    spy.mockRestore();
  });

  it('logs failure at warn', () => {
    const spy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    metrics.startTimer('op2')({ success: false });

    expect(spy).toHaveBeenCalledTimes(1);
    const ctx = spy.mock.calls[0][1] as Record<string, unknown>;
    expect(ctx.status).toBe('failure');
    spy.mockRestore();
  });
});
