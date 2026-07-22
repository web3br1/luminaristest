/**
 * Builds a fresh instance of the production Express app for supertest. Uses the real createApp()
 * (same middleware stack, routes, auth and error handling that run in prod) so HTTP/contract tests
 * exercise the actual request lifecycle — DTO validation, authMiddleware, handleApiError mapping.
 */
import { createApp } from '@/app';

export function makeApp() {
  return createApp();
}
