# Pasta de Fotos

Toda vez que um novo cliente é cadastrado na RAI, esta automação cria no Google Drive, dentro da pasta "Fotos", a estrutura de pastas do hotel:

```
155 Hotel
├── Acomodações
│   └── Insira o nome da acomodação  (6 pastas)
├── Café da manhã
├── Eventos
├── Estrutura
└── Academia
```

Ela roda no **Google Apps Script**, dentro da conta Google, sem servidor e sem custo. A cada 10 minutos, consulta a lista de clientes da RAI e cria pastas apenas para os clientes que ainda não conhece.

A especificação original está no arquivo `pastafotosdrive`.

## Proteções

Os clientes que já existem na RAI nunca ganham pasta. Para isso, a automação conta com estas travas:

**Marcação inicial obrigatória.** Antes de ligar, a função `marcarClientesAtuaisComoVistos` registra todos os clientes atuais como "já vistos". Sem esse passo, a automação não cria nada, e o gatilho nem pode ser instalado.

**Limite de 5 por vez.** Se aparecerem mais de 5 clientes novos de uma vez, nenhuma pasta é criada e um e-mail de alerta é enviado, uma única vez por lote. Depois você decide o que fazer com o lote, liberando ou ignorando.

**Modo de simulação.** A função `simular` mostra no registro o que seria criado naquele momento, sem criar pastas e sem alterar nada.

**Sem duplicação.** Se já existe em "Fotos" uma pasta com o nome do hotel, nada é criado. A comparação ignora maiúsculas, acentos e emojis, então "Pousada Café" e "🔸 POUSADA CAFE" contam como a mesma pasta.

**Falhas sem estragos.** Se a RAI ou o Drive falharem, a automação tenta de novo com espera crescente. Se a criação parar no meio, a pasta incompleta vai para a lixeira e o cliente é tentado de novo na verificação seguinte. Quando a consulta à RAI falha de vez, o Google envia um e-mail de falha de execução para o dono do script.

**Nome limpo.** Os emojis do início do nome são removidos, então "🏨 155 Hotel" vira a pasta "155 Hotel".

## Instalação, passo a passo

Faça tudo com a conta Google que tem acesso de edição à pasta "Fotos". As pastas criadas pela automação ficam em nome dessa conta.

### 1. Criar o projeto

1. Acesse [script.google.com](https://script.google.com) e clique em **Novo projeto**.
2. Dê um nome ao projeto no topo da tela, por exemplo "Pasta de Fotos".
3. Apague todo o conteúdo do arquivo `Código.gs` que aparece aberto.
4. Copie todo o conteúdo do arquivo [`apps-script/Codigo.gs`](apps-script/Codigo.gs) deste repositório e cole no lugar.
5. Clique no ícone de engrenagem (**Configurações do projeto**), marque **Mostrar arquivo de manifesto "appsscript.json" no editor** e volte ao editor.
6. Abra o `appsscript.json`, substitua o conteúdo pelo arquivo [`apps-script/appsscript.json`](apps-script/appsscript.json) e salve.

### 2. Gerar o token da RAI e guardar junto com o ID da pasta

A automação usa a **API Pública** oficial da RAI, que é somente leitura. Gere o token assim:

1. Na RAI, abra **Meus Tokens** (o link aparece em Integrações > API Pública > Autenticação).
2. Crie um token marcando **apenas** o escopo `clientes:read`.
3. Copie o valor, que começa com `rpt_pat_`. Ele aparece uma única vez.


1. Abra a pasta "Fotos" no Google Drive e copie o trecho final do endereço: `https://drive.google.com/drive/folders/ESTE_TRECHO`.
2. No Apps Script, vá em **Configurações do projeto > Propriedades do script > Adicionar propriedade do script** e crie:

| Propriedade | Valor |
| --- | --- |
| `RAI_API_KEY` | o token pessoal da RAI (começa com `rpt_pat_`) |
| `FOTOS_FOLDER_ID` | o ID da pasta "Fotos" |
| `EMAIL_ALERTA` | opcional: e-mail que recebe os alertas (padrão: sua conta) |

3. Clique em **Salvar propriedades do script**.

A chave fica guardada no projeto, fora do código. Quem tiver acesso de edição ao projeto consegue vê-la, então compartilhe o projeto apenas com quem precisa.

### 3. Testar a conexão

1. No editor, escolha a função `testarConexao` no menu ao lado do botão **Executar** e clique em **Executar**.
2. Na primeira execução, o Google pede autorização. Clique em **Revisar permissões**, escolha sua conta e permita. Se aparecer o aviso "O Google não verificou este app", clique em **Avançado** e depois em **Acessar Pasta de Fotos**. O aviso aparece porque o script é seu e não foi publicado.
3. O registro de execução deve mostrar o total de clientes (hoje, 294), alguns exemplos de nomes já limpos e a confirmação de acesso à pasta "Fotos".

Se aparecer `HTTP 401`, o token está errado ou foi revogado. Se aparecer `HTTP 403`, falta o escopo `clientes:read` no token.

**Confira o total de clientes com atenção.** O token enxerga só o que a pessoa que o criou enxerga na RAI. Se o total for menor que o número real de clientes, o token vê apenas uma carteira. Nesse caso, clientes novos de outras carteiras nunca ganhariam pasta, e o token precisa ser gerado por alguém que veja todos os clientes.

### 4. Marcar os clientes atuais

Execute `marcarClientesAtuaisComoVistos`. O registro deve informar 294 clientes marcados e confirmar que nenhuma pasta foi criada. Pode rodar de novo sem risco: a função apenas soma clientes à lista de vistos.

### 5. Simular

Execute `simular`. O resultado esperado agora é "Nenhum cliente novo". Se aparecer qualquer outra coisa, pare aqui e me mande o registro.

### 6. Ligar

Execute `instalarGatilho`. A partir daí, a verificação acontece sozinha a cada 10 minutos. Para conferir, abra o ícone de relógio (**Acionadores**) no menu lateral.

## Uso no dia a dia

Nada precisa ser feito. Para acompanhar, abra o ícone de lista (**Execuções**) no menu lateral e veja o registro de cada verificação.

| Situação | O que rodar |
| --- | --- |
| Ver a situação geral | `verStatus` |
| Ver o que seria criado agora | `simular` |
| Recebi o alerta e os clientes são novos de verdade | `simular`, depois `liberarClientesPendentes` |
| Recebi o alerta e os clientes não devem ganhar pasta | `ignorarClientesPendentes` |
| Pausar a automação | `removerGatilho` |
| Religar a automação | `instalarGatilho` |

A liberação manual também tem limite, de 30 clientes por vez. Acima disso, alguma coisa fora do comum aconteceu na RAI e vale investigar antes de criar pastas.

## Testes

Os testes rodam o `Codigo.gs` em um ambiente que simula o Google Drive, a RAI e o Gmail, sem tocar em nada real:

```bash
npm test
```

Eles cobrem cada proteção acima, incluindo o cenário com os 294 clientes atuais.

## Arquivos

```
apps-script/Codigo.gs          código da automação (vai para o Apps Script)
apps-script/appsscript.json    manifesto com fuso horário e permissões
test/                          testes locais com Google simulado
pastafotosdrive                especificação original
```
