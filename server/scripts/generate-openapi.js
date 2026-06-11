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

const json = JSON.stringify(specs, null, 2);
fs.writeFileSync(outFile, json);

// Validate generated JSON
JSON.parse(json);

const pathCount = Object.keys(specs.paths || {}).length;
const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
const operationCount = Object.values(specs.paths || {}).reduce(
  (n, item) => n + methods.filter((m) => item[m]).length,
  0
);

console.log('OpenAPI spec generated at', outFile);
console.log('  Paths:      ' + pathCount);
console.log('  Operations: ' + operationCount);
console.log('  JSON is valid.');


