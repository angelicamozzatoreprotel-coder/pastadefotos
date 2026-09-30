import { readFileSync } from 'node:fs';
import { GoogleAuth } from 'google-auth-library';
import { logger } from './logger.js';
import { withRetry, isRetryableStatus } from './retry.js';
import { escapeDriveQuery } from './sanitize.js';

const DRIVE_API = 'https://www.googleapis.com/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export const ACCOMMODATION_PLACEHOLDER = 'Insira o nome da acomodação';
export const ACCOMMODATION_PLACEHOLDER_COUNT = 6;
export const ACCOMMODATIONS_FOLDER = 'Acomodações';
export const HOTEL_SUBFOLDERS = [
  ACCOMMODATIONS_FOLDER,
  'Café da manhã',
  'Eventos',
  'Estrutura',
  'Academia',
];

// Aceita o JSON da Service Account em texto puro, em base64 ou como caminho de arquivo.
export function parseServiceAccount(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);
  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    if (decoded.trim().startsWith('{')) return JSON.parse(decoded);
  } catch {
    // Não era base64, tenta como caminho.
  }
  return JSON.parse(readFileSync(trimmed, 'utf8'));
}

export function createDriveRequester(serviceAccountJson) {
  const auth = new GoogleAuth({
    credentials: parseServiceAccount(serviceAccountJson),
    scopes: ['https://www.googleapis.com/auth/drive'],
  });
  return async ({ method = 'GET', url, params, data }) => {
    try {
      const res = await auth.request({ method, url, params, data });
      return res.data;
    } catch (err) {
      const status = err?.response?.status;
      const wrapped = new Error(
        `Drive API ${method} falhou${status ? ` (HTTP ${status})` : ''}: ${err.message}`,
      );
      wrapped.status = status;
      wrapped.retryable = status === undefined || isRetryableStatus(status);
      throw wrapped;
    }
  };
}

export class DriveFolders {
  constructor(request, { retries = 5, baseDelayMs = 1000 } = {}) {
    this.request = request;
    this.retryOptions = { retries, baseDelayMs };
  }

  async findFolders(parentId, name) {
    const q = [
      `'${escapeDriveQuery(parentId)}' in parents`,
      `name = '${escapeDriveQuery(name)}'`,
      `mimeType = '${FOLDER_MIME}'`,
      'trashed = false',
    ].join(' and ');
    const data = await withRetry(
      () =>
        this.request({
          url: DRIVE_API,
          params: {
            q,
            fields: 'files(id, name)',
            pageSize: 100,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true,
          },
        }),
      { ...this.retryOptions, label: `busca da pasta "${name}"` },
    );
    return data.files ?? [];
  }

  async createFolder(parentId, name) {
    const data = await withRetry(
      () =>
        this.request({
          method: 'POST',
          url: DRIVE_API,
          params: { supportsAllDrives: true, fields: 'id, name' },
          data: { name, mimeType: FOLDER_MIME, parents: [parentId] },
        }),
      { ...this.retryOptions, label: `criação da pasta "${name}"` },
    );
    return data;
  }

  async ensureFolder(parentId, name) {
    const [existing] = await this.findFolders(parentId, name);
    if (existing) return { folder: existing, created: false };
    const folder = await this.createFolder(parentId, name);
    return { folder, created: true };
  }

  // Cria (ou completa) a estrutura do hotel dentro da pasta "Fotos".
  // Idempotente: pastas existentes são reaproveitadas e nunca duplicadas.
  async ensureHotelStructure(fotosFolderId, hotelName) {
    const { folder: hotel, created: hotelCreated } = await this.ensureFolder(fotosFolderId, hotelName);
    logger.info(hotelCreated ? 'Pasta do hotel criada' : 'Pasta do hotel já existia', {
      hotel: hotelName,
      folderId: hotel.id,
    });

    for (const sub of HOTEL_SUBFOLDERS) {
      const { folder, created } = await this.ensureFolder(hotel.id, sub);
      if (sub !== ACCOMMODATIONS_FOLDER || !created) continue;
      // As pastas de acomodação só nascem junto com "Acomodações", para não
      // recriar marcadores que a equipe já renomeou.
      for (let i = 0; i < ACCOMMODATION_PLACEHOLDER_COUNT; i += 1) {
        await this.createFolder(folder.id, ACCOMMODATION_PLACEHOLDER);
      }
    }

    return { folderId: hotel.id, created: hotelCreated };
  }
}
