# LocalStack Viewer

A modular developer dashboard for inspecting resources in an existing LocalStack instance without leaving the browser.

## Features

- Overview for S3, SQS, SNS, Lambda, DynamoDB, and SES.
- DynamoDB workspace with table navigation, item creation, editing, deletion, native type detection, and tailored rendering for strings, numbers, booleans, nulls, lists, maps, and sets.
- SQS viewer with queue navigation, non-destructive reads, formatted JSON payloads, technical metadata, refresh, and message deletion.
- SNS workspace with topics, subscriptions, and test publishing. SNS does not retain message history, so delivered messages are inspected through a subscribed SQS queue.
- SES inbox with recipients, subjects, and message content.
- Modular browser UI backed by focused routes, services, and codecs.

## Prerequisite

This project is only a **viewer**. It does not create, configure, or manage LocalStack. An existing LocalStack instance must be reachable on port `4566` or through the endpoint you configure.

## Run with Docker Compose

```bash
docker compose up --build
```

Open [http://localhost:3000](http://localhost:3000). By default, the container reaches LocalStack on the host through `http://host.docker.internal:4566`.

To use a LocalStack instance on another host or Docker network:

```bash
LOCALSTACK_ENDPOINT=http://localstack.my-network:4566 docker compose up --build
```

You may also copy `.env.example` to `.env` and edit the endpoint. The Compose file runs only the viewer; it does not pull a LocalStack image, mount the Docker socket, or create LocalStack volumes.

## Published Docker image

The repository name is **`localstack-viewer`**. Its GHCR image name is generated from the GitHub account or organization that owns the repository:

```text
ghcr.io/samuelssan28/localstack-viewer:latest
```

> The repository owner is **`SamuelSSan28`**. The workflow uses `${{ github.repository }}` and automatically publishes the lowercase GHCR path `samuelssan28/localstack-viewer`.

The exact image URL is visible on the repository's **Packages** page and in the **Generate image tags and labels** step of the Docker workflow.

### Pull and run

The repository owner is **[`SamuelSSan28`](https://github.com/SamuelSSan28)**. GHCR image paths are lowercase, so the published image uses `samuelssan28`:

```bash
docker pull ghcr.io/samuelssan28/localstack-viewer:latest

docker run --rm -p 3000:3000 \
  --add-host=host.docker.internal:host-gateway \
  -e LOCALSTACK_ENDPOINT=http://host.docker.internal:4566 \
  -e AWS_DEFAULT_REGION=us-east-1 \
  ghcr.io/samuelssan28/localstack-viewer:latest
```

For a private package, authenticate before pulling:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u SamuelSSan28 --password-stdin
docker pull ghcr.io/samuelssan28/localstack-viewer:latest
```

The token used for pulling a private image needs `read:packages`. A public package can be pulled without logging in.

## Publish to GitHub Container Registry

The `.github/workflows/docker.yml` workflow:

- validates pull requests without publishing;
- publishes `main` and `latest` after pushes to `main`;
- publishes `1.2.3` and `1.2` after a `v1.2.3` Git tag;
- can be started manually from **Actions → Docker image → Run workflow**.

No repository variable or manually-created secret is required for publishing to GHCR:

| Workflow value | Source | Value |
| --- | --- | --- |
| `REGISTRY` | Workflow environment | `ghcr.io` |
| `IMAGE_NAME` | `${{ github.repository }}` | `SamuelSSan28/localstack-viewer` (normalized to lowercase by the Docker metadata action) |
| `github.actor` | GitHub Actions context | User that started the workflow |
| `secrets.GITHUB_TOKEN` | Automatically created by Actions | Temporary package publishing token |

The job requests `packages: write`. Do not create `DOCKER_USERNAME`, `DOCKER_PASSWORD`, `GHCR_TOKEN`, or a Personal Access Token for publication. An organization administrator only needs to take action if organization policy prevents workflows from writing packages.

Publish a version with:

```bash
git tag v1.0.0
git push origin v1.0.0
```

After the first publication, use **Package settings** on GitHub to choose public or private visibility.

## Runtime environment variables

Runtime variables are provided when the container starts; they are not publishing credentials and should not be added as GitHub Actions secrets.

| Variable | Default | Description |
| --- | --- | --- |
| `LOCALSTACK_ENDPOINT` | `http://localhost:4566` in Node; `http://host.docker.internal:4566` in Compose | Full endpoint of the existing LocalStack instance. |
| `AWS_DEFAULT_REGION` | `us-east-1` | Region queried and displayed by the viewer. |
| `PORT` | `3000` | Internal HTTP port of the Node process. |
| `VIEWER_PORT` | `3000` | Host port published by Docker Compose. |

Example with a remote LocalStack endpoint and a different viewer port:

```bash
LOCALSTACK_ENDPOINT=http://192.168.1.50:4566 VIEWER_PORT=8080 docker compose up -d
```

## Local development

With LocalStack already available on port `4566`:

```bash
npm install
npm run dev
```

## API

- `GET /api/health` — viewer health.
- `GET /api/services` — resource counts and service status.
- `GET /api/emails` — messages captured by local SES.
- `GET /api/sqs/queues` — SQS queues.
- `GET|DELETE /api/sqs/messages?queueUrl=...` — inspect or delete messages.
- `GET /api/sns/topics` — SNS topics.
- `GET|POST /api/sns/topic?topicArn=...` — inspect subscriptions or publish a test message.
- `GET /api/dynamodb/tables` — DynamoDB tables.
- `GET|PUT|DELETE /api/dynamodb/tables/:table/items` — inspect and manage items.
