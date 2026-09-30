import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DriveFolders, HOTEL_SUBFOLDERS, ACCOMMODATION_PLACEHOLDER } from '../src/drive.js';
import { PlatformClient } from '../src/platform.js';
import { createClientProcessor } from '../src/processor.js';
import { sanitizeFolderName } from '../src/sanitize.js';
import { extractClient } from '../src/webhook.js';
import { createFakeDrive } from './fake-drive.js';

const FOTOS = 'fotos-root';
const platformConfig = { idField: 'id', nameField: 'nome', baseUrl: '', driveFolderField: '' };

function setup(fakeOptions) {
  const fake = createFakeDrive(fakeOptions);
  const drive = new DriveFolders(fake.request, { retries: 3, baseDelayMs: 1 });
  const platform = new PlatformClient(platformConfig);
  const processClient = createClientProcessor({ drive, platform, fotosFolderId: FOTOS });
  return { fake, processClient };
}

test('cria "Hotel Exemplo" com 5 subpastas e 6 acomodações', async () => {
  const { fake, processClient } = setup();
  const result = await processClient({ id: 1, nome: 'Hotel Exemplo' });
  assert.equal(result.ok, true);

  const [hotel] = fake.childrenOf(FOTOS);
  assert.equal(hotel.name, 'Hotel Exemplo');
  assert.deepEqual(fake.childrenOf(hotel.id).map((f) => f.name), HOTEL_SUBFOLDERS);

  const acomodacoes = fake.childrenOf(hotel.id).find((f) => f.name === 'Acomodações');
  const rooms = fake.childrenOf(acomodacoes.id);
  assert.equal(rooms.length, 6);
  assert.ok(rooms.every((r) => r.name === ACCOMMODATION_PLACEHOLDER));
  assert.ok(fake.calls.every((c) => c.params.supportsAllDrives === true));
});

test('criar o mesmo cliente de novo não duplica nada', async () => {
  const { fake, processClient } = setup();
  await processClient({ id: 1, nome: 'Hotel Exemplo' });
  const total = fake.files.length;
  const second = await processClient({ id: 1, nome: '  Hotel   Exemplo ' });
  assert.equal(second.ok, true);
  assert.equal(second.created, false);
  assert.equal(fake.files.length, total);
  assert.equal(fake.childrenOf(FOTOS).length, 1);
});

test('completa subpastas que faltam sem recriar acomodações', async () => {
  const { fake, processClient } = setup();
  await processClient({ id: 1, nome: 'Hotel Exemplo' });
  const hotel = fake.childrenOf(FOTOS)[0];
  const academia = fake.files.findIndex((f) => f.parents[0] === hotel.id && f.name === 'Academia');
  fake.files.splice(academia, 1);

  await processClient({ id: 1, nome: 'Hotel Exemplo' });
  assert.equal(fake.childrenOf(hotel.id).length, 5);
  const acomodacoes = fake.childrenOf(hotel.id).find((f) => f.name === 'Acomodações');
  assert.equal(fake.childrenOf(acomodacoes.id).length, 6);
});

test('refaz a chamada após falha temporária da API', async () => {
  const { fake, processClient } = setup({ failFirst: 2 });
  const result = await processClient({ id: 2, nome: "Pousada D'Ouro" });
  assert.equal(result.ok, true);
  assert.equal(fake.childrenOf(FOTOS)[0].name, "Pousada D'Ouro");
});

test('falha persistente vira log e resultado negativo, sem lançar erro', async () => {
  const { processClient } = setup({ failFirst: 100 });
  const result = await processClient({ id: 3, nome: 'Hotel Instável' });
  assert.equal(result.ok, false);
});

test('nome vazio ou inválido não cria pasta', async () => {
  const { fake, processClient } = setup();
  const result = await processClient({ id: 4, nome: '  /// ' });
  assert.equal(result.ok, false);
  assert.equal(fake.files.length, 0);
});

test('sanitizeFolderName limpa espaços e caracteres inválidos', () => {
  assert.equal(sanitizeFolderName('  Hotel   Exemplo  '), 'Hotel Exemplo');
  assert.equal(sanitizeFolderName('Hotel: Mar/Serra?'), 'Hotel Mar Serra');
  assert.equal(sanitizeFolderName('Hotel\n\tAzul'), 'Hotel Azul');
  assert.equal(sanitizeFolderName(null), '');
});

test('extractClient encontra o cliente na raiz ou em envelope', () => {
  const platform = new PlatformClient(platformConfig);
  assert.deepEqual(extractClient({ id: 1, nome: 'A' }, platform), { id: 1, nome: 'A' });
  assert.deepEqual(extractClient({ event: 'x', data: { id: 2, nome: 'B' } }, platform), { id: 2, nome: 'B' });
  assert.equal(extractClient({ foo: 1 }, platform), null);
});

test('salva o ID da pasta no cadastro quando configurado', async () => {
  const fake = createFakeDrive();
  const sent = [];
  const fetchImpl = async (url, init) => {
    sent.push({ url: String(url), ...init });
    return { ok: true, status: 200, text: async () => '{}' };
  };
  const platform = new PlatformClient(
    {
      ...platformConfig,
      apiKey: 'k',
      baseUrl: 'https://api.exemplo.test/v1',
      authHeader: 'Authorization',
      authScheme: 'Bearer',
      clientPath: '/clientes/{id}',
      driveFolderField: 'drive_folder_id',
      updateMethod: 'PATCH',
    },
    { retries: 0, baseDelayMs: 1, fetchImpl },
  );
  const drive = new DriveFolders(fake.request, { retries: 0, baseDelayMs: 1 });
  const processClient = createClientProcessor({ drive, platform, fotosFolderId: FOTOS });
  const result = await processClient({ id: 42, nome: 'Hotel Exemplo' });

  assert.equal(sent.length, 1);
  assert.equal(sent[0].url, 'https://api.exemplo.test/v1/clientes/42');
  assert.equal(sent[0].method, 'PATCH');
  assert.equal(sent[0].headers.Authorization, 'Bearer k');
  assert.deepEqual(JSON.parse(sent[0].body), { drive_folder_id: result.folderId });
});
