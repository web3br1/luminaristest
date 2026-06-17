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
 */
export {};
