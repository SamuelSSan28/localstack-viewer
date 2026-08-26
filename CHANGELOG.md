# Changelog

All notable changes to LocalStack Viewer are documented in this file. The
project follows [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-08-26

The first stable release provides a browser dashboard for working with an
existing LocalStack instance.

### Added

- Resource overview with counts for DynamoDB, SQS, SNS, and SES.
- DynamoDB table browsing, filtering, sorting, pagination, field pinning, item
  editing and deletion, and clipboard tools for cells, rows, and selections.
- SQS queue browsing, non-destructive message inspection, filtering,
  pagination, message submission, and deletion.
- SNS topic and subscription inspection and SES email inspection.
- S3 bucket and object management, including regional bucket creation,
  filtering, uploads, downloads, metadata editing, and text previews.
- Structured JSON logging with configurable verbosity.
- Multi-architecture Docker images for `linux/amd64` and `linux/arm64`.

### Fixed

- LocalStack connectivity from the viewer container and static-file serving.
- Safe SQS inspection across multiple batches without consuming messages.
- S3 requests, regional bucket creation, and legacy region normalization.
- DynamoDB numeric/date sorting, JSON-string previews, and selection state
  after filtering.

[1.0.0]: https://github.com/SamuelSSan28/localstack-viewer/releases/tag/v1.0.0
