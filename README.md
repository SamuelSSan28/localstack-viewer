# LocalStack Viewer

Dashboard modular para visualizar recursos do LocalStack e trabalhar com dados locais sem sair do navegador.

## Funcionalidades

- Visão geral de S3, SQS, SNS, Lambda, DynamoDB e SES.
- Área DynamoDB com navegação por tabela, listagem, criação, edição e exclusão de itens.
- Caixa de entrada SES para ler destinatários, assunto e conteúdo dos e-mails enviados localmente.
- API separada em router, serviços e codecs, sem dependências de runtime.

## Pré-requisito

Este projeto é apenas um **viewer**. Ele não cria, configura ou gerencia uma instância própria do LocalStack. Antes de iniciar o viewer, mantenha seu LocalStack existente acessível pela porta `4566`.

## Conectar ao LocalStack existente com Docker

```bash
docker compose up --build
```

Acesse [http://localhost:3000](http://localhost:3000). Por padrão, o container conecta ao LocalStack da máquina host usando `http://host.docker.internal:4566`.

Para usar um LocalStack em outra máquina ou rede, informe o endpoint existente:

```bash
LOCALSTACK_ENDPOINT=http://localstack.minha-rede:4566 docker compose up --build
```

Você também pode copiar `.env.example` para `.env` e alterar o endpoint. O Compose contém somente o serviço `viewer`; ele não baixa uma imagem do LocalStack, não monta o socket Docker e não cria volumes do LocalStack.

O workflow `.github/workflows/docker.yml` apenas **valida o build** da imagem nos pushes e pull requests. Ele não publica a imagem em nenhum registry.

## Desenvolvimento local

Com um LocalStack já disponível na porta `4566`:

```bash
npm install
npm run dev
```

Variáveis aceitas: `LOCALSTACK_ENDPOINT`, `AWS_DEFAULT_REGION` e `PORT`. Em execução direta, o endpoint padrão é `http://localhost:4566`; dentro do Compose, o padrão é `http://host.docker.internal:4566`.

## API

- `GET /api/health` — saúde do viewer.
- `GET /api/services` — recursos encontrados e estado de cada serviço.
- `GET /api/emails` — mensagens capturadas pelo SES local.
- `GET /api/dynamodb/tables` — tabelas DynamoDB.
- `GET|PUT|DELETE /api/dynamodb/tables/:table/items` — consulta e manutenção dos itens.
