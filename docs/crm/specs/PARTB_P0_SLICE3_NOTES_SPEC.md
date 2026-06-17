# Parte B / P0 — Slice 3: Notas (#6, parte notas)

> SDD spec. Notas timestamped + atribuídas por registro, no Lead360. Reusa `leadActivities` (type='note') — **sem mudança de schema**. **Anexos ficam fora deste slice** (ver "Anexos — decisão pendente" abaixo).

## Verificado
- `leadActivities` (DynamicTable, core): `leadId`(req→leads), `actorId`(opt→employees), `type`(select, inclui 'note'), `message`(textarea), `payload`(json hidden), prev/nextStageId. → Uma nota = uma row `{ leadId, type:'note', message, actorId? }`. Sem schema change.
- `notes` é também um campo textarea único em leads/crmAccounts/crmContacts (não confundir — é o "notes bulk" do registro; este slice adiciona o LOG de notas timestamped no Lead360).
- accounts/contacts NÃO têm activity log → notas timestamped só para LEADS neste slice (gap conhecido; textarea segue para accounts/contacts).
- `actorId` = employee. O auth user (useAuth) tem `id`/`email` mas NÃO o employee id; resolver best-effort por email contra a tabela employees (padrão `useOwnerFilter`); se não resolver, omitir `actorId` (é opcional).

## Componente — Frontend (sem backend)
- `my-app/features/crm/hooks/useLeadNotes.ts` — `useLeadNotes(leadId)`: resolve `leadActivities` por internalName, `fetchAllRows`, filtra `leadId==lead.id && type==='note'`, ordena por createdAt desc (useMemo). Retorna `{ loading, error, notes, activitiesTableId, reload }`.
- `my-app/features/crm/components/LeadNotesPanel.tsx` — seção no Lead360:
  - Lista: mensagem, autor (resolve actorId→employee name, padrão useOwnerFilter), timestamp (createdAt). Estilo card `rounded-2xl`/neutral/dark.
  - Adicionar: textarea + botão "Adicionar nota" → `DynamicTableService.createRecord(activitiesTableId, { data: { leadId, type:'note', message, actorId? } })` → reload()+onChanged. Valida message não-vazia; erro via resolveErrorMessage.
- `Lead360Modal.tsx`: `<SectionCard title={t('detail.notes','Notas')}><LeadNotesPanel leadId={lead.id} onChanged={onChanged}/></SectionCard>` (após Tarefas).
- i18n (en+pt paridade): detail.notes, notes.add/placeholder/empty/save/by/etc. Sem hardcoded; service layer only; useMemo; sem zinc-.

## Aceite (gates)
- [ ] my-app tsc 0; i18n paridade.
- [ ] Adicionar nota a um lead → aparece na lista com timestamp; persiste (reload) — validado E2E na instância viva.
- [ ] Não quebra se leadActivities ausente (degrada).

## Anexos — DECISÃO PENDENTE (fora deste slice)
O roadmap marcou #6 como S assumindo "Documents já existe", mas:
- `Document` é modelo Prisma sem vínculo a registro → anexar exige **migration Prisma** (`leadId?` no Document) OU **join table `DocumentAttachment`** (polimórfico, melhor p/ futuro accounts/opps) — ambos = mudança de banco (destrutiva, exige confirmação do contrato).
- O upload de Document dispara o pipeline **RAG (extração + Qdrant)**; Qdrant está **offline** nesta instância → uploads ficariam PENDING/erro. É um pipeline de conhecimento/análise, não um store de anexo simples.
- Opções: (A) `Document.leadId?` + migration + endpoint by-lead (S-M, acopla Document ao CRM); (B) join `DocumentAttachment` polimórfico (M, future-proof); (C) referência leve (documentId string no payload de uma leadActivity) sem migration, mas usa o pipeline RAG/Qdrant; (D) novo store de anexo simples (disco/S3) desacoplado do RAG (L).
- **Recomendação:** decidir com o usuário; provável (B) join table quando #2 Opportunity trouxer mais entidades, OU adiar anexos até Qdrant/file-store estar definido.
