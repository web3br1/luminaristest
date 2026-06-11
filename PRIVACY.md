# Privacy and LGPD Compliance Notes

This document describes how Luminaris processes personal data as a data controller under
Lei Geral de Proteção de Dados Pessoais (LGPD — Lei 13.709/2018), with a focus on data
flows to third-party sub-processors and the rights afforded to data subjects.

---

## Section 1 — Data Flows to Third-Party Services

### OpenAI

| Attribute | Detail |
|---|---|
| **What is sent** | Full text of uploaded documents (PDF, DOCX, XLSX), extracted and forwarded for text extraction, embedding generation, and RAG chat context |
| **When** | On every document upload and on every RAG chat query |
| **OpenAI data processing** | Per OpenAI's API terms, data submitted via the API is not used to train OpenAI models by default |
| **Action required** | Sign an OpenAI Data Processing Agreement (DPA) before handling documents that contain personal data in a production environment |

### Qdrant

| Attribute | Detail |
|---|---|
| **What is stored** | One vector record per document chunk; the payload contains: `textContent` (full chunk text), `fileName`, `userId`, `documentId` |
| **Retention** | Vectors are retained until the associated document is explicitly deleted. User account deletion removes all vectors for that user (implemented in the user-deletion endpoint) |
| **Action required** | If using Qdrant Cloud, sign a DPA with Qdrant's cloud provider before storing documents that contain personal data |

---

## Section 2 — User Rights under LGPD Art. 18

| Right | Status | How |
|---|---|---|
| **Access (Art. 18, I)** | Implemented | `GET /api/documents` — returns all documents belonging to the authenticated user |
| **Deletion (Art. 18, VI)** | Implemented | `DELETE /api/users/:id` — removes the user record from the SQL database and all associated vectors from Qdrant |
| **Correction (Art. 18, III)** | Partial | Users can re-upload a corrected version of a document; no in-place edit endpoint exists yet |
| **Portability (Art. 18, V)** | Not implemented | No data-export endpoint exists; must be added before production launch |
| **Revocation of consent (Art. 18, IX)** | Not implemented | No consent-management flow exists; users cannot withdraw consent for AI processing without deleting their entire account |

---

## Section 3 — Recommended Actions Before Production

- [ ] Sign the OpenAI Data Processing Agreement (DPA) at <https://platform.openai.com/settings/organization/legal>
- [ ] Sign a DPA with the Qdrant cloud provider if using Qdrant Cloud instead of self-hosted Qdrant
- [ ] Add a privacy notice / cookie banner to the user registration UI disclosing that document content is sent to OpenAI
- [ ] Implement a data-export endpoint (portability — LGPD Art. 18, V)
- [ ] Add an explicit consent checkbox for AI document processing at registration or first upload
- [ ] Implement a soft-delete purge job to enforce a data-retention time limit for deleted documents and vectors
- [ ] Complete a RIPD (Relatório de Impacto à Proteção de Dados Pessoais) as required by LGPD Art. 38 for high-risk processing activities

---

*Last updated: 2026-06-11*
