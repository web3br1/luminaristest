/**
 * @openapi
 * tags:
 *   - name: Auth
 *     description: Authentication and session management
 *   - name: Users
 *     description: User management (admin operations)
 *   - name: Documents
 *     description: Document upload, search and management
 *   - name: DynamicTables
 *     description: Dynamic data tables (schema + rows)
 *   - name: Dashboard
 *     description: Dashboard setup and data endpoints
 *   - name: DashboardLayout
 *     description: Saved widget layouts per user
 *   - name: SavedViews
 *     description: Per-user saved table views (query/filters/sort)
 *   - name: Analytics
 *     description: Analytics presets, chart data and KPI discovery
 *   - name: AnalyticsDefinitions
 *     description: Persisted analytics definition rows (CORE table proxy)
 *   - name: Chat
 *     description: AI chat completions
 *   - name: ChatInstances
 *     description: Chat session instances
 *   - name: ChatMessages
 *     description: Messages within a chat instance
 *   - name: Reports
 *     description: Server-sent-event report generation
 *   - name: StructuredData
 *     description: Structured data extracted from documents
 *
 * x-response-envelope: |
 *   Most success responses use { success: true, data: <payload> }.
 *   Error responses use { success: false, error: <string|object> } or, for
 *   framework-level errors, { error: <string>, message: <string> }.
 *   The 204 No Content responses have an empty body.
 *
 * paths:
 *
 *   # ─── AUTH ──────────────────────────────────────────────────────────────
 *
 *   /api/auth/register:
 *     post:
 *       summary: Register a new user account
 *       tags: [Auth]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [username, email, password]
 *               properties:
 *                 username:
 *                   type: string
 *                   minLength: 3
 *                 email:
 *                   type: string
 *                   format: email
 *                 password:
 *                   type: string
 *                   minLength: 8
 *                 name:
 *                   type: string
 *                   description: Display name (optional)
 *       responses:
 *         '201':
 *           description: User created – returns JWT token and user profile
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data:
 *                     type: object
 *                     properties:
 *                       user:
 *                         type: object
 *                         properties:
 *                           id: { type: string }
 *                           username: { type: string }
 *                           email: { type: string }
 *                           name: { type: string }
 *                           role: { type: string, enum: [USER, ADMIN] }
 *                           createdAt: { type: string, format: date-time }
 *                       token: { type: string, description: Bearer JWT }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '500': { $ref: '#/components/responses/InternalServerError' }
 *
 *   /api/auth/login:
 *     post:
 *       summary: Authenticate user and obtain a JWT token
 *       tags: [Auth]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [identifier, password]
 *               properties:
 *                 identifier:
 *                   type: string
 *                   description: Username or email address
 *                 password:
 *                   type: string
 *       responses:
 *         '200':
 *           description: Login successful – returns JWT token and user profile
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data:
 *                     type: object
 *                     properties:
 *                       user:
 *                         type: object
 *                         properties:
 *                           id: { type: string }
 *                           username: { type: string }
 *                           email: { type: string }
 *                           name: { type: string }
 *                           role: { type: string, enum: [USER, ADMIN] }
 *                       token: { type: string, description: Bearer JWT }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '429': { description: Too many login attempts }
 *         '500': { $ref: '#/components/responses/InternalServerError' }
 *
 *   /api/auth/me:
 *     get:
 *       summary: Get the currently authenticated user profile
 *       tags: [Auth]
 *       security: [{ bearerAuth: [] }]
 *       responses:
 *         '200':
 *           description: Current user profile
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '500': { $ref: '#/components/responses/InternalServerError' }
 *
 *   /api/auth/logout:
 *     post:
 *       summary: Logout and invalidate the current session
 *       tags: [Auth]
 *       security: [{ bearerAuth: [] }]
 *       responses:
 *         '204': { description: Logout successful – no content }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '500': { $ref: '#/components/responses/InternalServerError' }
 *
 *   # ─── USERS ──────────────────────────────────────────────────────────────
 *
 *   /api/users:
 *     get:
 *       summary: List users (paginated)
 *       tags: [Users]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: query
 *           name: page
 *           schema: { type: integer, default: 1, minimum: 1 }
 *         - in: query
 *           name: limit
 *           schema: { type: integer, default: 10, minimum: 1, maximum: 100 }
 *       responses:
 *         '200':
 *           description: Paginated user list
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean }
 *                   data:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         id: { type: string }
 *                         name: { type: string }
 *                         username: { type: string }
 *                         email: { type: string }
 *                         role: { type: string }
 *                         createdAt: { type: string, format: date-time }
 *                   pagination:
 *                     type: object
 *                     properties:
 *                       page: { type: integer }
 *                       limit: { type: integer }
 *                       totalCount: { type: integer }
 *                       totalPages: { type: integer }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '500': { $ref: '#/components/responses/InternalServerError' }
 *     post:
 *       summary: Create a new user (admin or public signup)
 *       tags: [Users]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [username, email, password]
 *               properties:
 *                 username: { type: string, minLength: 3 }
 *                 email: { type: string, format: email }
 *                 password: { type: string, minLength: 6 }
 *                 name: { type: string }
 *                 role: { type: string, enum: [USER, ADMIN] }
 *       responses:
 *         '201': { description: User created successfully }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '409': { description: Username or email already exists }
 *         '500': { $ref: '#/components/responses/InternalServerError' }
 *
 *   /api/users/me/preferences:
 *     patch:
 *       summary: Update the authenticated user's locale and currency preferences
 *       tags: [Users]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 locale: { type: string, enum: [en, pt] }
 *                 currency: { type: string, enum: [BRL, USD, EUR] }
 *       responses:
 *         '200': { description: Preferences updated }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/users/{id}:
 *     get:
 *       summary: Get a user by ID
 *       tags: [Users]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - name: id
 *           in: path
 *           required: true
 *           schema: { type: string, format: cuid }
 *       responses:
 *         '200': { description: User object }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *     put:
 *       summary: Update a user by ID (admin)
 *       tags: [Users]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - name: id
 *           in: path
 *           required: true
 *           schema: { type: string, format: cuid }
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 name: { type: string }
 *                 username: { type: string, minLength: 3 }
 *                 email: { type: string, format: email }
 *                 password: { type: string, minLength: 6 }
 *                 role: { type: string, enum: [USER, ADMIN] }
 *       responses:
 *         '200': { description: Updated user }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '403': { $ref: '#/components/responses/ForbiddenError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *     delete:
 *       summary: Delete a user by ID (admin)
 *       tags: [Users]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - name: id
 *           in: path
 *           required: true
 *           schema: { type: string, format: cuid }
 *       responses:
 *         '200': { description: User deleted successfully }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '403': { $ref: '#/components/responses/ForbiddenError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   # ─── DOCUMENTS ──────────────────────────────────────────────────────────
 *
 *   /api/documents:
 *     get:
 *       summary: List documents (paginated)
 *       tags: [Documents]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: query
 *           name: page
 *           schema: { type: integer, default: 1 }
 *         - in: query
 *           name: limit
 *           schema: { type: integer, default: 10 }
 *       responses:
 *         '200': { description: Paginated document list }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/documents/list:
 *     get:
 *       summary: Get a lightweight list of document names and IDs
 *       tags: [Documents]
 *       security: [{ bearerAuth: [] }]
 *       responses:
 *         '200': { description: 'Array of id and name objects' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/documents/upload:
 *     post:
 *       summary: Upload a document file
 *       tags: [Documents]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           multipart/form-data:
 *             schema:
 *               type: object
 *               properties:
 *                 file: { type: string, format: binary }
 *       responses:
 *         '201': { description: Document uploaded and queued for processing }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/documents/search:
 *     post:
 *       summary: Semantic / vector search across documents
 *       tags: [Documents]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [query]
 *               properties:
 *                 query: { type: string }
 *                 limit: { type: integer, default: 5 }
 *       responses:
 *         '200': { description: Matching document excerpts }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/documents/token-cost:
 *     post:
 *       summary: Estimate token cost for a file before uploading
 *       tags: [Documents]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           multipart/form-data:
 *             schema:
 *               type: object
 *               properties:
 *                 file: { type: string, format: binary }
 *       responses:
 *         '200': { description: Token count estimate }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/documents/qdrant-status:
 *     get:
 *       summary: Get Qdrant vector collection status
 *       tags: [Documents]
 *       security: [{ bearerAuth: [] }]
 *       responses:
 *         '200': { description: Qdrant collection health and point count }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/documents/{id}:
 *     get:
 *       summary: Get a document by ID
 *       tags: [Documents]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: id
 *           required: true
 *           schema: { type: string, format: cuid }
 *       responses:
 *         '200': { description: Document object }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *     patch:
 *       summary: Update document metadata
 *       tags: [Documents]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: id
 *           required: true
 *           schema: { type: string, format: cuid }
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       responses:
 *         '200': { description: Updated document }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *     delete:
 *       summary: Delete a document
 *       tags: [Documents]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: id
 *           required: true
 *           schema: { type: string, format: cuid }
 *       responses:
 *         '204': { description: Deleted }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/documents/{id}/qdrant:
 *     get:
 *       summary: Get Qdrant vector points for a specific document
 *       tags: [Documents]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: id
 *           required: true
 *           schema: { type: string }
 *       responses:
 *         '200': { description: Vector points }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   # ─── DYNAMIC TABLES ─────────────────────────────────────────────────────
 *
 *   /api/dynamic-tables:
 *     get:
 *       summary: List all dynamic tables for the current user
 *       tags: [DynamicTables]
 *       security: [{ bearerAuth: [] }]
 *       responses:
 *         '200': { description: Array of table definitions }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/dynamic-tables/lookup:
 *     post:
 *       summary: Resolve relation values across tables (batch lookup)
 *       tags: [DynamicTables]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       responses:
 *         '200': { description: Resolved relation values }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/dynamic-tables/sync-preset:
 *     post:
 *       summary: Additively evolve an installed table's schema from its preset (admin-only)
 *       description: >
 *         Computes the additive delta (new fields + new select options) between the
 *         preset module and the user's installed table identified by internalName, then
 *         applies it via the engine's revalidating schema update. Never removes/renames
 *         fields or options. Idempotent: a second call with no preset changes is a no-op.
 *         Requires ADMIN role.
 *       tags: [DynamicTables]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [internalName]
 *               properties:
 *                 internalName:
 *                   type: string
 *                   description: Stable preset key of the installed table (e.g. 'leads')
 *       responses:
 *         '200': { description: 'Applied delta { added, optionsAdded }' }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '403': { $ref: '#/components/responses/ForbiddenError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/dynamic-tables/install-table:
 *     post:
 *       summary: Install ONE new table from its preset into an already-installed tenant (admin-only)
 *       description: >
 *         Idempotently installs a single preset table (identified by internalName) for the
 *         current tenant. If the table already exists it is a no-op (created=false). Relation
 *         markers (@@PRESET_TABLE_KEY::x) are resolved to the user's REAL installed table ids;
 *         a missing dependency table yields 404. Requires ADMIN role.
 *       tags: [DynamicTables]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [internalName]
 *               properties:
 *                 internalName:
 *                   type: string
 *                   description: Stable preset key of the table to install (e.g. 'crmOpportunities')
 *       responses:
 *         '200': { description: 'Install result { tableId, created }' }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '403': { $ref: '#/components/responses/ForbiddenError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/dynamic-tables/{tableId}:
 *     get:
 *       summary: Get a dynamic table schema by ID
 *       tags: [DynamicTables]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: tableId
 *           required: true
 *           schema: { type: string, format: cuid }
 *       responses:
 *         '200': { description: Table definition with schema }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/dynamic-tables/{tableId}/data:
 *     get:
 *       summary: Get all data rows for a dynamic table
 *       tags: [DynamicTables]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: tableId
 *           required: true
 *           schema: { type: string, format: cuid }
 *       responses:
 *         '200': { description: Array of data rows }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *     post:
 *       summary: Create a new data row in a dynamic table
 *       tags: [DynamicTables]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: tableId
 *           required: true
 *           schema: { type: string, format: cuid }
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: Arbitrary key-value pairs matching the table schema fields
 *       responses:
 *         '201': { description: Row created }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/dynamic-tables/{tableId}/data/{dataId}:
 *     put:
 *       summary: Update a data row in a dynamic table
 *       tags: [DynamicTables]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: tableId
 *           required: true
 *           schema: { type: string, format: cuid }
 *         - in: path
 *           name: dataId
 *           required: true
 *           schema: { type: string, format: cuid }
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: Fields to update – merges with existing row data
 *       responses:
 *         '200': { description: Row updated }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *     delete:
 *       summary: Delete a data row from a dynamic table
 *       tags: [DynamicTables]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: tableId
 *           required: true
 *           schema: { type: string, format: cuid }
 *         - in: path
 *           name: dataId
 *           required: true
 *           schema: { type: string, format: cuid }
 *       responses:
 *         '204': { description: Row deleted }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/dynamic-tables/{tableId}/data/batch-delete:
 *     post:
 *       summary: Soft-delete multiple data rows in a dynamic table (atomic)
 *       description: >
 *         Deletes up to 200 rows in a single transaction. Every id must belong to
 *         the given table and the caller; if any id is cross-tenant or foreign the
 *         whole batch rolls back (404).
 *       tags: [DynamicTables]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: tableId
 *           required: true
 *           schema: { type: string, format: cuid }
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [ids]
 *               properties:
 *                 ids:
 *                   type: array
 *                   minItems: 1
 *                   maxItems: 200
 *                   items: { type: string, format: cuid }
 *       responses:
 *         '200': { description: 'Rows deleted; returns { deleted: number }' }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   # ─── DASHBOARD ──────────────────────────────────────────────────────────
 *
 *   /api/dashboard/create:
 *     post:
 *       summary: Create a new dashboard (installs table preset suite for the user)
 *       description: >
 *         Accepts either a quick creation payload (suiteKey) or a custom preset
 *         payload (presetKey + optional removedTables / addedFields).
 *         Returns 403 if the user already has tables configured.
 *       tags: [Dashboard]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   required: [suiteKey]
 *                   properties:
 *                     mode: { type: string, enum: [quick] }
 *                     suiteKey: { type: string, description: Preset suite key, e.g. "agronegocio" }
 *                 - type: object
 *                   required: [mode, presetKey]
 *                   properties:
 *                     mode: { type: string, enum: [custom] }
 *                     presetKey: { type: string }
 *                     removedTables:
 *                       type: array
 *                       items: { type: string }
 *                     addedFields:
 *                       type: object
 *                       additionalProperties:
 *                         type: array
 *                         items: { type: object }
 *       responses:
 *         '201':
 *           description: Dashboard created successfully
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   message: { type: string }
 *                   data: { type: object }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '403': { $ref: '#/components/responses/ForbiddenError' }
 *
 *   /api/dashboard/data:
 *     get:
 *       summary: Get all dynamic tables belonging to the current user (dashboard data)
 *       tags: [Dashboard]
 *       security: [{ bearerAuth: [] }]
 *       responses:
 *         '200': { description: Array of table definitions }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/dashboard/presets:
 *     get:
 *       summary: List available dashboard preset suites
 *       tags: [Dashboard]
 *       security: [{ bearerAuth: [] }]
 *       responses:
 *         '200': { description: Array of preset summaries }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/dashboard/presets/{presetKey}:
 *     get:
 *       summary: Get a specific dashboard preset by key
 *       tags: [Dashboard]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: presetKey
 *           required: true
 *           schema: { type: string }
 *       responses:
 *         '200': { description: Preset detail }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/dashboard/sidebar:
 *     get:
 *       summary: Get sidebar category counts for the current user's tables
 *       tags: [Dashboard]
 *       security: [{ bearerAuth: [] }]
 *       responses:
 *         '200':
 *           description: Array of category entries with display info and table count
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean }
 *                   data:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         key: { type: string }
 *                         displayName: { type: string }
 *                         i18nKey: { type: string }
 *                         icon: { type: string }
 *                         count: { type: integer }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/dashboard/system:
 *     delete:
 *       summary: Delete all tables and data for the current user (reset dashboard)
 *       tags: [Dashboard]
 *       security: [{ bearerAuth: [] }]
 *       responses:
 *         '204': { description: All user tables deleted }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   # ─── DASHBOARD LAYOUT ───────────────────────────────────────────────────
 *
 *   /api/dashboard-layout:
 *     get:
 *       summary: List all dashboard widget layouts for the current user
 *       tags: [DashboardLayout]
 *       security: [{ bearerAuth: [] }]
 *       responses:
 *         '200': { description: Array of layout objects }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *     post:
 *       summary: Save a new dashboard widget layout
 *       tags: [DashboardLayout]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CreateDashboardLayoutDto' }
 *       responses:
 *         '201': { description: Layout created }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/dashboard-layout/{id}:
 *     get:
 *       summary: Get a dashboard layout by ID
 *       tags: [DashboardLayout]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: id
 *           required: true
 *           schema: { type: string, format: cuid }
 *       responses:
 *         '200': { description: Layout }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *     patch:
 *       summary: Update a dashboard layout
 *       tags: [DashboardLayout]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: id
 *           required: true
 *           schema: { type: string, format: cuid }
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/UpdateDashboardLayoutDto' }
 *       responses:
 *         '200': { description: Updated layout }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *     delete:
 *       summary: Delete a dashboard layout
 *       tags: [DashboardLayout]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: id
 *           required: true
 *           schema: { type: string, format: cuid }
 *       responses:
 *         '204': { description: Deleted }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   # ─── SAVED VIEWS ────────────────────────────────────────────────────────
 *
 *   /api/saved-views:
 *     get:
 *       summary: List the current user's saved views for a table
 *       tags: [SavedViews]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: query
 *           name: tableId
 *           required: true
 *           schema: { type: string }
 *       responses:
 *         '200': { description: Array of saved views }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *     post:
 *       summary: Create a saved view
 *       tags: [SavedViews]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CreateSavedTableView' }
 *       responses:
 *         '201': { description: Saved view created }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/saved-views/{id}:
 *     patch:
 *       summary: Update a saved view
 *       tags: [SavedViews]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: id
 *           required: true
 *           schema: { type: string, format: cuid }
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/UpdateSavedTableView' }
 *       responses:
 *         '200': { description: Updated saved view }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *     delete:
 *       summary: Delete a saved view (soft-delete)
 *       tags: [SavedViews]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: id
 *           required: true
 *           schema: { type: string, format: cuid }
 *       responses:
 *         '200': { description: Saved view deleted }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   # ─── ANALYTICS ──────────────────────────────────────────────────────────
 *
 *   /api/analytics/presets:
 *     get:
 *       summary: List all analytics preset groups for the current user
 *       tags: [Analytics]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: query
 *           name: presetKey
 *           schema: { type: string }
 *           description: Filter by a specific preset key
 *       responses:
 *         '200': { description: Array of preset group objects }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/analytics/data:
 *     get:
 *       summary: Get resolved chart data for a given analytics key
 *       tags: [Analytics]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: query
 *           name: key
 *           required: true
 *           schema: { type: string }
 *           description: Analytics chart key
 *         - in: query
 *           name: tableId
 *           schema: { type: string, format: cuid }
 *           description: Optional target table ID override
 *       responses:
 *         '200':
 *           description: Resolved chart data
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean }
 *                   data: { type: object }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/analytics/drill-down:
 *     get:
 *       summary: Get drill-down row data for specific record IDs from a table
 *       tags: [Analytics]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: query
 *           name: tableId
 *           required: true
 *           schema: { type: string, format: cuid }
 *         - in: query
 *           name: recordIds
 *           required: true
 *           schema: { type: string }
 *           description: Comma-separated list of row IDs
 *         - in: query
 *           name: fields
 *           schema: { type: string }
 *           description: Comma-separated list of field names to return (all if omitted)
 *         - in: query
 *           name: page
 *           schema: { type: integer, default: 1 }
 *         - in: query
 *           name: limit
 *           schema: { type: integer, default: 20 }
 *       responses:
 *         '200': { description: Paginated drill-down rows }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/analytics/discover/{tableId}:
 *     get:
 *       summary: Auto-discover KPI suggestions for a dynamic table
 *       tags: [Analytics]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: tableId
 *           required: true
 *           schema: { type: string, format: cuid }
 *       responses:
 *         '200': { description: Suggested KPI groups }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/analytics/presets/{presetKey}:
 *     get:
 *       summary: Get analytics preset groups for a specific preset key
 *       tags: [Analytics]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: presetKey
 *           required: true
 *           schema: { type: string }
 *       responses:
 *         '200': { description: Preset analytics groups }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/analytics/presets/{presetKey}/data:
 *     get:
 *       summary: Get chart data scoped to a preset
 *       tags: [Analytics]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: presetKey
 *           required: true
 *           schema: { type: string }
 *         - in: query
 *           name: key
 *           required: true
 *           schema: { type: string }
 *       responses:
 *         '200': { description: Chart data }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/analytics/chart/{chartKey}/details:
 *     get:
 *       summary: Get paginated detail rows for a chart data point
 *       tags: [Analytics]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: chartKey
 *           required: true
 *           schema: { type: string }
 *         - in: query
 *           name: dataPointName
 *           schema: { type: string }
 *         - in: query
 *           name: page
 *           schema: { type: integer, default: 1 }
 *         - in: query
 *           name: limit
 *           schema: { type: integer, default: 50 }
 *         - in: query
 *           name: search
 *           schema: { type: string }
 *         - in: query
 *           name: sortBy
 *           schema: { type: string }
 *         - in: query
 *           name: sortOrder
 *           schema: { type: string, enum: [asc, desc], default: desc }
 *       responses:
 *         '200': { description: Paginated detail records }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   # ─── ANALYTICS DEFINITIONS ──────────────────────────────────────────────
 *
 *   /api/analytics/definitions:
 *     get:
 *       summary: List persisted analytics definitions for the current user
 *       tags: [AnalyticsDefinitions]
 *       security: [{ bearerAuth: [] }]
 *       responses:
 *         '200': { description: Array of analytics definition rows }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *     post:
 *       summary: Create a new analytics definition
 *       tags: [AnalyticsDefinitions]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       responses:
 *         '201': { description: Definition created }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/analytics/definitions/{id}:
 *     put:
 *       summary: Update an analytics definition
 *       tags: [AnalyticsDefinitions]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: id
 *           required: true
 *           schema: { type: string, format: cuid }
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       responses:
 *         '200': { description: Definition updated }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *     delete:
 *       summary: Delete an analytics definition
 *       tags: [AnalyticsDefinitions]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: id
 *           required: true
 *           schema: { type: string, format: cuid }
 *       responses:
 *         '200': { description: Definition deleted }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   # ─── CHAT ───────────────────────────────────────────────────────────────
 *
 *   /api/chat:
 *     post:
 *       summary: Generate an AI chat completion
 *       tags: [Chat]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       responses:
 *         '200': { description: AI-generated response }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '429': { description: Rate limit exceeded (20 req/min per user) }
 *
 *   # ─── CHAT INSTANCES ─────────────────────────────────────────────────────
 *
 *   /api/chat-instances:
 *     get:
 *       summary: List chat instances for the current user
 *       tags: [ChatInstances]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: query
 *           name: page
 *           schema: { type: integer, default: 1 }
 *         - in: query
 *           name: limit
 *           schema: { type: integer, default: 10 }
 *         - in: query
 *           name: type
 *           schema: { type: string, enum: [DOCUMENT, GENERIC] }
 *       responses:
 *         '200': { description: List of chat instances }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *     post:
 *       summary: Create a new chat instance
 *       tags: [ChatInstances]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       responses:
 *         '201': { description: Chat instance created }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/chat-instances/get-or-create:
 *     post:
 *       summary: Get an existing chat instance by widget ID or create one
 *       tags: [ChatInstances]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [widgetInstanceId, type]
 *               properties:
 *                 widgetInstanceId: { type: string }
 *                 type: { type: string, enum: [DOCUMENT, GENERIC] }
 *       responses:
 *         '200': { description: Existing or newly created chat instance }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/chat-instances/{id}:
 *     put:
 *       summary: Update a chat instance
 *       tags: [ChatInstances]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: id
 *           required: true
 *           schema: { type: string, format: cuid }
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       responses:
 *         '200': { description: Updated instance }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *     delete:
 *       summary: Delete a chat instance
 *       tags: [ChatInstances]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: id
 *           required: true
 *           schema: { type: string, format: cuid }
 *       responses:
 *         '200': { description: Instance deleted }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   # ─── CHAT MESSAGES ──────────────────────────────────────────────────────
 *
 *   /api/chat-messages:
 *     get:
 *       summary: List chat messages (optionally filtered by instance)
 *       tags: [ChatMessages]
 *       security: [{ bearerAuth: [] }]
 *       responses:
 *         '200': { description: List of messages }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *     post:
 *       summary: Create a new chat message
 *       tags: [ChatMessages]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       responses:
 *         '201': { description: Message created }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   # ─── STRUCTURED DATA ────────────────────────────────────────────────────
 *
 *   /api/structured-data/{documentId}:
 *     get:
 *       summary: Get structured data extracted from a specific document
 *       tags: [StructuredData]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: documentId
 *           required: true
 *           schema: { type: string }
 *       responses:
 *         '200': { description: Extracted structured data }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   # ─── REPORTS ────────────────────────────────────────────────────────────
 *
 *   /api/reports/generate-chart-data:
 *     post:
 *       summary: Generate chart data via Server-Sent Events stream
 *       tags: [Reports]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       responses:
 *         '200':
 *           description: SSE stream of progress events and final chart data
 *           content:
 *             text/event-stream:
 *               schema:
 *                 type: string
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/crm/pipeline/advance:
 *     post:
 *       summary: Advance a lead to a target stage (with optional proposal side-effect)
 *       tags: [CRM]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdvanceStageInput' }
 *       responses:
 *         '200':
 *           description: Updated lead record
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data: { type: object }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/crm/pipeline/proposal:
 *     post:
 *       summary: Create a standalone proposal and refresh the lead snapshot
 *       tags: [CRM]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [leadId, amount]
 *               properties:
 *                 leadId: { type: string }
 *                 amount: { type: number }
 *                 currency: { type: string, enum: [BRL, USD, EUR] }
 *                 winProbability: { type: number }
 *                 estimatedCloseDate: { type: string }
 *       responses:
 *         '201':
 *           description: Created proposal record
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data: { type: object }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/crm/pipeline/no-show:
 *     post:
 *       summary: Record a meeting no-show (reschedule or revert the lead stage)
 *       tags: [CRM]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [leadId, option]
 *               properties:
 *                 leadId: { type: string }
 *                 option: { type: string, enum: [reschedule, revert] }
 *                 rescheduleAt: { type: string, format: date-time }
 *                 previousStageId: { type: string }
 *       responses:
 *         '200':
 *           description: Acknowledgement
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data: { type: object, properties: { ok: { type: boolean } } }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/crm/pipeline/convert-lead:
 *     post:
 *       summary: Convert a lead into an Account (+ optional Contact), atomically
 *       tags: [CRM]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ConvertLeadInput' }
 *       responses:
 *         '201':
 *           description: Created account + contact and the updated (converted) lead
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data:
 *                     type: object
 *                     properties:
 *                       account: { type: object }
 *                       contact: { type: object }
 *                       lead:    { type: object }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/crm/pipeline/advance-opportunity:
 *     post:
 *       summary: Advance an opportunity to a target stage (first-class Opportunity)
 *       tags: [CRM]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/AdvanceOpportunityInput' }
 *       responses:
 *         '200': { description: The updated opportunity }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/crm/pipeline/convert-lead-to-opportunity:
 *     post:
 *       summary: Create a first-class opportunity from a lead (the lead is NOT consumed)
 *       tags: [CRM]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ConvertLeadToOpportunityInput' }
 *       responses:
 *         '201': { description: The created opportunity }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/crm/pipeline-analytics:
 *     get:
 *       summary: Aggregated CRM KPI bundle over the leads dataset
 *       tags: [CRM]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: query
 *           name: datePreset
 *           schema: { type: string, enum: [today, thisWeek, thisMonth, last30Days, lastMonth, thisYear] }
 *       responses:
 *         '200':
 *           description: Keyed bundle of chart-ready KPI series (cards, funnel, source, status, bant, proposals, activities)
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data: { type: object }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/crm/attachments:
 *     post:
 *       summary: Upload a downloadable file attachment for a CRM record
 *       tags: [CRM Attachments]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           multipart/form-data:
 *             schema:
 *               type: object
 *               required: [file, entityType, entityId]
 *               properties:
 *                 file: { type: string, format: binary }
 *                 entityType: { type: string, enum: [lead, account, contact] }
 *                 entityId: { type: string }
 *       responses:
 *         '201':
 *           description: Created attachment metadata
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data: { $ref: '#/components/schemas/Attachment' }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '413': { description: File too large (max 25 MB) }
 *         '415': { description: File type not supported or content/type mismatch }
 *     get:
 *       summary: List active attachments for a CRM record
 *       tags: [CRM Attachments]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: query
 *           name: entityType
 *           required: true
 *           schema: { type: string, enum: [lead, account, contact] }
 *         - in: query
 *           name: entityId
 *           required: true
 *           schema: { type: string }
 *       responses:
 *         '200':
 *           description: List of attachment metadata
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data:
 *                     type: array
 *                     items: { $ref: '#/components/schemas/Attachment' }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/crm/attachments/{id}/download:
 *     get:
 *       summary: Download an attachment binary (streamed)
 *       tags: [CRM Attachments]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: id
 *           required: true
 *           schema: { type: string }
 *       responses:
 *         '200':
 *           description: The attachment file stream
 *           content:
 *             application/octet-stream:
 *               schema: { type: string, format: binary }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/crm/attachments/{id}:
 *     delete:
 *       summary: Soft-delete an attachment (and remove its binary)
 *       tags: [CRM Attachments]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: id
 *           required: true
 *           schema: { type: string }
 *       responses:
 *         '200':
 *           description: Acknowledgement
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data: { type: object, properties: { ok: { type: boolean } } }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/sales/cancel:
 *     post:
 *       summary: Cancel a finalized salon sale (status → Cancelled; reverses the revenue entry)
 *       tags: [Sales]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [tableId, saleId]
 *               properties:
 *                 tableId: { type: string }
 *                 saleId:  { type: string }
 *                 reason:  { type: string, description: "Optional reason recorded on the sale (audit)." }
 *       responses:
 *         '200':
 *           description: Updated sale record (status Cancelled)
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data: { type: object }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/sales/return:
 *     post:
 *       summary: Return a finalized salon sale (status → Returned; books a contra-revenue entry)
 *       tags: [Sales]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [tableId, saleId]
 *               properties:
 *                 tableId: { type: string }
 *                 saleId:  { type: string }
 *                 reason:  { type: string, description: "Optional reason recorded on the sale (audit)." }
 *       responses:
 *         '200':
 *           description: Updated sale record (status Returned)
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data: { type: object }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/sales/pay:
 *     post:
 *       summary: Register payment for a finalized salon sale (paymentStatus → Paid; books the settlement entry)
 *       description: >-
 *         The only sanctioned path to move a Finalized sale to Paid. Performs a whitelisted
 *         isSystem write (paymentStatus/paymentMethod/paidAt/paidByUserId/paymentReference) and,
 *         post-commit, books D <account by paymentMethod> / C 1.1.2 A Receber (sourceType
 *         salon.sale.settled). Settlement is deferred if the revenue entry does not yet exist.
 *       tags: [Sales]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [tableId, saleId, paymentMethod]
 *               properties:
 *                 tableId:          { type: string }
 *                 saleId:           { type: string }
 *                 paymentMethod:    { type: string, enum: [Credit Card, Debit Card, Cash, Pix, Package Balance] }
 *                 paidAt:           { type: string, description: "ISO datetime the payment occurred (settlement date). Defaults to now." }
 *                 paymentReference: { type: string, description: "Optional external reference (NSU, transaction id…)." }
 *       responses:
 *         '200':
 *           description: Updated sale record (paymentStatus Paid)
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data: { type: object }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 * components:
 *   responses:
 *     BadRequestError:
 *       description: Invalid request payload or missing required fields
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success: { type: boolean, example: false }
 *               error: { type: string }
 *     UnauthorizedError:
 *       description: Missing or invalid authentication token
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success: { type: boolean, example: false }
 *               error: { type: string, example: Authentication required }
 *     ForbiddenError:
 *       description: Authenticated but not authorised to perform this action
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success: { type: boolean, example: false }
 *               error: { type: string, example: Forbidden }
 *     NotFoundError:
 *       description: Resource not found
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success: { type: boolean, example: false }
 *               error: { type: string, example: Not found }
 *     InternalServerError:
 *       description: Unexpected server error
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               success: { type: boolean, example: false }
 *               error: { type: string }
 *   schemas:
 *     DocumentAttachment:
 *       type: object
 *       required: [id, targetType, targetId, fileName, mimeType, fileSize, sha256, createdAt]
 *       properties:
 *         id:           { type: string, format: cuid }
 *         targetType:   { type: string, enum: [JOURNAL_ENTRY] }
 *         targetId:     { type: string }
 *         fileName:     { type: string }
 *         mimeType:     { type: string }
 *         fileSize:     { type: integer }
 *         sha256:       { type: string, description: 64-char hex checksum }
 *         uploadedById: { type: string, nullable: true }
 *         createdAt:    { type: string, format: date-time }
 *         deletedAt:    { type: string, format: date-time, nullable: true }
 */

/**
 * @openapi
 * tags:
 *   - name: Accounting
 *     description: Double-entry accounting — journal entries, reversals, reports, chart of accounts (first-class Prisma)
 *
 * paths:
 *
 *   # ─── ACCOUNTING ────────────────────────────────────────────────────────
 *
 *   /api/accounting/post:
 *     post:
 *       summary: Post a balanced double-entry journal entry
 *       description: ΣdebitCents must equal ΣcreditCents (exact integer equality). Idempotent on (sourceType, sourceId) per unit.
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [unitId, date, description, lines]
 *               properties:
 *                 unitId:      { type: string }
 *                 date:        { type: string, description: ISO date/datetime string }
 *                 description: { type: string }
 *                 sourceType:  { type: string, default: manual }
 *                 sourceId:    { type: string }
 *                 lines:
 *                   type: array
 *                   minItems: 2
 *                   items:
 *                     type: object
 *                     required: [accountCode, debitCents, creditCents]
 *                     properties:
 *                       accountCode: { type: string, description: Code of a leaf account (acceptsEntries=true) }
 *                       debitCents:  { type: integer, minimum: 0 }
 *                       creditCents: { type: integer, minimum: 0 }
 *       responses:
 *         '201':
 *           description: Journal entry posted
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data:    { type: object, description: The posted journal entry with its postings }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '403': { $ref: '#/components/responses/ForbiddenError' }
 *         '500': { $ref: '#/components/responses/InternalServerError' }
 *
 *   /api/accounting/reverse:
 *     post:
 *       summary: Reverse a posted journal entry (estorno)
 *       description: Posted entries are immutable; corrections are made via a reversing entry. Idempotent — reversing twice returns the existing reversal.
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [unitId, lancamentoId]
 *               properties:
 *                 unitId:       { type: string }
 *                 lancamentoId: { type: string }
 *                 reason:       { type: string }
 *       responses:
 *         '200':
 *           description: Reversing entry created (or the existing one if already reversed)
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data:    { type: object }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '403': { $ref: '#/components/responses/ForbiddenError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *         '500': { $ref: '#/components/responses/InternalServerError' }
 *
 *   /api/accounting/trial-balance:
 *     get:
 *       summary: Trial balance (balancete) for a unit
 *       description: Aggregates Posted + Reversed postings (Draft excluded) per account.
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - { in: query, name: unitId, required: true, schema: { type: string } }
 *         - { in: query, name: from, required: false, schema: { type: string }, description: ISO date — inclusive lower bound }
 *         - { in: query, name: to,   required: false, schema: { type: string }, description: ISO date — inclusive upper bound }
 *       responses:
 *         '200':
 *           description: Trial balance rows
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data:    { type: object }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '500': { $ref: '#/components/responses/InternalServerError' }
 *
 *   /api/accounting/ledger:
 *     get:
 *       summary: Per-account ledger (razão) for a unit
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - { in: query, name: unitId, required: true, schema: { type: string } }
 *         - { in: query, name: accountCode, required: true, schema: { type: string } }
 *         - { in: query, name: from, required: false, schema: { type: string } }
 *         - { in: query, name: to,   required: false, schema: { type: string } }
 *       responses:
 *         '200':
 *           description: Ledger entries for the account
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data:    { type: object }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '500': { $ref: '#/components/responses/InternalServerError' }
 *
 *   /api/accounting/accounts:
 *     get:
 *       summary: List the chart of accounts for a unit
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - { in: query, name: unitId, required: true, schema: { type: string } }
 *       responses:
 *         '200':
 *           description: Accounts list
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data:
 *                     type: object
 *                     properties:
 *                       accounts: { type: array, items: { type: object } }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '500': { $ref: '#/components/responses/InternalServerError' }
 *     post:
 *       summary: Create a user-defined account in the chart of accounts
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [code, name, nature, unitId]
 *               properties:
 *                 code:           { type: string }
 *                 name:           { type: string }
 *                 nature:         { type: string, enum: [Asset, Liability, Equity, Revenue, Expense] }
 *                 acceptsEntries: { type: boolean, default: true }
 *                 unitId:         { type: string }
 *       responses:
 *         '201':
 *           description: Account created
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data:
 *                     type: object
 *                     properties:
 *                       account: { type: object }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '403': { $ref: '#/components/responses/ForbiddenError' }
 *         '500': { $ref: '#/components/responses/InternalServerError' }
 *
 *   /api/accounting/accounts/{id}:
 *     delete:
 *       summary: Soft-delete a user-defined account (unit-scoped)
 *       description: unitId is required so the delete is scoped to its unit. Canonical accounts and accounts with postings cannot be deleted.
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - { in: path,  name: id,     required: true, schema: { type: string } }
 *         - { in: query, name: unitId, required: true, schema: { type: string } }
 *       responses:
 *         '200':
 *           description: Account soft-deleted
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '403': { $ref: '#/components/responses/ForbiddenError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *         '409': { description: Account is canonical or has postings — cannot be deleted }
 *         '500': { $ref: '#/components/responses/InternalServerError' }
 *
 *   /api/accounting/entries:
 *     get:
 *       summary: List journal entries (lançamentos) for a unit, paginated
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - { in: query, name: unitId, required: true, schema: { type: string } }
 *         - { in: query, name: page,  required: false, schema: { type: integer, minimum: 1, default: 1 } }
 *         - { in: query, name: limit, required: false, schema: { type: integer, minimum: 1, maximum: 200, default: 50 } }
 *       responses:
 *         '200':
 *           description: Journal entries page
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data:
 *                     type: object
 *                     properties:
 *                       entries: { type: array, items: { type: object } }
 *                       total:   { type: integer }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '500': { $ref: '#/components/responses/InternalServerError' }
 */

/**
 * @openapi
 * paths:
 *
 *   # ─── ACCOUNTING ATTACHMENTS / EVIDENCE (BE-INCR-5) ───────────────────────
 *
 *   /api/accounting/attachments:
 *     post:
 *       summary: Upload documentary evidence to a journal entry
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           multipart/form-data:
 *             schema:
 *               type: object
 *               required: [unitId, targetId, file]
 *               properties:
 *                 unitId:     { type: string }
 *                 targetType: { type: string, enum: [JOURNAL_ENTRY], default: JOURNAL_ENTRY }
 *                 targetId:   { type: string, description: journal entry id }
 *                 file:       { type: string, format: binary }
 *       responses:
 *         '201':
 *           description: Attachment metadata (binary persisted to disk)
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data:    { $ref: '#/components/schemas/DocumentAttachment' }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *         '413': { description: File too large }
 *         '415': { description: Unsupported media type / content mismatch }
 *         '500': { $ref: '#/components/responses/InternalServerError' }
 *
 *   /api/accounting/attachments/{id}:
 *     get:
 *       summary: Download an attachment binary by id
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - { in: path,  name: id,     required: true, schema: { type: string } }
 *         - { in: query, name: unitId, required: true, schema: { type: string } }
 *       responses:
 *         '200':
 *           description: File stream
 *           content:
 *             application/octet-stream:
 *               schema: { type: string, format: binary }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *         '500': { $ref: '#/components/responses/InternalServerError' }
 *     delete:
 *       summary: Soft-delete an attachment (binary retained for audit)
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - { in: path,  name: id,     required: true, schema: { type: string } }
 *         - { in: query, name: unitId, required: true, schema: { type: string } }
 *       responses:
 *         '200':
 *           description: Soft-deleted
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data: { type: object, properties: { ok: { type: boolean, example: true } } }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *         '500': { $ref: '#/components/responses/InternalServerError' }
 *
 *   /api/accounting/journal-entries/{journalEntryId}/attachments:
 *     get:
 *       summary: List attachments for a journal entry
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - { in: path,  name: journalEntryId, required: true, schema: { type: string } }
 *         - { in: query, name: unitId,         required: true, schema: { type: string } }
 *       responses:
 *         '200':
 *           description: Attachment list
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data: { type: array, items: { $ref: '#/components/schemas/DocumentAttachment' } }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '500': { $ref: '#/components/responses/InternalServerError' }
 */

/**
 * @openapi
 * paths:
 *
 *   # ─── ACCOUNTING PERIODS (INCR-1) ─────────────────────────────────────────
 *
 *   /api/accounting/{unitId}/periods:
 *     get:
 *       summary: List accounting periods for a fiscal year
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - { in: path, name: unitId, required: true, schema: { type: string } }
 *         - { in: query, name: year, required: true, schema: { type: integer } }
 *       responses:
 *         '200':
 *           description: List of accounting periods
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data: { type: array, items: { type: object } }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/accounting/{unitId}/periods/seed-year:
 *     post:
 *       summary: Seed 12 FUTURE periods for a fiscal year
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - { in: path, name: unitId, required: true, schema: { type: string } }
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/SeedYearInput' }
 *       responses:
 *         '201':
 *           description: Periods seeded
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data: { type: array, items: { type: object } }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/accounting/periods/{id}/open:
 *     post:
 *       summary: Open a FUTURE or SOFT_CLOSED period → OPEN
 *       description: "periodSemantics: as_of. Transition recorded in AccountingPeriodTransition."
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - { in: path, name: id, required: true, schema: { type: string }, description: "Period id" }
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [unitId]
 *               properties:
 *                 unitId: { type: string }
 *       responses:
 *         '200': { description: Period opened }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/accounting/periods/{id}/soft-close:
 *     post:
 *       summary: Soft-close an OPEN period (can be reopened)
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - { in: path, name: id, required: true, schema: { type: string } }
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ClosePeriodInput' }
 *       responses:
 *         '200': { description: Period soft-closed }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/accounting/periods/{id}/hard-close:
 *     post:
 *       summary: Permanently close a period (HARD_CLOSED = terminal)
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - { in: path, name: id, required: true, schema: { type: string } }
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ClosePeriodInput' }
 *       responses:
 *         '200': { description: Period hard-closed }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/accounting/periods/{id}/reopen:
 *     post:
 *       summary: Reopen a SOFT_CLOSED period → OPEN (HARD_CLOSED is terminal)
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - { in: path, name: id, required: true, schema: { type: string } }
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ReopenPeriodInput' }
 *       responses:
 *         '200': { description: Period reopened }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 */

/**
 * @openapi
 * components:
 *   schemas:
 *     DataExchangeJob:
 *       type: object
 *       properties:
 *         id:        { type: string }
 *         direction: { type: string, enum: [IMPORT, EXPORT] }
 *         kind:      { type: string }
 *         status:    { type: string }
 *         fileName:  { type: string, nullable: true }
 *         mimeType:  { type: string, nullable: true }
 *         sizeBytes: { type: integer, nullable: true }
 *         sha256:    { type: string, nullable: true }
 *         totalRows: { type: integer }
 *         createdAt: { type: string, format: date-time }
 *
 * paths:
 *
 *   # ─── ACCOUNTING DATA EXCHANGE (BE-INCR-6) ───────────────────────────────
 *
 *   /api/accounting/data-exchange/exports:
 *     post:
 *       summary: Export a report or blank import template to CSV/XLSX
 *       description: Renders read-only report data (trial balance, ledger, BP, DRE) or a blank import template; persists the artifact and returns a job. Download via /jobs/{jobId}/download.
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [kind, format, unitId]
 *               properties:
 *                 kind:         { type: string, enum: [EXPORT_TRIAL_BALANCE, EXPORT_GENERAL_LEDGER, EXPORT_BALANCE_SHEET, EXPORT_INCOME_STATEMENT, EXPORT_TEMPLATE] }
 *                 format:       { type: string, enum: [csv, xlsx] }
 *                 unitId:       { type: string }
 *                 asOf:         { type: string, description: 'YYYY-MM-DD — required for BP/DRE' }
 *                 accountCode:  { type: string, description: 'required for EXPORT_GENERAL_LEDGER' }
 *                 templateKind: { type: string, enum: [IMPORT_CHART_OF_ACCOUNTS, IMPORT_OPENING_BALANCES, IMPORT_JOURNAL_ENTRIES], description: 'required for EXPORT_TEMPLATE' }
 *       responses:
 *         '201':
 *           description: Export job created
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data:    { $ref: '#/components/schemas/DataExchangeJob' }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '403': { $ref: '#/components/responses/ForbiddenError' }
 *
 *   /api/accounting/sped/ecd/generate:
 *     post:
 *       summary: Generate the SPED Contábil (ECD) .txt file for a year
 *       description: >-
 *         Composes the ECD (Livro Diário Geral, tipo G) for the given year from the ledger
 *         (chart, referential mapping, monthly balances, journal, BP/DRE) and persists a
 *         plain-text (ISO-8859-1) artifact as an EXPORT job. Download via
 *         /data-exchange/jobs/{jobId}/download. Blocks with 400 + unmappedAccounts if any
 *         leaf account is unmapped in the referential version (coverage gate).
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [unitId, mappingVersion, year, declarant, book, signers]
 *               properties:
 *                 unitId:         { type: string }
 *                 mappingVersion: { type: string }
 *                 year:           { type: integer, example: 2026 }
 *                 declarant:
 *                   type: object
 *                   required: [nome, cnpj, uf, codMun, indNire, indGrandePorte]
 *                   properties:
 *                     nome:   { type: string }
 *                     cnpj:   { type: string, description: '14 digits' }
 *                     uf:     { type: string }
 *                     codMun: { type: string, description: 'IBGE 7 digits' }
 *                     indNire:        { type: string, enum: ['0', '1'] }
 *                     indGrandePorte: { type: string, enum: ['0', '1'] }
 *                 book:
 *                   type: object
 *                   required: [numOrd, natLivr, dtExSocial]
 *                   properties:
 *                     numOrd:     { type: string }
 *                     natLivr:    { type: string }
 *                     dtExSocial: { type: string, description: 'YYYY-MM-DD' }
 *                 signers:
 *                   type: array
 *                   items:
 *                     type: object
 *                     required: [identNom, identCpfCnpj, identQualif, codAssin, indRespLegal]
 *                     properties:
 *                       identNom:      { type: string }
 *                       identCpfCnpj:  { type: string }
 *                       identQualif:   { type: string }
 *                       codAssin:      { type: string, description: '3 digits; 900 = Contador' }
 *                       indRespLegal:  { type: string, enum: [S, N] }
 *       responses:
 *         '201':
 *           description: ECD export job created
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data:    { $ref: '#/components/schemas/DataExchangeJob' }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '403': { $ref: '#/components/responses/ForbiddenError' }
 *
 *   /api/accounting/closing/exercise:
 *     post:
 *       summary: Close the result of a fiscal year (encerramento do exercício)
 *       description: >-
 *         Posts a real balanced closing entry (sourceType closing) dated year-12-31 that
 *         zeroes every result account against retained earnings (Lucros ou Prejuízos
 *         Acumulados). Idempotent per exercise. Makes the ECD reconcile in value (I155 of
 *         December equals zero, J100 balances with detail) and enables the I350/I355
 *         registers. Blocks with 400 when there is no result balance to close; the period
 *         gate surfaces its own error when December is not open. Reopen by reversing the
 *         returned entry via POST /accounting/reverse (that frees the idempotency key).
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [unitId, year]
 *               properties:
 *                 unitId: { type: string }
 *                 year:   { type: integer, example: 2026 }
 *       responses:
 *         '201':
 *           description: Closing entry posted (or the existing one on a re-close)
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data:    { type: object, description: 'The posted closing JournalEntry with its postings' }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '403': { $ref: '#/components/responses/ForbiddenError' }
 *
 *   /api/accounting/data-exchange/jobs/{jobId}:
 *     get:
 *       summary: Get a data-exchange job summary
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - { in: path, name: jobId, required: true, schema: { type: string } }
 *         - { in: query, name: unitId, required: true, schema: { type: string } }
 *       responses:
 *         '200':
 *           description: Job summary
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data:    { $ref: '#/components/schemas/DataExchangeJob' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/accounting/data-exchange/jobs/{jobId}/download:
 *     get:
 *       summary: Download a data-exchange artifact (CSV/XLSX stream)
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - { in: path, name: jobId, required: true, schema: { type: string } }
 *         - { in: query, name: unitId, required: true, schema: { type: string } }
 *       responses:
 *         '200':
 *           description: Artifact stream
 *           content:
 *             application/octet-stream:
 *               schema: { type: string, format: binary }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/accounting/data-exchange/imports:
 *     post:
 *       summary: Upload + validate a CSV/XLSX import (chart, opening balances, or journal entries)
 *       description: Parses and per-row validates the file, staging a VALIDATED job. Does NOT write ledger data — call /jobs/{jobId}/commit to persist. Preview rows via /jobs/{jobId}/rows.
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           multipart/form-data:
 *             schema:
 *               type: object
 *               required: [kind, unitId, file]
 *               properties:
 *                 kind:   { type: string, enum: [IMPORT_CHART_OF_ACCOUNTS, IMPORT_OPENING_BALANCES, IMPORT_JOURNAL_ENTRIES] }
 *                 unitId: { type: string }
 *                 file:   { type: string, format: binary, description: CSV or XLSX }
 *       responses:
 *         '201':
 *           description: Import validated and staged
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data:    { $ref: '#/components/schemas/DataExchangeJob' }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '403': { $ref: '#/components/responses/ForbiddenError' }
 *
 *   /api/accounting/data-exchange/jobs/{jobId}/rows:
 *     get:
 *       summary: List import rows (preview + error report)
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - { in: path, name: jobId, required: true, schema: { type: string } }
 *         - { in: query, name: unitId, required: true, schema: { type: string } }
 *         - { in: query, name: status, required: false, schema: { type: string, enum: [VALID, INVALID, COMMITTED, SKIPPED] } }
 *       responses:
 *         '200':
 *           description: Rows
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data:    { type: array, items: { type: object } }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/accounting/data-exchange/jobs/{jobId}/commit:
 *     post:
 *       summary: Commit a staged import (writes accounts / journal entries via posting services)
 *       description: Commits VALID rows through createAccount/postEntry (authoritative period gate + balance re-checked in-tx). Per-entry atomic, partial success. Idempotent — already-committed rows are skipped.
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - { in: path, name: jobId, required: true, schema: { type: string } }
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [unitId]
 *               properties:
 *                 unitId: { type: string }
 *       responses:
 *         '200':
 *           description: Commit result (job with committedRows)
 *           content:
 *             application/json:
 *               schema:
 *                 type: object
 *                 properties:
 *                   success: { type: boolean, example: true }
 *                   data:    { $ref: '#/components/schemas/DataExchangeJob' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '403': { $ref: '#/components/responses/ForbiddenError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/accounting/reconciliation/statements:
 *     post:
 *       summary: Import a bank statement (CSV/XLSX/OFX) for a bank GL account
 *       description: 'Accepts CSV/XLSX (columns date,amountCents,description[,externalRef], signed integer cents) or OFX (normalized from STMTTRN - DTPOSTED→date, TRNAMT→signed cents, NAME/MEMO→description, FITID→externalRef). Format is auto-detected. ALL-OR-NOTHING — any invalid row rejects the whole file; a multi-account OFX is rejected. Re-import of the same file (sha256) is idempotent (200, nothing written). No ledger value is written.'
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           multipart/form-data:
 *             schema:
 *               type: object
 *               required: [unitId, glAccountId, periodStart, periodEnd, file]
 *               properties:
 *                 unitId:              { type: string }
 *                 glAccountId:         { type: string, description: bank GL account id (accounts.id) }
 *                 statementRef:        { type: string }
 *                 periodStart:         { type: string, format: date, description: YYYY-MM-DD }
 *                 periodEnd:           { type: string, format: date, description: YYYY-MM-DD }
 *                 openingBalanceCents: { type: integer }
 *                 closingBalanceCents: { type: integer }
 *                 file:                { type: string, format: binary, description: CSV, XLSX or OFX }
 *       responses:
 *         '201': { description: Statement imported (created + staged lines) }
 *         '200': { description: Same file already imported (idempotent hit) }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '403': { $ref: '#/components/responses/ForbiddenError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *     get:
 *       summary: List imported bank statements (paginated)
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - { in: query, name: unitId, required: true, schema: { type: string } }
 *         - { in: query, name: page, required: false, schema: { type: integer, default: 1 } }
 *         - { in: query, name: limit, required: false, schema: { type: integer, default: 10, maximum: 100 } }
 *       responses:
 *         '200': { description: Statements + total }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/accounting/reconciliation/statements/{id}/lines:
 *     get:
 *       summary: List the lines of a statement (optional status filter)
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - { in: path, name: id, required: true, schema: { type: string } }
 *         - { in: query, name: unitId, required: true, schema: { type: string } }
 *         - { in: query, name: status, required: false, schema: { type: string, enum: [UNMATCHED, MATCHED, IGNORED] } }
 *       responses:
 *         '200': { description: Statement + lines (lineNumber asc) }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/accounting/reconciliation/statements/{id}:
 *     delete:
 *       summary: Soft-delete a statement (blocked while any match is active)
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - { in: path, name: id, required: true, schema: { type: string } }
 *         - { in: query, name: unitId, required: true, schema: { type: string } }
 *       responses:
 *         '200': { description: Statement soft-deleted }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/accounting/reconciliation/statements/{id}/auto-match:
 *     post:
 *       summary: Run the deterministic auto-match over UNMATCHED lines (D6)
 *       description: Commits ONLY single-candidate lines (exact cents + direction, ±3-day window, entry Posted, no active match). 0 or >1 candidates leave the line pending. Idempotent by construction. May flip fully-matched entries Posted→Reconciled (derived, audited).
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - { in: path, name: id, required: true, schema: { type: string } }
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [unitId]
 *               properties:
 *                 unitId: { type: string }
 *       responses:
 *         '200': { description: 'Summary: processed/matched/zeroCandidates/ambiguous' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/accounting/reconciliation/lines/{id}/suggestions:
 *     get:
 *       summary: Ranked match suggestions for one UNMATCHED line (|Δdays| asc, postingId asc)
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - { in: path, name: id, required: true, schema: { type: string } }
 *         - { in: query, name: unitId, required: true, schema: { type: string } }
 *       responses:
 *         '200': { description: Candidates with deltaDays }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/accounting/reconciliation/lines/{id}/ignore:
 *     post:
 *       summary: Mark/unmark a line as IGNORED (e.g. a fee to be posted via /post)
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - { in: path, name: id, required: true, schema: { type: string } }
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [unitId, ignored]
 *               properties:
 *                 unitId:  { type: string }
 *                 ignored: { type: boolean }
 *       responses:
 *         '200': { description: Line status updated }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/accounting/reconciliation/matches:
 *     post:
 *       summary: Manual match — N postings ↔ 1 statement line (D3 aggregation)
 *       description: 'Aggregate invariant: Σ(posting side amounts) === |line.amountCents| (exact integer cents). Full in-tx gate per posting; may flip the entry Posted→Reconciled.'
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ManualMatch'
 *       responses:
 *         '201': { description: Matches created }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/accounting/reconciliation/matches/{id}/unmatch:
 *     post:
 *       summary: Soft-undo of an active match (trail preserved; may flip the entry back to Posted)
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - { in: path, name: id, required: true, schema: { type: string } }
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [unitId]
 *               properties:
 *                 unitId: { type: string }
 *                 reason: { type: string, maxLength: 500 }
 *       responses:
 *         '200': { description: Match soft-undone }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/accounting/reconciliation/pending:
 *     get:
 *       summary: Pending report — UNMATCHED lines + bank postings with no active match (as-of)
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - { in: query, name: unitId, required: true, schema: { type: string } }
 *         - { in: query, name: glAccountId, required: true, schema: { type: string } }
 *         - { in: query, name: from, required: false, schema: { type: string, format: date } }
 *         - { in: query, name: to, required: false, schema: { type: string, format: date } }
 *       responses:
 *         '200': { description: 'account + unmatchedLines + unmatchedPostings + totals (integer cents)' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/accounting/referential/mappings:
 *     put:
 *       summary: Set (upsert) a referential mapping of one leaf account in one version (BE-INCR-9)
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [unitId, accountId, referentialCode, label, mappingVersion]
 *               properties:
 *                 unitId: { type: string }
 *                 accountId: { type: string, description: leaf account id (accounts.id) }
 *                 referentialCode: { type: string, description: RFB referential account code }
 *                 label: { type: string, description: referential account name (denormalized snapshot) }
 *                 mappingVersion: { type: string, description: calendar-year layout id, e.g. "2025" }
 *       responses:
 *         '200': { description: 'the created/updated ReferentialMapping' }
 *         '400': { $ref: '#/components/responses/ValidationError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *     delete:
 *       summary: Unset (hard-delete) the mapping of one account in one version (BE-INCR-9)
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - { in: query, name: unitId, required: true, schema: { type: string } }
 *         - { in: query, name: accountId, required: true, schema: { type: string } }
 *         - { in: query, name: mappingVersion, required: true, schema: { type: string } }
 *       responses:
 *         '200': { description: 'accountId + mappingVersion of the removed mapping' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *     get:
 *       summary: List the referential mappings of a version (BE-INCR-9)
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - { in: query, name: unitId, required: true, schema: { type: string } }
 *         - { in: query, name: version, required: true, schema: { type: string } }
 *       responses:
 *         '200': { description: 'array of ReferentialMapping for the version' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *
 *   /api/accounting/referential/coverage:
 *     get:
 *       summary: Coverage diagnostic — active leaf accounts unmapped in a version (ECD-readiness gate, BE-INCR-9)
 *       tags: [Accounting]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - { in: query, name: unitId, required: true, schema: { type: string } }
 *         - { in: query, name: version, required: true, schema: { type: string } }
 *       responses:
 *         '200': { description: 'mappingVersion + unmappedAccounts[] + totals + ready flag' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 */
export {};
