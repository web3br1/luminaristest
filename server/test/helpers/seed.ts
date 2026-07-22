/**
 * Seed helpers for integration tests. Insert rows directly via Prisma (bypassing the service) so
 * tests can arrange fixtures without going through business rules. Let Prisma generate the cuid id
 * (so it satisfies controller `cuid()` validation) and return the created row.
 */
import prisma from '@/lib/prisma';
import { Role } from '@/features/users/models/User.model';

export interface SeedUserOptions {
  username: string;
  role?: Role;
  email?: string;
  name?: string;
  /** Stored as-is (NOT hashed); only seed a real hash when a test exercises password verification. */
  password?: string;
}

/** Creates a user and returns it (with the generated cuid id). */
export async function seedUser(opts: SeedUserOptions) {
  return prisma.user.create({
    data: {
      username: opts.username,
      email: opts.email ?? `${opts.username}@test.co`,
      name: opts.name ?? opts.username,
      password: opts.password ?? 'seed-not-a-real-hash',
      role: opts.role ?? Role.USER,
    },
  });
}

export interface SeedDocumentOptions {
  userId: string;
  fileName?: string;
  fileType?: 'PDF' | 'DOCX' | 'XLSX';
  fileSize?: number;
  textContent?: string;
  mimeType?: string;
  status?: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'ERROR';
  documentPurpose?: 'DATA_ANALYSIS' | 'KNOWLEDGE_BASE';
}

/**
 * Creates a Document directly via Prisma (bypassing the upload pipeline) and returns the row with its
 * generated cuid id. Used by `documents` and `structuredData` integration tests to arrange fixtures
 * without hitting OpenAI/Qdrant.
 */
export async function seedDocument(opts: SeedDocumentOptions) {
  return prisma.document.create({
    data: {
      userId: opts.userId,
      fileName: opts.fileName ?? 'doc.pdf',
      fileType: opts.fileType ?? 'PDF',
      fileSize: opts.fileSize ?? 1024,
      textContent: opts.textContent ?? 'extracted text content',
      mimeType: opts.mimeType ?? 'application/pdf',
      status: opts.status ?? 'COMPLETED',
      documentPurpose: opts.documentPurpose ?? 'DATA_ANALYSIS',
    },
  });
}

export interface SeedDashboardLayoutOptions {
  userId: string;
  name?: string;
  isActive?: boolean;
  type?: 'GRID' | 'LIST' | 'CUSTOM';
  config?: unknown;
  /** Raw override for the `layoutData` JSON column — pass a malformed value to exercise fail-soft. */
  layoutData?: unknown;
}

/** Creates a DashboardLayout directly via Prisma and returns the row (with generated cuid id). */
export async function seedDashboardLayout(opts: SeedDashboardLayoutOptions) {
  const layoutData =
    opts.layoutData !== undefined
      ? opts.layoutData
      : { type: opts.type ?? 'GRID', config: opts.config ?? { columns: 2, widgets: [] } };
  return prisma.dashboardLayout.create({
    data: {
      userId: opts.userId,
      name: opts.name ?? 'Tab',
      isActive: opts.isActive ?? false,
      layoutData: layoutData as any,
    },
  });
}

export interface SeedChatInstanceOptions {
  userId: string;
  widgetInstanceId?: string;
  type?: 'DOCUMENT' | 'GENERIC';
  title?: string | null;
}

/** Creates a ChatInstance directly via Prisma and returns the row (with generated cuid id). */
export async function seedChatInstance(opts: SeedChatInstanceOptions) {
  return prisma.chatInstance.create({
    data: {
      userId: opts.userId,
      widgetInstanceId: opts.widgetInstanceId ?? 'widget-1',
      type: opts.type ?? 'GENERIC',
      title: opts.title ?? null,
    },
  });
}

export interface SeedChatMessageOptions {
  chatInstanceId: string;
  content?: string;
  /** Prisma enum value — uppercase USER | ASSISTANT. */
  role?: 'USER' | 'ASSISTANT';
}

/** Creates a ChatMessage directly via Prisma and returns the row (with generated cuid id). */
export async function seedChatMessage(opts: SeedChatMessageOptions) {
  return prisma.chatMessage.create({
    data: {
      chatInstanceId: opts.chatInstanceId,
      content: opts.content ?? 'hello',
      role: opts.role ?? 'USER',
    },
  });
}

export interface SeedDynamicTableOptions {
  userId: string;
  name?: string;
  internalName?: string;
  category?: string;
  /** The table definition (ITableSchema-shaped). Defaults to a minimal single-field schema. */
  schema?: unknown;
}

/**
 * Creates a DynamicTable directly via Prisma (bypassing the system `*AsSystem` install flow) and
 * returns the row with its generated cuid id. Tables have no public HTTP create route, so the HTTP
 * route tests seed them this way to arrange fixtures.
 */
export async function seedDynamicTable(opts: SeedDynamicTableOptions) {
  return prisma.dynamicTable.create({
    data: {
      userId: opts.userId,
      name: opts.name ?? 'Test Table',
      internalName: opts.internalName ?? null,
      category: opts.category ?? 'people',
      schema: (opts.schema ?? {
        fields: [{ name: 'title', label: 'Title', type: 'string', required: true }],
      }) as any,
    },
  });
}

export interface SeedDynamicTableDataOptions {
  dynamicTableId: string;
  /** The record payload stored in the `data` JSON column. */
  data?: Record<string, unknown>;
  /** Pass a Date to seed a soft-deleted row. */
  deletedAt?: Date | null;
}

/** Creates a DynamicTableData row directly via Prisma and returns it (with generated cuid id). */
export async function seedDynamicTableData(opts: SeedDynamicTableDataOptions) {
  return prisma.dynamicTableData.create({
    data: {
      dynamicTableId: opts.dynamicTableId,
      data: (opts.data ?? { title: 'Row' }) as any,
      deletedAt: opts.deletedAt ?? null,
    },
  });
}

export interface SeedStructuredDataOptions {
  documentId: string;
  /** Stored as the `headers` JSON column ([{ name, type }] in the simple case). */
  headers?: unknown;
  /** Stored as the `data` JSON column — tabular `[[...]]`, multi-sheet `[{name,headers,data}]`, or object. */
  data?: unknown;
}

/**
 * Creates a StructuredData row (1:1 with a Document) directly via Prisma. The caller must pass the id
 * of a Document seeded with `seedDocument`. Used by the structuredData integration/HTTP tests.
 */
export async function seedStructuredData(opts: SeedStructuredDataOptions) {
  return prisma.structuredData.create({
    data: {
      documentId: opts.documentId,
      headers: (opts.headers ?? [{ name: 'Produto', type: 'TEXT' }]) as any,
      data: (opts.data ?? [['Notebook', 5000]]) as any,
    },
  });
}
