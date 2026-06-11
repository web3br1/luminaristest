import { GenerateReportRequest, GenerateReportResponse } from './ReportService';

// Tipo para o callback de progresso
export type ProgressCallback = (update: { status: string; message: string }) => void;

export interface IReportService {
  generateReport(
    request: GenerateReportRequest,
    onProgress?: ProgressCallback
  ): Promise<GenerateReportResponse>;
}
