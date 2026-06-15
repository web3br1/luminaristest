import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import swaggerJSDoc from 'swagger-jsdoc';
import fs from 'fs';
import path from 'path';

const router = Router();

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Luminaris API',
      version: '1.0.0',
      description: 'Document Intelligence Platform API',
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['src/controllers/**/*.ts', 'src/routes/**/*.ts'],
};

// Prefer static OpenAPI if present, otherwise fallback to JSDoc generated
let specs: object | null = null;
try {
  const candidates = [
    path.resolve(process.cwd(), 'public', 'openapi.json'),
    path.resolve(process.cwd(), '..', 'public', 'openapi.json'),
    path.resolve(process.cwd(), '..', 'my-app', 'public', 'openapi.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, 'utf8');
      specs = JSON.parse(raw);
      break;
    }
  }
} catch {}

if (!specs) {
  specs = swaggerJSDoc(options);
}

router.get('/openapi.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(specs);
});

router.use('/', swaggerUi.serve, swaggerUi.setup(specs));

export default router;


