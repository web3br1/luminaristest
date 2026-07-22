import type { Request, Response } from 'express';
import type * as express from 'express';
import { getFactory } from '@/lib/factory';
import { GenerateReportSchema } from '@/features/reports/dtos/GenerateReportDto';
import { getUserContextFromRequest } from '@/lib/authUtils';
import { AppError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import type { ProgressCallback } from '@/features/reports/services/IReportService';

export async function generateChartData(req: Request, res: Response): Promise<void> {
  const ctx = getUserContextFromRequest(req);
  if (!ctx) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return;
  }

  // Validate BEFORE committing to the SSE stream, so a bad request gets a real 400 (JSON),
  // consistent with the other features — not a 200 + error event.
  const validation = GenerateReportSchema.safeParse(req.body);
  if (!validation.success) {
    res.status(400).json({ success: false, error: validation.error.flatten() });
    return;
  }

  // From here on the response is a Server-Sent Events stream.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  (res as express.Response & { flushHeaders?: () => void }).flushHeaders?.();

  const sendEvent = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const reportService = getFactory().getReportService();
    const onProgress: ProgressCallback = (update) => {
      sendEvent({ type: 'progress', ...update });
    };

    const result = await reportService.generateReport(
      { ...validation.data, userId: ctx.id },
      onProgress
    );

    if (result.chartData && result.chartData.length > 0) {
      sendEvent({ type: 'final', ...result, documentId: validation.data.documentIds?.[0] });
    } else {
      sendEvent({ type: 'message', message: result.response, chatInstanceId: validation.data.chatInstanceId });
    }
  } catch (error) {
    // Log the real error; only surface a safe message to the client (no internals leaked).
    logger.error('Error in generate-chart-data handler', { error });
    const message = error instanceof AppError ? error.message : 'An unexpected error occurred';
    sendEvent({ type: 'error', message });
  } finally {
    res.end();
  }
}
