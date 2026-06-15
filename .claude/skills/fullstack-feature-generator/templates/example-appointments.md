# Example: `appointments` resource — fullstack vertical slice

Exemplo concreto de saída gerada por `fullstack-feature-generator appointments --com-prisma`.

> **Convenções de import verificadas por compilação real (`npx tsc --noEmit` verde):**
> - Tipos de model Prisma: `import { Appointment } from 'generated/prisma'` — **NUNCA `@prisma/client`** (o projeto gera em `generated/prisma`, resolvido via baseUrl)
> - Instância Prisma: `import prisma from '../../../lib/prisma'` (default export)
> - `IUser` e `Role`: de `../../users/models/User.model` — **NÃO `@prisma/client`**
> - Services recebem `actor: IUser | null` (não `UserContext`); o controller passa `getUserContextFromRequest(req)` diretamente (atribuível a `IUser`)
> - `handleApiError(error, res)` — ordem `(error, res)`, de `../lib/apiUtils`

---

## 1. Prisma model (`schema.prisma`)

```prisma
model Appointment {
  id          String    @id @default(cuid())
  userId      String
  title       String
  scheduledAt DateTime
  status      String    @default("pending")
  notes       String?
  deletedAt   DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([deletedAt])
  @@map("appointments")
}
```

---

## 2. DTO (`features/appointments/dtos/AppointmentDto.ts`)

```typescript
import { z } from 'zod';

/** @openapi
 * components:
 *   schemas:
 *     CreateAppointmentInput:
 *       type: object
 *       required: [title, scheduledAt]
 *       properties:
 *         title:       { type: string }
 *         scheduledAt: { type: string, format: date-time }
 *         notes:       { type: string }
 */
export const CreateAppointmentSchema = z.object({
  title:       z.string().min(1).max(200),
  scheduledAt: z.coerce.date(),
  notes:       z.string().optional(),
});

export const UpdateAppointmentSchema = CreateAppointmentSchema.partial();

export type CreateAppointmentInput = z.infer<typeof CreateAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof UpdateAppointmentSchema>;

export function isCreateAppointmentInput(v: unknown): v is CreateAppointmentInput {
  return CreateAppointmentSchema.safeParse(v).success;
}
```

---

## 3. Repository (`features/appointments/repositories/AppointmentRepository.ts`)

```typescript
import prisma from '../../../lib/prisma';
import { IAppointmentRepository } from './IAppointmentRepository';

export class AppointmentRepository implements IAppointmentRepository {
  async findAll(userId: string, page = 1, limit = 10) {
    const [items, total] = await prisma.$transaction([
      prisma.appointment.findMany({
        where: { userId, deletedAt: null },
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { scheduledAt: 'asc' },
      }),
      prisma.appointment.count({ where: { userId, deletedAt: null } }),
    ]);
    return { items, total };
  }

  async findById(id: string, userId: string) {
    return prisma.appointment.findFirst({ where: { id, userId, deletedAt: null } });
  }

  async create(data: { userId: string; title: string; scheduledAt: Date; notes?: string }) {
    return prisma.appointment.create({ data });
  }

  async update(id: string, data: Partial<{ title: string; scheduledAt: Date; notes: string }>) {
    return prisma.appointment.update({ where: { id }, data });
  }

  async softDelete(id: string) {
    await prisma.appointment.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
```

---

## 4. Policy (`features/appointments/policies/AppointmentPolicy.ts`)

```typescript
// IUser e Role vivem na feature de users (User.model re-exporta o enum Role) — NÃO usar @prisma/client
import type { IUser } from '../../users/models/User.model';
import { Role } from '../../users/models/User.model';

export class AppointmentPolicy {
  canCreate(actor: IUser | null): boolean {
    return actor !== null;
  }
  canView(actor: IUser | null, ownerId: string): boolean {
    if (!actor) return false;
    return actor.role === Role.ADMIN || actor.id === ownerId;
  }
  canUpdate(actor: IUser | null, ownerId: string): boolean {
    return this.canView(actor, ownerId);
  }
  canDelete(actor: IUser | null, ownerId: string): boolean {
    return this.canView(actor, ownerId);
  }
  canListAll(actor: IUser | null): boolean {
    return actor?.role === Role.ADMIN;
  }
}
```

---

## 5. Service (key methods only)

```typescript
// Convenção real do repo: services recebem `actor: IUser | null` (NÃO UserContext).
// O controller passa o retorno de getUserContextFromRequest() — UserContext é
// estruturalmente atribuível a IUser, então não precisa de cast.
import type { IUser } from '../../users/models/User.model';

async getById(actor: IUser | null, id: string) {
  const item = await this.repository.findById(id, actor?.id ?? '');
  if (!item) throw new NotFoundError('Appointment not found');
  if (!this.policy.canView(actor, item.userId)) throw new ForbiddenError();
  return item;
}

async create(actor: IUser | null, input: CreateAppointmentInput) {
  if (!actor || !this.policy.canCreate(actor)) throw new ForbiddenError();
  return this.repository.create({ userId: actor.id, ...input });
}
```

---

## 6. Controller key snippet

```typescript
export const createAppointment = async (req: Request, res: Response) => {
  try {
    const parsed = CreateAppointmentSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });

    const user = getUserContextFromRequest(req);
    const data = await getFactory().getAppointmentService().create(user, parsed.data);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res); // ordem real: (error, res) — de '../lib/apiUtils'
  }
};
```

---

## 7. Route

```typescript
import { Router } from 'express';
import { getAppointments, getAppointmentById, createAppointment, updateAppointment, deleteAppointment } from '../controllers/appointmentController';

const router = Router();
router.get('/',    getAppointments);
router.get('/:id', getAppointmentById);
router.post('/',   createAppointment);
router.put('/:id', updateAppointment);
router.delete('/:id', deleteAppointment);

export default router;
```

---

## 8. Frontend service (`my-app/lib/services/appointments.service.ts`)

```typescript
import { apiClient } from '../api/api-client';

export interface Appointment {
  id: string; title: string; scheduledAt: string; status: string; notes?: string;
}

export const appointmentsService = {
  getAll: (page = 1, limit = 10) =>
    apiClient.get<{ data: Appointment[]; pagination: any }>(`/appointments?page=${page}&limit=${limit}`),
  getById: (id: string) =>
    apiClient.get<{ data: Appointment }>(`/appointments/${id}`),
  create: (input: Omit<Appointment, 'id' | 'status'>) =>
    apiClient.post<{ data: Appointment }>('/appointments', input),
  update: (id: string, input: Partial<Appointment>) =>
    apiClient.put<{ data: Appointment }>(`/appointments/${id}`, input),
  delete: (id: string) =>
    apiClient.delete(`/appointments/${id}`),
};
```
