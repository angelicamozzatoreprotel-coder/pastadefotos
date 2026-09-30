// Limpa o nome do hotel para uso como nome de pasta no Drive.
export function sanitizeFolderName(raw) {
  if (typeof raw !== 'string') return '';
  return raw
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .trim()
    .slice(0, 255);
}

// Escapa valores usados dentro de aspas simples na query da Drive API.
export function escapeDriveQuery(value) {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
