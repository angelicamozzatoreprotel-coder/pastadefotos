// Toda configuração vem de variáveis de ambiente. Nada fixo no código.
function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value.trim();
}

function optional(name, fallback = '') {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

export function loadConfig() {
  return {
    mode: optional('MODE', 'webhook'),
    google: {
      serviceAccountJson: required('GOOGLE_SERVICE_ACCOUNT_JSON'),
      fotosFolderId: required('GOOGLE_DRIVE_FOTOS_FOLDER_ID'),
    },
    platform: {
      apiKey: required('PLATFORM_API_KEY'),
      baseUrl: optional('PLATFORM_API_BASE_URL'),
      authHeader: optional('PLATFORM_API_AUTH_HEADER', 'Authorization'),
      authScheme: optional('PLATFORM_API_AUTH_SCHEME', 'Bearer'),
      clientsPath: optional('PLATFORM_CLIENTS_PATH', '/clientes'),
      clientPath: optional('PLATFORM_CLIENT_PATH', '/clientes/{id}'),
      listKey: optional('PLATFORM_CLIENTS_LIST_KEY'),
      idField: optional('PLATFORM_CLIENT_ID_FIELD', 'id'),
      nameField: optional('PLATFORM_CLIENT_NAME_FIELD', 'nome'),
      driveFolderField: optional('PLATFORM_DRIVE_FOLDER_FIELD'),
      updateMethod: optional('PLATFORM_UPDATE_METHOD', 'PATCH'),
    },
    webhook: {
      port: Number(optional('PORT', '3000')),
      path: optional('WEBHOOK_PATH', '/webhooks/cliente-criado'),
      secret: optional('WEBHOOK_SECRET'),
      secretHeader: optional('WEBHOOK_SECRET_HEADER', 'x-webhook-secret'),
    },
    polling: {
      intervalMs: Number(optional('POLL_INTERVAL_MS', String(5 * 60 * 1000))),
      stateFile: optional('STATE_FILE', 'data/processed-clients.json'),
    },
    retry: {
      retries: Number(optional('RETRY_MAX_ATTEMPTS', '5')),
      baseDelayMs: Number(optional('RETRY_BASE_DELAY_MS', '1000')),
    },
  };
}
