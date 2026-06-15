
import { getCookie } from 'cookies-next';

export class ApiClient {
    private baseUrl: string;
    private token: string;
    private headers: HeadersInit;

    constructor() {
        this.token = getCookie('auth_token') as string;
        if (!this.token) throw new Error('Sem token de autenticação');
        this.baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL as string) || 'http://localhost:3001';
        this.headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.token}`,
        };
    }

    async getRows(tableId: string): Promise<unknown[]> {
        const res = await fetch(`${this.baseUrl}/dynamic-tables/${tableId}/data`, { headers: this.headers });
        const body = await res.json();
        return body?.data || [];
    }

    async postRow(tableId: string, data: Record<string, unknown>, tableNameForLog: string = 'Unknown'): Promise<string> {
        const res = await fetch(`${this.baseUrl}/dynamic-tables/${tableId}/data`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({ data }),
        });

        let body: Record<string, unknown> = {};
        try { body = await res.json(); } catch (e) { }

        if (!res.ok) {
            this.logError(tableNameForLog, data, body, res.status);
            throw new Error(`[${tableNameForLog}] Falha ao criar: ${this.getErrorMsg(body)}`);
        }

        const id = body?.data?.id || body?.id || (typeof body?.data === 'string' ? body.data : null);
        if (!id) throw new Error(`[${tableNameForLog}] ID não retornado na criação.`);
        return id;
    }

    async putRow(tableId: string, dataId: string, data: Record<string, unknown>, tableNameForLog: string = 'Unknown'): Promise<void> {
        const res = await fetch(`${this.baseUrl}/dynamic-tables/${tableId}/data/${dataId}`, {
            method: 'PUT',
            headers: this.headers,
            body: JSON.stringify({ data }),
        });

        if (!res.ok) {
            let body: Record<string, unknown> = {};
            try { body = await res.json(); } catch (e) { }
            this.logError(tableNameForLog, data, body, res.status);
            throw new Error(`[${tableNameForLog}] Falha ao atualizar: ${this.getErrorMsg(body)}`);
        }
    }

    // Helper to find existing record by a unique field
    async findExisting(tableId: string, field: string, value: string): Promise<any | null> {
        const rows = await this.getRows(tableId);
        return rows.find((r) => {
            const val = r.data?.[field] || r[field];
            return String(val).toLowerCase() === String(value).toLowerCase();
        }) || null;
    }

    private getErrorMsg(body: unknown): string {
        try {
            const b = body as Record<string, unknown>;
            if (b?.details) return JSON.stringify(b.details, null, 2);
            if (b?.error) return typeof b.error === 'object' ? JSON.stringify(b.error, null, 2) : String(b.error);
            if (b?.message) return String(b.message);
            return JSON.stringify(body, null, 2); // Dump entire body if nothing else matches
        } catch (e) {
            return `Erro ao processar resposta de erro: ${e}`;
        }
    }

    private logError(table: string, payload: Record<string, unknown>, responseBody: unknown, status: number) {
        console.error(`\n🔴 [SEED ERROR] Table: ${table} (Status: ${status})`);
        console.error('📦 Payload enviado:', JSON.stringify(payload, null, 2));
        console.error('❌ Resposta do servidor:', JSON.stringify(responseBody, null, 2));
        console.error('---------------------------------------------------\n');
    }
}
