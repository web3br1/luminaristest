/**
 * @openapi
 * tags:
 *   - name: Auth
 *   - name: Users
 *   - name: Documents
 *   - name: DynamicTables
 *   - name: Dashboard
 *   - name: DashboardLayout
 *   - name: Chat
 *   - name: ChatInstances
 *   - name: ChatMessages
 *   - name: Reports
 *   - name: StructuredData
 *
 * paths:
 *   /api/auth/login:
 *     post:
 *       summary: Authenticate user and get JWT token
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
 *                 password:
 *                   type: string
 *       responses:
 *         '200':
 *           description: Login successful
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '500': { $ref: '#/components/responses/InternalServerError' }
 *
 *   /api/auth/me:
 *     get:
 *       summary: Get current user profile
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
 *       summary: Logout user and invalidate session
 *       tags: [Auth]
 *       security: [{ bearerAuth: [] }]
 *       responses:
 *         '204': { description: Logout successful }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '500': { $ref: '#/components/responses/InternalServerError' }
 *
 *   /api/users:
 *     get:
 *       summary: Retrieve a paginated list of users
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
 *         '200': { description: A paginated list of users }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '401': { $ref: '#/components/responses/UnauthorizedError' }
 *         '500': { $ref: '#/components/responses/InternalServerError' }
 *     post:
 *       summary: Create a new user (Public Endpoint)
 *       tags: [Users]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [username, email, password]
 *               properties:
 *                 username: { type: string }
 *                 email: { type: string, format: email }
 *                 password: { type: string, minLength: 8 }
 *       responses:
 *         '201': { description: User created successfully }
 *         '400': { $ref: '#/components/responses/BadRequestError' }
 *         '409': { description: Conflict }
 *         '500': { $ref: '#/components/responses/InternalServerError' }
 *
 *   /api/users/{id}:
 *     get:
 *       summary: Retrieve a user by ID
 *       tags: [Users]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - name: id
 *           in: path
 *           required: true
 *           schema: { type: string, format: cuid }
 *       responses:
 *         '200': { description: User }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *
 *   /api/dashboard-layout:
 *     get:
 *       summary: Get all dashboard layouts for the current user
 *       tags: [DashboardLayout]
 *       security: [{ bearerAuth: [] }]
 *       responses:
 *         '200': { description: List of dashboard layouts }
 *     post:
 *       summary: Create a new dashboard layout
 *       tags: [DashboardLayout]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/CreateDashboardLayoutDto' }
 *       responses:
 *         '201': { description: Created }
 *
 *   /api/dashboard-layout/{id}:
 *     get:
 *       summary: Get dashboard layout by ID
 *       tags: [DashboardLayout]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: id
 *           required: true
 *           schema: { type: string, format: cuid }
 *       responses:
 *         '200': { description: Layout }
 *         '404': { $ref: '#/components/responses/NotFoundError' }
 *     patch:
 *       summary: Update dashboard layout
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
 *         '200': { description: Updated }
 *     delete:
 *       summary: Delete dashboard layout
 *       tags: [DashboardLayout]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: id
 *           required: true
 *           schema: { type: string, format: cuid }
 *       responses:
 *         '204': { description: Deleted }
 *
 *   /api/documents:
 *     get:
 *       summary: List documents
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
 *         '200': { description: Listed }
 *
 *   /api/documents/upload:
 *     post:
 *       summary: Upload a document
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
 *         '201': { description: Created }
 *
 *   /api/documents/search:
 *     post:
 *       summary: Semantic search in documents
 *       tags: [Documents]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 query: { type: string }
 *                 limit: { type: integer }
 *       responses:
 *         '200': { description: Results }
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
 *         '200': { description: Document }
 *     patch:
 *       summary: Update a document
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
 *         '200': { description: Updated }
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
 *
 *   /api/documents/qdrant-status:
 *     get:
 *       summary: Qdrant collection status
 *       tags: [Documents]
 *       security: [{ bearerAuth: [] }]
 *       responses:
 *         '200': { description: Status }
 *
 *   /api/documents/{id}/qdrant:
 *     get:
 *       summary: Get Qdrant points for document
 *       tags: [Documents]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: id
 *           required: true
 *           schema: { type: string }
 *       responses:
 *         '200': { description: Points }
 *
 *   /api/documents/token-cost:
 *     post:
 *       summary: Estimate token cost for uploaded file
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
 *         '200': { description: Token estimate }
 *
 *   /api/dynamic-tables/{tableId}/data:
 *     get:
 *       summary: Get data rows for a dynamic table
 *       tags: [DynamicTables]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: tableId
 *           required: true
 *           schema: { type: string, format: cuid }
 *       responses:
 *         '200': { description: Data }
 *     post:
 *       summary: Create a data row in a dynamic table
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
 *             schema: { type: object }
 *       responses:
 *         '201': { description: Created }
 *
 *   /api/dynamic-tables/data/{dataId}:
 *     patch:
 *       summary: Update a data row
 *       tags: [DynamicTables]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: dataId
 *           required: true
 *           schema: { type: string, format: cuid }
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       responses:
 *         '200': { description: Updated }
 *     delete:
 *       summary: Delete a data row
 *       tags: [DynamicTables]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: dataId
 *           required: true
 *           schema: { type: string, format: cuid }
 *       responses:
 *         '204': { description: Deleted }
 *
 *   /api/chat:
 *     post:
 *       summary: Generate chat response
 *       tags: [Chat]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       responses:
 *         '200': { description: AI response }
 *
 *   /api/chat-instances:
 *     get:
 *       summary: Get chat instances
 *       tags: [ChatInstances]
 *       security: [{ bearerAuth: [] }]
 *       responses:
 *         '200': { description: List }
 *     post:
 *       summary: Create chat instance
 *       tags: [ChatInstances]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       responses:
 *         '201': { description: Created }
 *
 *   /api/chat-messages:
 *     get:
 *       summary: Get chat messages
 *       tags: [ChatMessages]
 *       security: [{ bearerAuth: [] }]
 *       responses:
 *         '200': { description: List }
 *     post:
 *       summary: Create chat message
 *       tags: [ChatMessages]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       responses:
 *         '201': { description: Created }
 *
 *   /api/structured-data/{documentId}:
 *     get:
 *       summary: Get structured data by document ID
 *       tags: [StructuredData]
 *       security: [{ bearerAuth: [] }]
 *       parameters:
 *         - in: path
 *           name: documentId
 *           required: true
 *           schema: { type: string }
 *       responses:
 *         '200': { description: Structured data }
 *
 *   /api/reports/generate-chart-data:
 *     post:
 *       summary: Generate chart data (SSE)
 *       tags: [Reports]
 *       security: [{ bearerAuth: [] }]
 *       requestBody:
 *         required: true
 *         content:
 *           application/json:
 *             schema: { type: object }
 *       responses:
 *         '200': { description: Streamed progress/messages }
 */
export {};


