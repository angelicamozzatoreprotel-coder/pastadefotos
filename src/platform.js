import { withRetry, isRetryableStatus } from './retry.js';

// Cliente genérico para a API da plataforma. Rotas e nomes de campos
// vêm do .env, então nada aqui depende de um fornecedor específico.
export class PlatformClient {
  constructor(config, { retries = 5, baseDelayMs = 1000, fetchImpl = fetch } = {}) {
    this.config = config;
    this.retryOptions = { retries, baseDelayMs };
    this.fetch = fetchImpl;
  }

  get enabled() {
    return Boolean(this.config.baseUrl);
  }

  async call(method, path, body) {
    if (!this.enabled) {
      const err = new Error('PLATFORM_API_BASE_URL não configurada');
      err.retryable = false;
      throw err;
    }
    const url = new URL(path.replace(/^\//, ''), this.config.baseUrl.replace(/\/?$/, '/'));
    const headers = { Accept: 'application/json' };
    headers[this.config.authHeader] = this.config.authScheme
      ? `${this.config.authScheme} ${this.config.apiKey}`
      : this.config.apiKey;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    return withRetry(
      async () => {
        const res = await this.fetch(url, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (!res.ok) {
          const err = new Error(`API da plataforma ${method} ${url.pathname} respondeu HTTP ${res.status}`);
          err.status = res.status;
          err.retryable = isRetryableStatus(res.status);
          throw err;
        }
        const text = await res.text();
        return text ? JSON.parse(text) : null;
      },
      { ...this.retryOptions, label: `${method} ${url.pathname}` },
    );
  }

  async listClients() {
    const data = await this.call('GET', this.config.clientsPath);
    const list = this.config.listKey ? data?.[this.config.listKey] : data;
    if (!Array.isArray(list)) {
      throw new Error(
        'Resposta da listagem de clientes não é uma lista. Ajuste PLATFORM_CLIENTS_LIST_KEY.',
      );
    }
    return list;
  }

  clientId(client) {
    return client?.[this.config.idField];
  }

  clientName(client) {
    return client?.[this.config.nameField];
  }

  get canSaveFolderId() {
    return this.enabled && Boolean(this.config.driveFolderField);
  }

  async saveFolderId(clientId, folderId) {
    const path = this.config.clientPath.replace('{id}', encodeURIComponent(String(clientId)));
    await this.call(this.config.updateMethod, path, { [this.config.driveFolderField]: folderId });
  }
}
