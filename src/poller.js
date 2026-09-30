import { logger } from './logger.js';

// Consulta a plataforma periodicamente e processa apenas clientes ainda não vistos.
export function startPolling({ platform, store, processClient, intervalMs }) {
  let running = false;

  async function tick() {
    if (running) return;
    running = true;
    try {
      const clients = await platform.listClients();
      const pending = clients.filter((c) => {
        const id = platform.clientId(c);
        return id !== undefined && id !== null && !store.has(id);
      });
      if (pending.length) logger.info('Novos clientes encontrados', { count: pending.length });
      for (const client of pending) {
        const result = await processClient(client);
        if (result.ok) await store.add(result.clientId);
      }
    } catch (err) {
      logger.error('Falha no ciclo de polling', { error: err.message });
    } finally {
      running = false;
    }
  }

  tick();
  const timer = setInterval(tick, intervalMs);
  logger.info('Polling iniciado', { intervalMs });
  return { tick, stop: () => clearInterval(timer) };
}
