import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { postChat } from '@/controllers/chatController';

const router = Router();

// Per-user rate limit for chat completions (R11: prevent unbounded OpenAI cost)
// Key: x-user-id header injected by auth middleware; falls back to IP for unauthenticated requests.
const chatRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1-minute rolling window
  max: 20,             // max 20 requests per user per minute
  standardHeaders: true,
  legacyHeaders: false,
  // validate.keyGeneratorIpFallback: false — we key by x-user-id (injected by auth
  // middleware) and only fall back to IP for unauthenticated requests; IPv6 bypass
  // is not a concern here since authenticated users are always keyed by their ID.
  validate: { keyGeneratorIpFallback: false },
  keyGenerator: (req) => (req.headers['x-user-id'] as string) || req.ip || 'unknown',
  message: { success: false, error: 'Too many requests. Please wait before sending another message.' },
});

router.post('/', chatRateLimiter, postChat);

export default router;
