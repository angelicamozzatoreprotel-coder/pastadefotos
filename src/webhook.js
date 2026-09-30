import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { logger } from './logger.js';

const MAX_BODY_BYTES = 1024 * 1024;
const WRAPPER_KEYS = ['data', 'cliente', 'client', 'payload', 'record'];

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Corpo da requisição grande demais'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

// Encontra o objeto do cliente no payload, esteja ele na raiz ou dentro de um envelope.
export function extractClient(body, platform) {
  if (!body || typeof body !== 'object') return null;
  if (platform.clientName(body) !== undefined) return body;
  for (const key of WRAPPER_KEYS) {
    const inner = body[key];
    if (inner && typeof inner === 'object' && platform.clientName(inner) !== undefined) return inner;
  }
  return null;
}

export function createWebhookServer({ path, secret, secretHeader, platform, processClient }) {
  return createServer(async (req, res) => {
    const reply = (status, payload) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') return reply(200, { status: 'ok' });
    if (url.pathname !== path) return reply(404, { error: 'não encontrado' });
    if (req.method !== 'POST') return reply(405, { error: 'método não permitido' });

    if (secret && !safeEqual(req.headers[secretHeader.toLowerCase()] ?? '', secret)) {
      logger.warn('Webhook recusado: segredo inválido', { ip: req.socket.remoteAddress });
      return reply(401, { error: 'não autorizado' });
    }

    let body;
    try {
      body = JSON.parse(await readBody(req));
    } catch (err) {
      logger.warn('Webhook com corpo inválido', { error: err.message });
      return reply(err.statusCode ?? 400, { error: 'JSON inválido' });
    }

    const client = extractClient(body, platform);
    if (!client) {
      logger.warn('Webhook sem dados de cliente reconhecíveis', { keys: Object.keys(body ?? {}) });
      return reply(422, { error: 'cliente não encontrado no payload' });
    }

    // Responde logo para a plataforma não estourar o tempo limite; o resultado vai para o log.
    reply(202, { status: 'recebido' });
    processClient(client).catch((err) =>
      logger.error('Erro inesperado ao processar webhook', { error: err.message }),
    );
  });
}
