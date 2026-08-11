# LocalStack Viewer

A browser dashboard for inspecting resources in an existing LocalStack instance, including DynamoDB tables, SQS queues, SNS topics, SES emails, and service counts.

## Requirements

- Docker
- An existing LocalStack instance that the container can reach

LocalStack Viewer does not start or configure LocalStack.

## Run the image

The repository owner is **`SamuelSSan28`** and the published image is:

```text
ghcr.io/samuelssan28/localstack-viewer:latest
```

Pull and start the viewer:

```bash
docker pull ghcr.io/samuelssan28/localstack-viewer:latest

docker run -d \
  --name localstack-viewer \
  --restart unless-stopped \
  -p 8888:8888 \
  --add-host=host.docker.internal:host-gateway \
  -e LOCALSTACK_ENDPOINT=http://host.docker.internal:4566 \
  -e AWS_DEFAULT_REGION=us-east-1 \
  ghcr.io/samuelssan28/localstack-viewer:latest
```

Open [http://localhost:8888](http://localhost:8888).

### LocalStack on another host

Set `LOCALSTACK_ENDPOINT` to an address reachable **from inside the container**:

```bash
docker run -d \
  --name localstack-viewer \
  --restart unless-stopped \
  -p 8888:8888 \
  -e LOCALSTACK_ENDPOINT=http://192.168.1.50:4566 \
  -e AWS_DEFAULT_REGION=us-east-1 \
  ghcr.io/samuelssan28/localstack-viewer:latest
```

## Update the image

Pull the newest image, remove the running container, and create it again with the same settings:

```bash
docker pull ghcr.io/samuelssan28/localstack-viewer:latest
docker rm -f localstack-viewer

docker run -d \
  --name localstack-viewer \
  --restart unless-stopped \
  -p 8888:8888 \
  --add-host=host.docker.internal:host-gateway \
  -e LOCALSTACK_ENDPOINT=http://host.docker.internal:4566 \
  -e AWS_DEFAULT_REGION=us-east-1 \
  ghcr.io/samuelssan28/localstack-viewer:latest
```

Removing the container does not remove LocalStack resources. The viewer only reads and manages resources through the configured LocalStack endpoint.

## Configuration

| Option | Default | Description |
| --- | --- | --- |
| `LOCALSTACK_ENDPOINT` | `http://localhost:4566` | LocalStack URL reachable from the viewer container. When LocalStack runs on the Docker host, use `http://host.docker.internal:4566` together with `--add-host=host.docker.internal:host-gateway`. |
| `AWS_DEFAULT_REGION` | `us-east-1` | AWS region displayed and queried by the viewer. |
| `PORT` | `8888` | HTTP port inside the container. Usually this does not need to be changed; change the left side of `-p 8888:8888` to use another host port. |

For example, expose the viewer at port `9090` with `-p 9090:8888`.

## Private package access

Public images can be pulled without signing in. If the package is private, authenticate with a token that has `read:packages` permission:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u SamuelSSan28 --password-stdin
docker pull ghcr.io/samuelssan28/localstack-viewer:latest
```

## Useful commands

```bash
# View logs
docker logs -f localstack-viewer

# Restart the viewer
docker restart localstack-viewer

# Stop and remove the viewer
docker rm -f localstack-viewer
```
