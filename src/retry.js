import { logger } from './logger.js';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Executa fn com retry e backoff exponencial (base, 2x base, 4x base...).
// Erros com `retryable === false` são lançados imediatamente.
export async function withRetry(fn, { retries = 5, baseDelayMs = 1000, label = 'operação' } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return await fn();
    } catch (err) {
      attempt += 1;
      if (err?.retryable === false || attempt > retries) throw err;
      const delay = baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 250);
      logger.warn(`Falha em ${label}, nova tentativa agendada`, {
        attempt,
        retries,
        delayMs: delay,
        error: err.message,
      });
      await sleep(delay);
    }
  }
}

// Status HTTP que valem nova tentativa: limite de taxa e erros do servidor.
export function isRetryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}
