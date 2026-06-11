import type { Request, Response } from 'express';
import { getFactory } from '@/lib/factory';
import { GenerateReportSchema } from '@/features/reports/dtos/GenerateReportDto';
import { getUserContextFromRequest } from '@/lib/authUtils';
import type { ProgressCallback } from '@/features/reports/services/IReportService';

export async function generateChartData(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).end('Method Not Allowed');
    return;
  }

  const ctx = getUserContextFromRequest(req);
  if (!ctx) return res.status(401).json({ success: false, error: 'Authentication required' });

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  (res as any).flushHeaders?.();

  const sendEvent = (data: object) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const validation = GenerateReportSchema.safeParse(req.body);
    if (!validation.success) {
      const errorMessage = validation.error.issues.map(e => e.message).join(', ');
      sendEvent({ type: 'error', message: `Invalid request body: ${errorMessage}` });
      res.end();
      return;
    }

    const reportService = getFactory().getReportService();
    const onProgress: ProgressCallback = (update) => {
      sendEvent({ type: 'progress', ...update });
    };

    const result = await reportService.generateReport(
      { ...(validation.data as any), userId: ctx.id },
      onProgress
    );

    if (result.chartData && result.chartData.length > 0) {
      sendEvent({ type: 'final', ...result, documentId: (validation.data as any).documentIds?.[0] });
    } else {
      sendEvent({ type: 'message', message: result.response, chatInstanceId: (validation.data as any).chatInstanceId });
    }
  } catch (error: any) {
    console.error('Error in generate-chart-data handler:', error);
    sendEvent({ type: 'error', message: error.message || 'An unexpected error occurred' });
  } finally {
    res.end();
    return;
  }
}


