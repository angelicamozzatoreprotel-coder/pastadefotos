/**
 * Pasta de Fotos: cria no Google Drive a estrutura de pastas de cada novo cliente da RAI.
 *
 * Funções para rodar manualmente no editor (menu "Executar"):
 *   testarConexao                    confere a chave da RAI e o acesso à pasta "Fotos". Não altera nada.
 *   criarPastaDeTeste                cria um "Hotel Teste" na pasta configurada, sem consultar a RAI.
 *   marcarClientesAtuaisComoVistos   passo obrigatório antes de ligar. Nenhum cliente atual ganha pasta.
 *   simular                          mostra o que seria criado agora, sem criar nada.
 *   instalarGatilho                  liga a verificação automática a cada 10 minutos.
 *   removerGatilho                   desliga a verificação automática.
 *   verStatus                        mostra a situação atual da automação.
 *   liberarClientesPendentes         cria as pastas de um lote bloqueado pelo limite de segurança.
 *   ignorarClientesPendentes         marca um lote bloqueado como visto, sem criar pastas.
 *
 * Propriedades do script (Configurações do projeto > Propriedades do script):
 *   RAI_API_KEY       token pessoal da RAI, rpt_pat_..., com o scope clientes:read (obrigatória)
 *   FOTOS_FOLDER_ID   ID da pasta "Fotos" no Drive (obrigatória)
 *   EMAIL_ALERTA      e-mail que recebe os alertas (opcional; padrão: dono do script)
 */

var CONFIG = {
  // API Pública oficial da RAI (somente leitura). Token pessoal com o scope clientes:read.
  RAI_URL: 'https://sb.reprotel.com.br/functions/v1/api-v1/v1/clientes',
  RAI_POR_PAGINA: 200,
  RAI_MAX_PAGINAS: 50,
  CAMPO_ID: 'id',
  CAMPO_NOME: 'nome',
  LIMITE_NOVOS_POR_VEZ: 5,
  LIMITE_LIBERACAO_MANUAL: 30,
  INTERVALO_MINUTOS: 10,
  TENTATIVAS: 4,
  SUBPASTAS: ['Acomodações', 'Café da manhã', 'Estrutura', 'Lazer', 'Eventos'],
  PASTA_ACOMODACOES: 'Acomodações',
  NOME_ACOMODACAO: 'Renomeie com o nome da sua acomodação',
  QTD_ACOMODACOES: 6,
  FUNCAO_GATILHO: 'verificarNovosClientes',
};

// Chaves internas de estado. Não edite manualmente.
var ESTADO = {
  VISTOS_PARTES: 'ESTADO_VISTOS_PARTES',
  VISTOS_PREFIXO: 'ESTADO_VISTOS_',
  MARCACAO_EM: 'ESTADO_MARCACAO_EM',
  ALERTA_ENVIADO: 'ESTADO_ALERTA_ENVIADO',
};
var TAMANHO_PARTE = 8000;

// ---------------------------------------------------------------------------
// Funções para rodar manualmente
// ---------------------------------------------------------------------------

function testarConexao() {
  var clientes = buscarClientes_();
  var semId = clientes.filter(function (c) { return !idDoCliente_(c); }).length;
  log_('Conexão com a RAI funcionando. Clientes recebidos: ' + clientes.length + '.');
  if (semId) log_('Atenção: ' + semId + ' cliente(s) sem "' + CONFIG.CAMPO_ID + '" serão sempre ignorados.');
  clientes.slice(0, 5).forEach(function (c) {
    log_('Exemplo: "' + c[CONFIG.CAMPO_NOME] + '" vira a pasta "' + limparNome_(c[CONFIG.CAMPO_NOME]) + '" (id ' + idDoCliente_(c) + ')');
  });
  var fotos = pastaFotos_();
  log_('Acesso à pasta "' + fotos.getName() + '" funcionando.');
  log_(estaMarcado_()
    ? 'A marcação inicial já foi feita.'
    : 'Próximo passo: rodar marcarClientesAtuaisComoVistos.');
}

function marcarClientesAtuaisComoVistos() {
  var clientes = buscarClientes_();
  if (!clientes.length) {
    throw new Error('A RAI devolveu uma lista vazia. A marcação foi cancelada por segurança.');
  }
  var vistos = carregarVistos_();
  var antes = Object.keys(vistos).length;
  var semId = 0;
  clientes.forEach(function (c) {
    var id = idDoCliente_(c);
    if (id) vistos[id] = true;
    else semId += 1;
  });
  salvarVistos_(vistos);
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty(ESTADO.MARCACAO_EM)) props.setProperty(ESTADO.MARCACAO_EM, new Date().toISOString());
  props.deleteProperty(ESTADO.ALERTA_ENVIADO);
  var total = Object.keys(vistos).length;
  log_('Marcação concluída. ' + total + ' cliente(s) marcados como vistos (' + (total - antes) + ' novos nesta rodada). Nenhuma pasta foi criada.');
  if (semId) log_('Atenção: ' + semId + ' cliente(s) sem "' + CONFIG.CAMPO_ID + '" não puderam ser marcados e serão sempre ignorados.');
  log_('Próximo passo: rodar simular e, se estiver tudo em ordem, instalarGatilho.');
}

// Cria a estrutura de um hotel fictício na pasta configurada, sem consultar a RAI.
// Serve para ver o resultado real no Drive antes de ligar a automação.
function criarPastaDeTeste() {
  var nome = 'Hotel Teste';
  var fotos = pastaFotos_();
  if (pastasExistentes_(fotos)[chaveComparacao_(nome)]) {
    log_('Já existe uma pasta "' + nome + '" em "' + fotos.getName() + '". Nada foi criado, e a proteção contra duplicação funcionou.');
    return;
  }
  var hotel = criarEstrutura_(fotos, nome);
  log_('Pasta de teste criada em "' + fotos.getName() + '": ' + hotel.getUrl());
  log_('Rode criarPastaDeTeste de novo para confirmar que ela não é duplicada.');
}

function simular() {
  return executar_('simulacao');
}

function verificarNovosClientes() {
  return executar_('automatico');
}

function liberarClientesPendentes() {
  return executar_('liberar');
}

function ignorarClientesPendentes() {
  if (!estaMarcado_()) {
    log_('A marcação inicial ainda não foi feita. Rode marcarClientesAtuaisComoVistos.');
    return;
  }
  var pendentes = clientesNovos_(buscarClientes_(), carregarVistos_()).novos;
  var vistos = carregarVistos_();
  pendentes.forEach(function (c) {
    vistos[idDoCliente_(c)] = true;
    log_('Ignorado, sem pasta: "' + limparNome_(c[CONFIG.CAMPO_NOME]) + '"');
  });
  salvarVistos_(vistos);
  PropertiesService.getScriptProperties().deleteProperty(ESTADO.ALERTA_ENVIADO);
  log_(pendentes.length + ' cliente(s) marcados como vistos. Nenhuma pasta foi criada.');
}

function instalarGatilho() {
  if (!estaMarcado_()) {
    throw new Error('Rode marcarClientesAtuaisComoVistos antes de instalar o gatilho.');
  }
  pastaFotos_();
  removerGatilho();
  ScriptApp.newTrigger(CONFIG.FUNCAO_GATILHO).timeBased().everyMinutes(CONFIG.INTERVALO_MINUTOS).create();
  log_('Gatilho instalado: verificação a cada ' + CONFIG.INTERVALO_MINUTOS + ' minutos.');
}

function removerGatilho() {
  var removidos = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === CONFIG.FUNCAO_GATILHO) {
      ScriptApp.deleteTrigger(t);
      removidos += 1;
    }
  });
  if (removidos) log_('Gatilho removido.');
  return removidos;
}

function verStatus() {
  var props = PropertiesService.getScriptProperties();
  var gatilho = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === CONFIG.FUNCAO_GATILHO;
  });
  log_('Marcação inicial: ' + (props.getProperty(ESTADO.MARCACAO_EM) || 'não feita'));
  log_('Clientes marcados como vistos: ' + Object.keys(carregarVistos_()).length);
  log_('Verificação automática: ' + (gatilho ? 'ligada' : 'desligada'));
  log_('Lote bloqueado aguardando decisão: ' + (props.getProperty(ESTADO.ALERTA_ENVIADO) ? 'sim' : 'não'));
  log_('E-mail de alerta: ' + emailAlerta_());
}

// ---------------------------------------------------------------------------
// Fluxo principal
// ---------------------------------------------------------------------------

function executar_(modo) {
  var simulando = modo === 'simulacao';
  var prefixo = simulando ? '[SIMULAÇÃO] ' : '';

  var trava = LockService.getScriptLock();
  if (!trava.tryLock(30000)) {
    log_('Outra execução ainda está em andamento. Esta rodada foi pulada.');
    return { status: 'ocupado' };
  }
  try {
    if (!estaMarcado_()) {
      log_(prefixo + 'A marcação inicial ainda não foi feita, então nada é criado. Rode marcarClientesAtuaisComoVistos.');
      return { status: 'sem-marcacao' };
    }

    var clientes = buscarClientes_();
    var vistos = carregarVistos_();
    var resultado = clientesNovos_(clientes, vistos);
    if (resultado.semId) {
      log_(prefixo + resultado.semId + ' cliente(s) sem "' + CONFIG.CAMPO_ID + '" foram ignorados.');
    }
    var novos = resultado.novos;
    if (!novos.length) {
      log_(prefixo + 'Nenhum cliente novo.');
      return { status: 'sem-novos' };
    }

    var props = PropertiesService.getScriptProperties();
    if (modo !== 'liberar' && novos.length > CONFIG.LIMITE_NOVOS_POR_VEZ) {
      log_(prefixo + novos.length + ' clientes novos de uma vez, acima do limite de ' +
        CONFIG.LIMITE_NOVOS_POR_VEZ + '. Nada foi criado.');
      if (!simulando) alertarLote_(novos, props);
      else log_(prefixo + 'Na execução real, um e-mail de alerta seria enviado para ' + emailAlerta_() + '.');
      return { status: 'bloqueado', quantidade: novos.length };
    }
    if (modo === 'liberar' && novos.length > CONFIG.LIMITE_LIBERACAO_MANUAL) {
      log_('São ' + novos.length + ' clientes pendentes, acima do limite de liberação manual de ' +
        CONFIG.LIMITE_LIBERACAO_MANUAL + '. Nada foi criado. Confira a situação com simular antes de seguir.');
      return { status: 'bloqueado', quantidade: novos.length };
    }

    var fotos = pastaFotos_();
    var existentes = pastasExistentes_(fotos);
    var criadas = 0;
    var falhas = 0;

    novos.forEach(function (cliente) {
      var id = idDoCliente_(cliente);
      var nome = limparNome_(cliente[CONFIG.CAMPO_NOME]);
      if (!nome) {
        log_(prefixo + 'Cliente ' + id + ' sem nome válido. Nenhuma pasta criada.');
        return;
      }
      var chave = chaveComparacao_(nome);
      if (existentes[chave]) {
        log_(prefixo + 'Já existe uma pasta para "' + nome + '" em "Fotos". Nada foi criado.');
        if (!simulando) marcarVisto_(vistos, id);
        return;
      }
      if (simulando) {
        log_(prefixo + 'Seria criada a pasta "' + nome + '" com as 5 subpastas e as 6 acomodações.');
        existentes[chave] = true;
        return;
      }
      try {
        criarEstrutura_(fotos, nome);
        existentes[chave] = true;
        marcarVisto_(vistos, id);
        criadas += 1;
        log_('Pasta criada: "' + nome + '"');
      } catch (err) {
        falhas += 1;
        console.error('Falha ao criar a pasta "' + nome + '": ' + err.message + '. Nova tentativa na próxima verificação.');
      }
    });

    if (!simulando && !falhas) props.deleteProperty(ESTADO.ALERTA_ENVIADO);
    return { status: 'ok', criadas: criadas, falhas: falhas };
  } finally {
    trava.releaseLock();
  }
}

function clientesNovos_(clientes, vistos) {
  var novos = [];
  var semId = 0;
  var noLote = {};
  clientes.forEach(function (c) {
    var id = idDoCliente_(c);
    if (!id) { semId += 1; return; }
    if (vistos[id] || noLote[id]) return;
    noLote[id] = true;
    novos.push(c);
  });
  return { novos: novos, semId: semId };
}

function criarEstrutura_(fotos, nome) {
  var hotel = comRetry_(function () { return fotos.createFolder(nome); }, 'criação da pasta "' + nome + '"');
  try {
    CONFIG.SUBPASTAS.forEach(function (sub) {
      var pasta = comRetry_(function () { return hotel.createFolder(sub); }, 'criação de "' + sub + '"');
      if (sub !== CONFIG.PASTA_ACOMODACOES) return;
      for (var i = 0; i < CONFIG.QTD_ACOMODACOES; i += 1) {
        comRetry_(function () { return pasta.createFolder(CONFIG.NOME_ACOMODACAO); }, 'criação de acomodação');
      }
    });
  } catch (err) {
    // Estrutura incompleta vai para a lixeira, para a próxima verificação refazer do zero.
    try { hotel.setTrashed(true); } catch (e) { console.error('Não foi possível mover a pasta incompleta para a lixeira: ' + e.message); }
    throw err;
  }
  return hotel;
}

function alertarLote_(novos, props) {
  var ids = novos.map(idDoCliente_).sort();
  var assinatura = ids.join(',');
  if (props.getProperty(ESTADO.ALERTA_ENVIADO) === assinatura) {
    log_('O alerta deste lote já foi enviado. Aguardando decisão.');
    return;
  }
  var nomes = novos.map(function (c) { return '  ' + limparNome_(c[CONFIG.CAMPO_NOME]) + ' (' + idDoCliente_(c) + ')'; });
  var corpo = [
    'A automação da Pasta de Fotos encontrou ' + novos.length + ' clientes novos de uma vez na RAI.',
    'O limite de segurança é ' + CONFIG.LIMITE_NOVOS_POR_VEZ + ', então nenhuma pasta foi criada.',
    '',
    'Clientes encontrados:',
    nomes.join('\n'),
    '',
    'O que fazer, no editor do Apps Script:',
    '  1. Rode "simular" para ver o que seria criado.',
    '  2. Se os clientes forem novos de verdade, rode "liberarClientesPendentes".',
    '  3. Se não forem, rode "ignorarClientesPendentes".',
    '',
    'Enquanto nada for decidido, a automação não cria pastas para esse lote e não reenvia este e-mail.',
  ].join('\n');
  MailApp.sendEmail(emailAlerta_(), '[Pasta de Fotos] ' + novos.length + ' clientes novos bloqueados', corpo);
  props.setProperty(ESTADO.ALERTA_ENVIADO, assinatura);
  log_('E-mail de alerta enviado para ' + emailAlerta_() + '.');
}

// ---------------------------------------------------------------------------
// RAI
// ---------------------------------------------------------------------------

function buscarClientes_() {
  var chave = propriedadeObrigatoria_('RAI_API_KEY');
  var todos = [];
  for (var pagina = 0; pagina < CONFIG.RAI_MAX_PAGINAS; pagina += 1) {
    var lote = buscarPagina_(chave, pagina * CONFIG.RAI_POR_PAGINA);
    todos = todos.concat(lote);
    if (lote.length < CONFIG.RAI_POR_PAGINA) return todos;
  }
  throw new Error('A lista de clientes passou de ' + CONFIG.RAI_MAX_PAGINAS + ' páginas. Consulta interrompida por segurança.');
}

// Qualquer falha em uma página interrompe a consulta inteira, para nunca trabalhar com lista parcial.
function buscarPagina_(chave, offset) {
  var url = CONFIG.RAI_URL + '?limit=' + CONFIG.RAI_POR_PAGINA + '&offset=' + offset;
  var texto = comRetry_(function () {
    var resp = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { Authorization: 'Bearer ' + chave, Accept: 'application/json' },
      muteHttpExceptions: true,
    });
    var codigo = resp.getResponseCode();
    if (codigo >= 200 && codigo < 300) return resp.getContentText();
    var erro = new Error('A RAI respondeu HTTP ' + codigo + ': ' + String(resp.getContentText()).slice(0, 200));
    erro.definitivo = !(codigo === 408 || codigo === 429 || codigo >= 500);
    throw erro;
  }, 'consulta à RAI');

  var dados;
  try {
    dados = JSON.parse(texto);
  } catch (e) {
    throw new Error('A resposta da RAI não é um JSON válido.');
  }
  if (!dados || !Array.isArray(dados.data)) {
    throw new Error('A resposta da RAI não trouxe a lista de clientes em "data".');
  }
  return dados.data;
}

function idDoCliente_(cliente) {
  var id = cliente && cliente[CONFIG.CAMPO_ID];
  return id === undefined || id === null ? '' : String(id).trim();
}

// ---------------------------------------------------------------------------
// Drive
// ---------------------------------------------------------------------------

function pastaFotos_() {
  var id = propriedadeObrigatoria_('FOTOS_FOLDER_ID');
  try {
    return DriveApp.getFolderById(id);
  } catch (e) {
    throw new Error('Não foi possível abrir a pasta "Fotos" (FOTOS_FOLDER_ID). Confira o ID e o acesso: ' + e.message);
  }
}

// Mapa com o nome normalizado de cada pasta já existente em "Fotos".
function pastasExistentes_(fotos) {
  var mapa = {};
  var it = fotos.getFolders();
  while (it.hasNext()) {
    var pasta = it.next();
    if (pasta.isTrashed()) continue;
    mapa[chaveComparacao_(limparNome_(pasta.getName()))] = true;
  }
  return mapa;
}

// ---------------------------------------------------------------------------
// Nomes
// ---------------------------------------------------------------------------

var EMOJIS_ = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}‍︎️⃣]/gu;

// Remove emojis, caracteres inválidos e espaços extras. "🏨 155 Hotel" vira "155 Hotel".
function limparNome_(bruto) {
  if (typeof bruto !== 'string') return '';
  return bruto
    .normalize('NFC')
    .replace(EMOJIS_, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+|\.+$/g, '')
    .trim()
    .slice(0, 255);
}

// Comparação tolerante a maiúsculas e acentos, para nunca duplicar pasta.
function chaveComparacao_(nome) {
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

function estaMarcado_() {
  return Boolean(PropertiesService.getScriptProperties().getProperty(ESTADO.MARCACAO_EM));
}

function carregarVistos_() {
  var props = PropertiesService.getScriptProperties();
  var partes = Number(props.getProperty(ESTADO.VISTOS_PARTES) || 0);
  var texto = '';
  for (var i = 0; i < partes; i += 1) texto += props.getProperty(ESTADO.VISTOS_PREFIXO + i) || '';
  var mapa = {};
  if (texto) JSON.parse(texto).forEach(function (id) { mapa[id] = true; });
  return mapa;
}

// Guarda a lista dividida em partes, porque cada propriedade aceita no máximo 9 KB.
function salvarVistos_(mapa) {
  var props = PropertiesService.getScriptProperties();
  var texto = JSON.stringify(Object.keys(mapa));
  var novas = {};
  var partes = 0;
  for (var i = 0; i < texto.length; i += TAMANHO_PARTE) {
    novas[ESTADO.VISTOS_PREFIXO + partes] = texto.slice(i, i + TAMANHO_PARTE);
    partes += 1;
  }
  var antigas = Number(props.getProperty(ESTADO.VISTOS_PARTES) || 0);
  novas[ESTADO.VISTOS_PARTES] = String(partes);
  props.setProperties(novas);
  for (var j = partes; j < antigas; j += 1) props.deleteProperty(ESTADO.VISTOS_PREFIXO + j);
}

function marcarVisto_(vistos, id) {
  vistos[id] = true;
  salvarVistos_(vistos);
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function propriedadeObrigatoria_(nome) {
  var valor = PropertiesService.getScriptProperties().getProperty(nome);
  if (!valor || !String(valor).trim()) {
    throw new Error('Propriedade do script ausente: ' + nome + '. Configure em Configurações do projeto > Propriedades do script.');
  }
  return String(valor).trim();
}

function emailAlerta_() {
  var configurado = PropertiesService.getScriptProperties().getProperty('EMAIL_ALERTA');
  return configurado && configurado.trim() ? configurado.trim() : Session.getEffectiveUser().getEmail();
}

// Repete a operação com espera crescente (1s, 2s, 4s...). Erros definitivos não são repetidos.
function comRetry_(fn, rotulo) {
  for (var tentativa = 1; ; tentativa += 1) {
    try {
      return fn();
    } catch (err) {
      if (err.definitivo || tentativa >= CONFIG.TENTATIVAS) throw err;
      var espera = 1000 * Math.pow(2, tentativa - 1);
      console.warn('Falha em ' + rotulo + ' (tentativa ' + tentativa + '): ' + err.message + '. Nova tentativa em ' + espera + ' ms.');
      Utilities.sleep(espera);
    }
  }
}

function log_(mensagem) {
  console.log(mensagem);
}
