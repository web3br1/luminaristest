# Parte B / P0 — Slice 4: Anexos baixáveis (#6, parte anexos — Option D)

> SDD spec. File-store de verdade para anexos de registro CRM: upload + **download** + vínculo a registro, com armazenamento próprio (disco no dev), **desacoplado** do pipeline RAG/Qdrant (que não persiste o binário). Decisão do usuário: Option D.

## Decisões (ground-truthed)
- **Modelo Prisma novo `CrmAttachment`** (polimórfico, soft-delete):
  ```prisma
  model CrmAttachment {
    id          String   @id @default(cuid())
    userId      String
    user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
    entityType  String   // 'lead' | 'account' | 'contact'  (extensível p/ 'opportunity')
    entityId    String   // id da row DynamicTable (não FK — rows são dinâmicas)
    fileName    String   // nome original (sanitizado p/ exibição)
    mimeType    String
    fileSize    Int
    storageKey  String   // caminho relativo dentro de ATTACHMENTS_DIR
    createdAt   DateTime @default(now())
    updatedAt   DateTime @updatedAt
    deletedAt   DateTime?
    @@index([userId, entityType, entityId])
    @@map("crm_attachments")
  }
  ```
  Adicionar `crmAttachments CrmAttachment[]` em `User` (back-relation).
- **Migration (dado vivo):** additive (nova tabela). Conduzida manualmente: `prisma migrate dev --create-only --name add_crm_attachments` → inspecionar SQL → `prisma migrate deploy` (nunca reseta). Fallback dev: `prisma db push` se houver drift que bloqueie create-only (instância de teste; aditivo). `prisma generate` após. **Eu (assistente) faço esse passo, não um agente.**
- **Storage:** `server/src/lib/attachmentStorage.ts` — base dir = `process.env.ATTACHMENTS_DIR` ou `path.resolve(process.cwd(), 'storage/attachments')`. Layout: `<base>/<userId>/<entityType>/<entityId>/<rand8>_<sanitized>`. `saveFile()` (mkdir recursive + writeFile), `resolveReadPath(storageKey)` com **guard de path traversal** (resolved.startsWith(base)), `deleteFile()` best-effort. Sanitizar filename (remover `/\\:*?"<>|` e null). `.gitignore` server: add `/storage/`.
- **Config:** `server/src/config/env.ts` — exportar `ATTACHMENTS_DIR` (+ opcional max size MB, default 25).

## Backend — feature slice `server/src/features/attachments/`
- **model** `models/Attachment.model.ts`: `IAttachment` + create/update input types.
- **dto** `dtos/AttachmentDto.ts`: `CreateAttachmentSchema` (entityType: z.enum(['lead','account','contact']); entityId: z.string().min(1)) + `@openapi` + type guard. (fileName/mimeType/fileSize derivam do arquivo no controller, não do client.)
- **repository** `repositories/{IAttachmentRepository,AttachmentRepository}.ts`: `create`, `findById` (deletedAt:null), `findManyByEntity(userId, entityType, entityId)` (deletedAt:null, $transaction se paginar — aqui lista simples), `softDelete(id)` (`update deletedAt`). Prisma types de `'generated/prisma'`. Soft-delete universal (sem `.delete()`).
- **policy** `policies/{IAttachmentPolicy,AttachmentPolicy}.ts`: `canView/canDelete(actor, ownerId): boolean` = `actor.role===ADMIN || actor.id===ownerId`. Sem throw.
- **service** `services/AttachmentService.ts` (injeta repo+policy + usa attachmentStorage):
  - `upload(actor, { entityType, entityId, fileName, mimeType, buffer })`: policy não aplica na criação além de auth (dono = actor); salva arquivo (storage.saveFile) → cria row (repo.create com userId=actor.id, storageKey). Retorna meta (sem path absoluto).
  - `listByEntity(actor, entityType, entityId)`: repo.findManyByEntity(actor.id, ...) (escopo por userId = tenant). Retorna metas.
  - `getForDownload(actor, id)`: repo.findById → se ausente OU `att.userId !== actor.id` (e não admin) → **NotFoundError** (cross-tenant = NotFound, contrato §2). Retorna meta + caminho resolvido (storage.resolveReadPath).
  - `delete(actor, id)`: findById → NotFoundError se cross-tenant; policy.canDelete; repo.softDelete; storage.deleteFile best-effort.
  - Erros tipados de `lib/errors`. Sem Express/res no service.
- **controller** `controllers/attachmentsController.ts`:
  - `uploadMiddleware` = multer memoryStorage, limits {fileSize: 25MB, files:1, fields:10}, fileFilter por allowlist (pdf, png, jpeg, docx, xlsx, csv, txt, application/octet-stream); factory de erro como `documentsController.makeUploadMiddleware` (413/415/400). + magic-bytes p/ pdf/zip.
  - `createAttachment`: `getUserContextFromRequest` (401 se null); pega `req.file`; `CreateAttachmentSchema.safeParse(req.body)` (entityType/entityId); chama `getFactory().getAttachmentService().upload(...)`; 201 `{success,data}`; `handleApiError`.
  - `listAttachments`: query entityType+entityId → service.listByEntity → `{success,data}`.
  - `downloadAttachment`: service.getForDownload → set headers (Content-Type, Content-Length, Content-Disposition attachment; filename) → `createReadStream(path).pipe(res)` com handler de erro (500 se !headersSent). NotFoundError → handleApiError (404).
  - `deleteAttachment`: service.delete → `{success,data:{ok:true}}`.
- **rotas** em `server/src/routes/crm.ts` (sob o router CRM já protegido — sem mexer em protectedApiPaths):
  - `router.post('/attachments', uploadMiddleware, createAttachment)`
  - `router.get('/attachments', listAttachments)`
  - `router.get('/attachments/:id/download', downloadAttachment)`
  - `router.delete('/attachments/:id', deleteAttachment)`
  - OpenAPI em `routes/docs.paths.ts` (tag CRM Attachments).
- **factory** `lib/factory.ts`: registrar `attachment` repo+policy+service + getter `getAttachmentService()`.

## Frontend — `my-app`
- `lib/services/crm.service.ts` (ou novo `attachment.service.ts`): `uploadAttachment(entityType,entityId,file): Promise<ApiResult>` (FormData multipart via apiClient/fetch com auth), `listAttachments(entityType,entityId)`, `deleteAttachment(id)`, `downloadAttachment(id, fileName)` (GET blob com auth → trigger download no browser). Confirmar como o apiClient lida com multipart + blob; se não suportar, usar fetch com o token cookie/header como apiClient faz.
- `features/crm/hooks/useLeadAttachments.ts` — `useLeadAttachments(leadId)`: lista via listAttachments('lead', leadId); `{ loading, error, attachments, reload }`.
- `features/crm/components/LeadAttachmentsPanel.tsx` — seção no Lead360: input de arquivo + botão "Anexar" (upload → reload), lista (nome, tamanho, data, botão download, botão excluir). Estados loading/error/empty; `rounded-2xl`/neutral/dark; service layer only; i18n.
- `Lead360Modal.tsx`: `<SectionCard title={t('detail.attachments','Anexos')}><LeadAttachmentsPanel leadId={lead.id} onChanged={onChanged}/></SectionCard>` (após Notas).
- i18n en+pt: detail.attachments, attachments.{upload,uploading,empty,download,delete,too_large,invalid_type,size}.

## Segurança (gates)
- Path-traversal guard no resolveReadPath; filename sanitizado; storageKey nunca do client (gerado no server). userId-scoped (tenant) em todas as queries + no path. Cross-tenant download/delete = **NotFoundError**. MIME allowlist + magic-bytes + limite de tamanho. `.gitignore` cobre `/storage/`.

## Aceite (gates)
- [ ] `cd server && npx tsc --noEmit`; jest verde (testes do service: upload cria row+arquivo; cross-tenant NotFound; soft-delete). `cd my-app && npx tsc --noEmit`.
- [ ] Migration aplicada na dev.db viva (tabela `crm_attachments` criada; dados existentes intactos).
- [ ] E2E live: upload de um PDF a um lead → aparece na lista → **download retorna o mesmo arquivo** → excluir (soft) → some da lista.
- [ ] i18n paridade; sem zinc-; reuse de padrões.

## Verificação
- Revisão adversarial multi-agente (segurança de path/tenant, streaming, soft-delete, migração). Rollout live (migration + E2E) só após review + tsc/jest verdes.
