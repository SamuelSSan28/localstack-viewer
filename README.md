# LocalStack Viewer

A browser dashboard for inspecting resources in an existing LocalStack instance, including DynamoDB tables, SQS queues, SNS topics, SES emails, and service counts.

<img width="1897" height="952" alt="image" src="https://github.com/user-attachments/assets/ca0d5ea5-9004-4ad3-9714-9adae3cd700c" />

## Requirements

- Docker
- An existing LocalStack instance that the container can reach

LocalStack Viewer does not start or configure LocalStack.

## Run with Docker

Pull the published image and start the viewer:

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

### ARM64 hosts

The image is published for both `linux/amd64` and `linux/arm64`. Docker
automatically selects the image that matches the host architecture, so the same
pull and run commands work on Intel/AMD and ARM64 hosts:

```bash
docker pull ghcr.io/samuelssan28/localstack-viewer:latest
```

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

| Option                | Default                 | Description                                                                                                                                                                                       |
| --------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LOCALSTACK_ENDPOINT` | `http://localhost:4566` | LocalStack URL reachable from the viewer container. When LocalStack runs on the Docker host, use `http://host.docker.internal:4566` together with `--add-host=host.docker.internal:host-gateway`. |
| `AWS_DEFAULT_REGION`  | `us-east-1`             | Initial region suggested when creating an S3 bucket. You can choose or type a different region in the create-bucket dialog.                                                                       |
| `PORT`                | `8888`                  | HTTP port inside the container. Usually this does not need to be changed; change the left side of `-p 8888:8888` to use another host port.                                                        |

For example, expose the viewer at port `9090` with `-p 9090:8888`.

## Contributing

Contributions are welcome. If you would like to suggest an improvement or fix,
open a pull request with your changes.
