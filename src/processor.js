import { logger } from './logger.js';
import { sanitizeFolderName } from './sanitize.js';

// Processa um cliente: cria a estrutura no Drive e grava o ID da pasta no cadastro.
// Nunca lança erro: devolve { ok } para quem chamou decidir o que fazer.
export function createClientProcessor({ drive, platform, fotosFolderId }) {
  return async function processClient(client) {
    const clientId = platform.clientId(client);
    const rawName = platform.clientName(client);
    const hotelName = sanitizeFolderName(rawName);

    if (!hotelName) {
      logger.error('Cliente sem nome válido, estrutura não criada', { clientId, rawName });
      return { ok: false, clientId, reason: 'nome inválido' };
    }

    try {
      const { folderId, created } = await drive.ensureHotelStructure(fotosFolderId, hotelName);

      if (platform.canSaveFolderId && clientId !== undefined) {
        try {
          await platform.saveFolderId(clientId, folderId);
          logger.info('ID da pasta salvo no cadastro do cliente', { clientId, folderId });
        } catch (err) {
          logger.error('Não foi possível salvar o ID da pasta no cliente', {
            clientId,
            folderId,
            error: err.message,
          });
        }
      }

      logger.info('Estrutura de pastas pronta', { clientId, hotel: hotelName, folderId, created });
      return { ok: true, clientId, folderId, created };
    } catch (err) {
      logger.error('Falha ao criar estrutura de pastas', {
        clientId,
        hotel: hotelName,
        error: err.message,
      });
      return { ok: false, clientId, reason: err.message };
    }
  };
}
