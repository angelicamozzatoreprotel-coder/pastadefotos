import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEnv, cliente, atuais } from './fake-google.js';

function prontoComMarcacao(n = 294) {
  const t = createEnv({ clientes: atuais(n) });
  t.gs.marcarClientesAtuaisComoVistos();
  return t;
}

test('sem marcação inicial, nada é criado mesmo com o gatilho rodando', () => {
  const t = createEnv({ clientes: atuais(294) });
  const r = t.gs.verificarNovosClientes();
  assert.equal(r.status, 'sem-marcacao');
  assert.equal(t.fotos.children().length, 0);
  assert.equal(t.requests.length, 0);
});

test('instalarGatilho recusa sem marcação inicial', () => {
  const t = createEnv({ clientes: atuais(3) });
  assert.throws(() => t.gs.instalarGatilho(), /marcarClientesAtuaisComoVistos/);
  assert.equal(t.triggers.length, 0);
});

test('marcação inicial dos 294 clientes não cria nenhuma pasta', () => {
  const t = prontoComMarcacao();
  assert.equal(t.fotos.children().length, 0);
  assert.equal(t.gs.verificarNovosClientes().status, 'sem-novos');
  assert.equal(t.fotos.children().length, 0);
});

test('marcação com lista vazia é recusada', () => {
  const t = createEnv({ clientes: [] });
  assert.throws(() => t.gs.marcarClientesAtuaisComoVistos(), /vazia/);
  assert.equal(t.gs.verificarNovosClientes().status, 'sem-marcacao');
});

test('cliente novo ganha a estrutura completa, sem emoji no nome', () => {
  const t = prontoComMarcacao();
  t.env.clientes.push(cliente('novo1', '🏨 155 Hotel'));
  const r = t.gs.verificarNovosClientes();
  assert.equal(r.criadas, 1);

  const [hotel] = t.fotos.children();
  assert.equal(hotel.name, '155 Hotel');
  assert.deepEqual(hotel.children().map((f) => f.name), ['Acomodações', 'Café da manhã', 'Eventos', 'Estrutura', 'Academia']);
  const acomodacoes = hotel.children()[0].children();
  assert.equal(acomodacoes.length, 6);
  assert.ok(acomodacoes.every((f) => f.name === 'Insira o nome da acomodação'));

  assert.equal(t.gs.verificarNovosClientes().status, 'sem-novos');
  assert.equal(t.fotos.children().length, 1);
});

test('remove emojis variados do nome', () => {
  const t = createEnv();
  assert.equal(t.gs.limparNome_('🏨 155 Hotel'), '155 Hotel');
  assert.equal(t.gs.limparNome_('🔸 1986 Apparts'), '1986 Apparts');
  assert.equal(t.gs.limparNome_('🔸🏨  Pousada  Café ☀️ '), 'Pousada Café');
  assert.equal(t.gs.limparNome_('Hotel: Mar/Serra'), 'Hotel Mar Serra');
  assert.equal(t.gs.limparNome_('🏨'), '');
});

test('mais de 5 novos de uma vez: nada é criado e o e-mail sai uma única vez', () => {
  const t = prontoComMarcacao();
  for (let i = 0; i < 6; i += 1) t.env.clientes.push(cliente(`n${i}`, `🏨 Novo ${i}`));
  assert.equal(t.gs.verificarNovosClientes().status, 'bloqueado');
  assert.equal(t.gs.verificarNovosClientes().status, 'bloqueado');
  assert.equal(t.fotos.children().length, 0);
  assert.equal(t.emails.length, 1);
  assert.equal(t.emails[0].to, 'dono@exemplo.com');
  assert.match(t.emails[0].body, /Novo 5/);
});

test('exatamente 5 novos são criados normalmente', () => {
  const t = prontoComMarcacao();
  for (let i = 0; i < 5; i += 1) t.env.clientes.push(cliente(`n${i}`, `Novo ${i}`));
  assert.equal(t.gs.verificarNovosClientes().criadas, 5);
  assert.equal(t.emails.length, 0);
});

test('lote bloqueado pode ser liberado ou ignorado manualmente', () => {
  const a = prontoComMarcacao();
  for (let i = 0; i < 7; i += 1) a.env.clientes.push(cliente(`n${i}`, `Novo ${i}`));
  a.gs.verificarNovosClientes();
  assert.equal(a.gs.liberarClientesPendentes().criadas, 7);
  assert.equal(a.fotos.children().length, 7);

  const b = prontoComMarcacao();
  for (let i = 0; i < 7; i += 1) b.env.clientes.push(cliente(`n${i}`, `Novo ${i}`));
  b.gs.verificarNovosClientes();
  b.gs.ignorarClientesPendentes();
  assert.equal(b.gs.verificarNovosClientes().status, 'sem-novos');
  assert.equal(b.fotos.children().length, 0);
});

test('liberação manual recusa lotes muito grandes', () => {
  const t = prontoComMarcacao(10);
  assert.equal(t.gs.liberarClientesPendentes().status, 'sem-novos');
  for (let i = 0; i < 40; i += 1) t.env.clientes.push(cliente(`n${i}`, `Novo ${i}`));
  assert.equal(t.gs.liberarClientesPendentes().status, 'bloqueado');
  assert.equal(t.fotos.children().length, 0);
});

test('simulação mostra o que seria criado sem criar nem marcar nada', () => {
  const t = prontoComMarcacao();
  t.env.clientes.push(cliente('novo1', '🏨 Hotel Simulado'));
  const antes = JSON.stringify(t.store);
  t.gs.simular();
  assert.equal(t.fotos.children().length, 0);
  assert.equal(JSON.stringify(t.store), antes);
  assert.ok(t.logs.some((l) => /\[SIMULAÇÃO\] Seria criada a pasta "Hotel Simulado"/.test(l)));

  for (let i = 0; i < 6; i += 1) t.env.clientes.push(cliente(`n${i}`, `Novo ${i}`));
  assert.equal(t.gs.simular().status, 'bloqueado');
  assert.equal(t.emails.length, 0);
});

test('pasta com o mesmo nome em "Fotos" não é duplicada, nem com diferença de acento ou maiúscula', () => {
  const t = prontoComMarcacao();
  t.fotos.createFolder('Pousada Café');
  t.env.clientes.push(cliente('novo1', '🔸 POUSADA CAFE'));
  t.gs.verificarNovosClientes();
  assert.equal(t.fotos.children().length, 1);
  assert.equal(t.fotos.children()[0].children().length, 0);
  assert.equal(t.gs.verificarNovosClientes().status, 'sem-novos');
});

test('dois clientes novos com o mesmo nome geram uma pasta só', () => {
  const t = prontoComMarcacao();
  t.env.clientes.push(cliente('a', '🏨 Hotel Gêmeo'), cliente('b', 'Hotel Gêmeo'));
  t.gs.verificarNovosClientes();
  assert.equal(t.fotos.children().length, 1);
});

test('falha na RAI não cria nada e o erro aparece', () => {
  const t = prontoComMarcacao();
  const antes = t.requests.length;
  t.env.http = () => ({ getResponseCode: () => 503, getContentText: () => 'fora do ar' });
  assert.throws(() => t.gs.verificarNovosClientes(), /HTTP 503/);
  assert.equal(t.fotos.children().length, 0);
  assert.equal(t.requests.length - antes, 4);
});

test('chave recusada (401) não é repetida', () => {
  const t = prontoComMarcacao(3);
  const antes = t.requests.length;
  t.env.http = () => ({ getResponseCode: () => 401, getContentText: () => 'unauthorized' });
  assert.throws(() => t.gs.verificarNovosClientes(), /HTTP 401/);
  assert.equal(t.requests.length - antes, 1);
});

test('resposta sem a lista em "data" é rejeitada', () => {
  const t = prontoComMarcacao(3);
  t.env.http = () => ({ getResponseCode: () => 200, getContentText: () => '{"erro":"x"}' });
  assert.throws(() => t.gs.verificarNovosClientes(), /"data"/);
});

test('consulta a API Pública com GET, token Bearer e paginação completa', () => {
  const t = createEnv({ clientes: atuais(450) });
  t.gs.marcarClientesAtuaisComoVistos();
  assert.equal(Object.keys(t.gs.carregarVistos_()).length, 450);
  assert.deepEqual(t.requests.map((r) => new URL(r.url).searchParams.get('offset')), ['0', '200', '400']);
  const { url, opts } = t.requests[0];
  assert.ok(url.startsWith('https://sb.reprotel.com.br/functions/v1/api-v1/v1/clientes?limit=200'));
  assert.equal(opts.method, 'get');
  assert.equal(opts.headers.Authorization, 'Bearer chave-teste');
});

test('falha em uma página do meio não cria nada', () => {
  const t = prontoComMarcacao(450);
  t.env.clientes.push(cliente('novo1', 'Hotel Novo'));
  t.env.http = (url) => (new URL(url).searchParams.get('offset') === '200'
    ? { getResponseCode: () => 500, getContentText: () => 'erro' }
    : { getResponseCode: () => 200, getContentText: () => JSON.stringify({ data: t.env.clientes.slice(0, 200), limit: 200, offset: 0 }) });
  assert.throws(() => t.gs.verificarNovosClientes(), /HTTP 500/);
  assert.equal(t.fotos.children().length, 0);
});

test('falha no meio da criação manda a pasta incompleta para a lixeira e tenta de novo depois', () => {
  const t = prontoComMarcacao();
  t.env.clientes.push(cliente('novo1', 'Hotel Instável'));
  t.drive.failCreateAfter = 3;
  const r = t.gs.verificarNovosClientes();
  assert.equal(r.falhas, 1);
  assert.equal(t.fotos.children().length, 0);

  t.drive.failCreateAfter = null;
  assert.equal(t.gs.verificarNovosClientes().criadas, 1);
  assert.equal(t.fotos.children()[0].children().length, 5);
});

test('lista de vistos grande é guardada em partes abaixo de 9 KB', () => {
  const t = prontoComMarcacao(3000);
  const partes = Number(t.store.ESTADO_VISTOS_PARTES);
  assert.ok(partes > 1);
  for (let i = 0; i < partes; i += 1) assert.ok(t.store[`ESTADO_VISTOS_${i}`].length <= 8000);
  assert.equal(Object.keys(t.gs.carregarVistos_()).length, 3000);
  assert.equal(t.gs.verificarNovosClientes().status, 'sem-novos');
});

test('cliente sem id é ignorado', () => {
  const t = prontoComMarcacao(3);
  t.env.clientes.push({ nome: '🏨 Sem ID' });
  assert.equal(t.gs.verificarNovosClientes().status, 'sem-novos');
  assert.equal(t.fotos.children().length, 0);
});

test('instalarGatilho cria um único gatilho de 10 minutos', () => {
  const t = prontoComMarcacao(3);
  t.gs.instalarGatilho();
  t.gs.instalarGatilho();
  assert.equal(t.triggers.length, 1);
  assert.equal(t.triggers[0].minutes, 10);
  t.gs.removerGatilho();
  assert.equal(t.triggers.length, 0);
});

test('criarPastaDeTeste monta o Hotel Teste uma única vez, sem consultar a RAI', () => {
  const t = createEnv({ clientes: atuais(3) });
  t.gs.criarPastaDeTeste();
  t.gs.criarPastaDeTeste();
  assert.equal(t.requests.length, 0);
  assert.equal(t.fotos.children().length, 1);
  const hotel = t.fotos.children()[0];
  assert.equal(hotel.name, 'Hotel Teste');
  assert.equal(hotel.children().length, 5);
  assert.equal(hotel.children()[0].children().length, 6);
});
