export type DocumentStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'ERROR';
export type DocumentPurpose = 'DATA_ANALYSIS' | 'KNOWLEDGE_BASE';

export interface DocumentResponseDto {
    id: string;
    userId: string;
    fileName: string;
    fileType: 'PDF' | 'DOCX' | 'XLSX';
    fileSize: number;
    textContent?: string;
    status: DocumentStatus;
    documentPurpose: DocumentPurpose;
    summary: string | null;
    contextJson: any;
    uploadDate: string | Date;
    processingDate: string | Date | null;
    processingError: string | null;
    createdAt: string | Date;
    updatedAt: string | Date;
}
