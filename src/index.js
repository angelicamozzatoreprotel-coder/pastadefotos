import { logger } from './logger.js';
import { buildServices } from './services.js';
import { createWebhookServer } from './webhook.js';
import { startPolling } from './poller.js';
import { ProcessedStore } from './state.js';

// Falhas inesperadas ficam no log, sem derrubar o processo.
process.on('unhandledRejection', (reason) => {
  logger.error('Promise rejeitada sem tratamento', { error: String(reason?.message ?? reason) });
});
process.on('uncaughtException', (err) => {
  logger.error('Exceção não tratada', { error: err.message, stack: err.stack });
});

async function main() {
  const { config, platform, processClient } = buildServices();

  if (config.mode === 'polling') {
    if (!platform.enabled) throw new Error('Modo polling exige PLATFORM_API_BASE_URL');
    const store = await new ProcessedStore(config.polling.stateFile).load();
    startPolling({ platform, store, processClient, intervalMs: config.polling.intervalMs });
    return;
  }

  if (config.mode !== 'webhook') throw new Error(`MODE inválido: ${config.mode} (use webhook ou polling)`);

  const server = createWebhookServer({ ...config.webhook, platform, processClient });
  server.listen(config.webhook.port, () => {
    logger.info('Servidor de webhook no ar', { port: config.webhook.port, path: config.webhook.path });
  });
}

main().catch((err) => {
  logger.error('Falha ao iniciar a automação', { error: err.message });
  process.exitCode = 1;
});
