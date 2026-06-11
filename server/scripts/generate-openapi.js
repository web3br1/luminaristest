/* eslint-disable */
const fs = require('fs');
const path = require('path');
const swaggerJSDoc = require('swagger-jsdoc');

const options = {
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
  apis: [
    path.resolve(process.cwd(), 'src', 'controllers', '**', '*.ts'),
    path.resolve(process.cwd(), 'src', 'routes', '**', '*.ts'),
  ],
};

const specs = swaggerJSDoc(options);

const outDir = path.resolve(process.cwd(), 'public');
const outFile = path.join(outDir, 'openapi.json');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(specs, null, 2));
console.log('OpenAPI spec generated at', outFile);


