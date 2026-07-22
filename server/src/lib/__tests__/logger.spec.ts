/**
 * Unit tests for the logger — focused on the Error-serialization fix (a bare Error in context used to
 * log as `{}`, dropping message/stack). NODE_ENV=test under Jest, so output is single-line JSON.
 */
import { logger } from '../logger';
import { ForbiddenError } from '../errors';

describe('logger Error serialization', () => {
  let spy: jest.SpyInstance | undefined;
  afterEach(() => spy?.mockRestore());

  it('serializes an Error in context with its message and stack (not `{}`)', () => {
    spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('boom happened', { error: new Error('the real cause') });

    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged.message).toBe('boom happened');
    expect(logged.error.message).toBe('the real cause');
    expect(typeof logged.error.stack).toBe('string');
  });

  it('includes custom AppError fields (errorCode/statusCode)', () => {
    spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('denied', { error: new ForbiddenError('nope') });

    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged.error.errorCode).toBe('FORBIDDEN');
    expect(logged.error.statusCode).toBe(403);
  });

  it('routes info/warn to console.log and carries plain context', () => {
    spy = jest.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('hello', { userId: 'u1' });

    const logged = JSON.parse(spy.mock.calls[0][0] as string);
    expect(logged.level).toBe('info');
    expect(logged.userId).toBe('u1');
  });
});
