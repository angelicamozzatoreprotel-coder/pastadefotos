import { loadConfig } from './config.js';
import { DriveFolders, createDriveRequester } from './drive.js';
import { PlatformClient } from './platform.js';
import { createClientProcessor } from './processor.js';

export function buildServices() {
  const config = loadConfig();
  const drive = new DriveFolders(createDriveRequester(config.google.serviceAccountJson), config.retry);
  const platform = new PlatformClient(config.platform, config.retry);
  const processClient = createClientProcessor({
    drive,
    platform,
    fotosFolderId: config.google.fotosFolderId,
  });
  return { config, drive, platform, processClient };
}
