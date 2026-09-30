import { logger } from './logger.js';
import { buildServices } from './services.js';

// Uso: npm run create -- "Hotel Exemplo"
// Cria a estrutura manualmente, útil para testar a Service Account ou reprocessar um cliente.
const name = process.argv.slice(2).join(' ');
if (!name.trim()) {
  console.error('Uso: npm run create -- "Nome do Hotel"');
  process.exit(1);
}

const { platform, processClient } = buildServices();
const client = { [platform.config.nameField]: name };
const result = await processClient(client);
logger.info('Resultado', result);
process.exitCode = result.ok ? 0 : 1;
