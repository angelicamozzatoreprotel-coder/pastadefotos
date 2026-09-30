# Pasta de Fotos

Toda vez que um novo cliente entra na seção "Clientes" da plataforma, esta automação cria no Google Drive, dentro da pasta "Fotos", a estrutura de pastas do hotel:

```
[Nome do Hotel]
├── Acomodações
│   ├── Insira o nome da acomodação  (6 pastas)
├── Café da manhã
├── Eventos
├── Estrutura
└── Academia
```

A especificação original está no arquivo `pastafotosdrive`.

## Como funciona

A automação roda em um de dois modos, escolhido pela variável `MODE`:

`webhook` (recomendado): sobe um servidor HTTP que recebe o evento de criação de cliente da plataforma em `POST /webhooks/cliente-criado`. O servidor responde `202` na hora e processa o cliente em seguida. Também expõe `GET /health` para monitoramento.

`polling`: consulta a lista de clientes na API a cada 5 minutos e processa apenas os que ainda não constam no arquivo `data/processed-clients.json`. Um cliente só entra nesse registro depois que a estrutura foi criada com sucesso, então falhas são tentadas de novo no ciclo seguinte.

Em ambos os modos:

1. O nome do hotel é limpo, com espaços extras e caracteres inválidos removidos.
2. Antes de criar, a automação procura uma pasta com o mesmo nome dentro de "Fotos". Se existir, reaproveita e só completa as subpastas que faltarem. As 6 pastas de acomodação nascem apenas junto com "Acomodações", para não recriar marcadores que a equipe já renomeou.
3. Todas as chamadas usam a Google Drive API v3 com `supportsAllDrives=true`, funcionando também em Drives Compartilhados.
4. Erros temporários (limite de taxa, erros 5xx, falhas de rede) são repetidos com backoff exponencial.
5. Se `PLATFORM_DRIVE_FOLDER_FIELD` estiver configurado, o ID da pasta do hotel é gravado de volta no cadastro do cliente.
6. Sucessos e falhas vão para o log em JSON, uma linha por evento. Nenhuma falha derruba a aplicação.

## Requisitos

Node.js 20.6 ou superior (o projeto usa `--env-file` nativo).

```bash
npm install
cp .env.example .env   # e preencha os valores
npm test
```

## Configurando a Service Account do Google

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/) e crie um projeto, ou selecione um existente.
2. Em **APIs e serviços > Biblioteca**, ative a **Google Drive API**.
3. Em **APIs e serviços > Credenciais**, clique em **Criar credenciais > Conta de serviço**, dê um nome e conclua. Nenhum papel do projeto é necessário.
4. Abra a conta de serviço criada, vá na aba **Chaves**, clique em **Adicionar chave > Criar nova chave** e escolha **JSON**. O arquivo é baixado uma única vez, então guarde em local seguro e nunca o coloque no repositório.
5. Copie o e-mail da conta de serviço (termina em `@...iam.gserviceaccount.com`).
6. No Google Drive, abra a pasta "Fotos", clique em **Compartilhar** e adicione esse e-mail como **Editor**. Em um Drive Compartilhado, adicione a conta como membro com permissão de **Administrador de conteúdo** ou superior.
7. Copie o ID da pasta "Fotos", que é o trecho final da URL: `https://drive.google.com/drive/folders/<ESTE_É_O_ID>`.

No `.env`, preencha:

```
GOOGLE_SERVICE_ACCOUNT_JSON=/caminho/seguro/service-account.json
GOOGLE_DRIVE_FOTOS_FOLDER_ID=<ID da pasta Fotos>
```

`GOOGLE_SERVICE_ACCOUNT_JSON` aceita três formatos: o caminho do arquivo, o conteúdo JSON em uma linha ou o conteúdo codificado em base64 (`base64 -w0 service-account.json`). O base64 é o mais prático em serviços de hospedagem que só aceitam variáveis de ambiente.

> Importante: pastas criadas por uma Service Account em um Drive pessoal ficam com a conta de serviço como proprietária e ocupam a cota dela. Com a pasta "Fotos" dentro de um Drive Compartilhado, a propriedade fica com a organização.

## Configurando a API da plataforma

As rotas e os nomes de campos variam de plataforma para plataforma, por isso tudo é ajustável pelo `.env`:

| Variável | Uso |
| --- | --- |
| `PLATFORM_API_KEY` | Chave da API |
| `PLATFORM_API_BASE_URL` | URL base, por exemplo `https://api.suaplataforma.com/v1` |
| `PLATFORM_API_AUTH_HEADER` / `PLATFORM_API_AUTH_SCHEME` | Como a chave é enviada. Padrão: `Authorization: Bearer <chave>` |
| `PLATFORM_CLIENTS_PATH` | Rota de listagem de clientes (modo polling) |
| `PLATFORM_CLIENTS_LIST_KEY` | Chave da lista, se a resposta vier como `{"data": [...]}` |
| `PLATFORM_CLIENT_ID_FIELD` / `PLATFORM_CLIENT_NAME_FIELD` | Campos de ID e de nome do hotel no cliente |
| `PLATFORM_CLIENT_PATH` / `PLATFORM_UPDATE_METHOD` | Rota e método para atualizar o cliente |
| `PLATFORM_DRIVE_FOLDER_FIELD` | Campo que recebe o ID da pasta. Vazio desativa esse passo |

## Rodando

Modo webhook:

```bash
npm run start:webhook
```

Cadastre na plataforma o webhook do evento de criação de cliente apontando para `https://<seu-servidor>/webhooks/cliente-criado`. Se a plataforma permitir cabeçalhos personalizados, defina `WEBHOOK_SECRET` e envie o mesmo valor no cabeçalho `x-webhook-secret`. O payload pode trazer o cliente na raiz (`{"id": 1, "nome": "Hotel Exemplo"}`) ou dentro de `data`, `cliente`, `client`, `payload` ou `record`.

Modo polling:

```bash
npm run start:polling
```

Na primeira execução do polling, todos os clientes já existentes são tratados como novos. Graças à verificação de pastas existentes, nenhum hotel é duplicado, mas a estrutura será completada para cada um deles.

Criação manual, útil para testar a Service Account ou reprocessar um hotel:

```bash
npm run create -- "Hotel Exemplo"
```

## Estrutura do código

```
src/
  index.js      ponto de entrada, escolhe o modo
  cli.js        criação manual via linha de comando
  config.js     leitura das variáveis de ambiente
  drive.js      Google Drive API v3 e estrutura de pastas
  platform.js   cliente genérico da API da plataforma
  processor.js  fluxo completo de um cliente
  webhook.js    servidor HTTP do webhook
  poller.js     consulta periódica
  state.js      registro de clientes processados
  retry.js      retry com backoff exponencial
  sanitize.js   limpeza do nome do hotel
  logger.js     logs em JSON
test/           testes com Drive simulado em memória
```
