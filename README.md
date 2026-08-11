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

## Publicar a imagem no GitHub Container Registry

O workflow `.github/workflows/docker.yml` usa o GitHub Container Registry (GHCR):

- pull requests apenas validam o build, sem publicar;
- pushes na branch `main` publicam as tags `main` e `latest`;
- tags Git no formato `v1.2.3` publicam `1.2.3` e `1.2`;
- também é possível publicar manualmente em **Actions → Docker image → Run workflow**.

### O que precisa ser configurado no GitHub

**Nenhuma variável e nenhum secret precisam ser criados manualmente para publicar no GHCR.** O workflow utiliza somente valores fornecidos automaticamente pelo GitHub Actions:

| Nome no workflow | Origem | Valor usado |
| --- | --- | --- |
| `REGISTRY` | Definido no próprio workflow | `ghcr.io` |
| `IMAGE_NAME` | `${{ github.repository }}` | `usuario-ou-org/nome-do-repositorio` |
| `github.actor` | Contexto automático do Actions | Usuário que disparou o workflow |
| `secrets.GITHUB_TOKEN` | Secret automático do Actions | Token temporário usado para publicar o pacote |

O próprio job solicita `packages: write`, portanto o `GITHUB_TOKEN` recebe a permissão necessária durante a execução. Não crie `DOCKER_USERNAME`, `DOCKER_PASSWORD`, `GHCR_TOKEN` ou um Personal Access Token para esse fluxo.

Se a organização tiver uma política que bloqueia escrita de pacotes por workflows, um administrador precisará liberar GitHub Actions para publicar packages. Isso é uma política da organização, não uma variável deste projeto.

> `LOCALSTACK_ENDPOINT`, `AWS_DEFAULT_REGION`, `PORT` e `VIEWER_PORT` são configurações de **execução do container**. Elas não são usadas para publicar a imagem e não devem ser cadastradas como secrets do GitHub Actions.

Para publicar uma versão:

```bash
git tag v1.0.0
git push origin v1.0.0
```

A imagem será disponibilizada como `ghcr.io/SEU_USUARIO_OU_ORG/NOME_DO_REPOSITORIO:1.0.0`. O workflow autentica com o `GITHUB_TOKEN`; não é necessário cadastrar usuário ou senha do Docker como secret. No primeiro pacote, confira em **Package settings** se a visibilidade deve ser pública ou privada.

Para executar a imagem publicada conectando ao LocalStack existente:

```bash
docker run --rm -p 3000:3000 \
  --add-host=host.docker.internal:host-gateway \
  -e LOCALSTACK_ENDPOINT=http://host.docker.internal:4566 \
  -e AWS_DEFAULT_REGION=us-east-1 \
  ghcr.io/SEU_USUARIO_OU_ORG/NOME_DO_REPOSITORIO:latest
```

## Desenvolvimento local

Com um LocalStack já disponível na porta `4566`:

```bash
npm install
npm run dev
```

## Configuração por variáveis de ambiente

As configurações são aplicadas quando o container é iniciado, portanto a mesma imagem pode ser usada com diferentes instâncias do LocalStack.

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `LOCALSTACK_ENDPOINT` | `http://localhost:4566` no Node; `http://host.docker.internal:4566` no Compose | Endpoint completo do LocalStack existente. |
| `AWS_DEFAULT_REGION` | `us-east-1` | Região consultada e exibida pelo viewer. |
| `PORT` | `3000` | Porta HTTP interna do processo Node. |
| `VIEWER_PORT` | `3000` | Porta publicada na máquina host pelo Compose. |

Exemplo usando o Compose com outro endpoint e outra porta:

```bash
LOCALSTACK_ENDPOINT=http://192.168.1.50:4566 VIEWER_PORT=8080 docker compose up -d
```

## API

- `GET /api/health` — saúde do viewer.
- `GET /api/services` — recursos encontrados e estado de cada serviço.
- `GET /api/emails` — mensagens capturadas pelo SES local.
- `GET /api/dynamodb/tables` — tabelas DynamoDB.
- `GET|PUT|DELETE /api/dynamodb/tables/:table/items` — consulta e manutenção dos itens.
