// server/src/features/invoices/dtos/InvoiceDto.ts
import { z } from 'zod';

export const InvoiceStatusSchema = z.enum(['draft', 'sent', 'paid']);

/**
 * @openapi
 * components:
 *   schemas:
 *     Invoice:
 *       type: object
 *       required:
 *         - id
 *         - userId
 *         - number
 *         - amount
 *         - dueDate
 *         - status
 *       properties:
 *         id: { type: string }
 *         amount: { type: number, format: float, exclusiveMinimum: 0 }
 *         dueDate: { type: string, format: date-time }
 */
export const InvoiceSchema = z.object({
  id: z.string(),
  userId: z.string(),
  number: z.string().min(1),
  amount: z.number().positive(),
  dueDate: z.coerce.date(),
  status: InvoiceStatusSchema,
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  deletedAt: z.coerce.date().optional(),
});

export const CreateInvoiceSchema = z.object({
  number: z.string().min(1),
  amount: z.number().positive(),
  dueDate: z.coerce.date(),
  status: InvoiceStatusSchema,
});

export const UpdateInvoiceSchema = CreateInvoiceSchema.partial();

export type InvoiceDto = z.infer<typeof InvoiceSchema>;
export type CreateInvoiceDto = z.infer<typeof CreateInvoiceSchema>;
export type UpdateInvoiceDto = z.infer<typeof UpdateInvoiceSchema>;

export function isInvoiceDto(obj: unknown): obj is InvoiceDto {
  return InvoiceSchema.safeParse(obj).success;
}

export function isCreateInvoiceInput(obj: unknown): obj is CreateInvoiceDto {
  return CreateInvoiceSchema.safeParse(obj).success;
}

// server/src/features/invoices/models/Invoice.model.ts

export enum InvoiceStatus {
  DRAFT = 'draft',
  SENT = 'sent',
  PAID = 'paid',
}

export interface IInvoice {
  id: string;
  userId: string;
  number: string;
  amount: number;
  dueDate: Date;
  status: InvoiceStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}
