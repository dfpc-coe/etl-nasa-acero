# CHANGELOG

## Emoji Cheatsheet
- :pencil2: doc updates
- :bug: when fixing a bug
- :rocket: when making general improvements
- :white_check_mark: when adding tests
- :arrow_up: when upgrading dependencies
- :tada: when adding new features

## Version History

### Pending Release

### v1.9.0

- :arrow_up: Update `@tak-ps/etl` to 11.x - Output schemas are published as named schemas, as required by CloudTAK v14
- :rocket: Submit Operation volumes as expiring Polygons - a `b-m-p-s-p-i` marker with a companion shape that TAK clients remove once stale, in place of a persistent `u-d-f` drawing
- :rocket: Report volume `start` as the submission time so that ATAK, which expires a marker 1.5 x (`stale` - `start`) after receipt, holds the volume until `timeEnd`
- :bug: `CLOSED` volumes go stale 30 seconds after submission - an already stale CoT is dropped by CloudTAK and never reached a client to clear the volume

### v1.8.0

- :arrow_up: Update Core Dependencies

### v1.7.0

- :bug: Validate the webhook body as a `oneOf` discriminated on `type`. The previous `Type.Union` was evaluated as `anyOf`, and ajv's `removeAdditional` stripped every Operation key while checking the Telemetry branch, so all Operation posts were rejected with a 400
- :arrow_up: Require `@openaddresses/batch-schema` 10.30.0 for the ajv `discriminator` keyword
- :white_check_mark: Add webhook tests covering Telemetry and Operation body parsing through the discriminated `oneOf`

### v1.6.1

- :rocket: Update Core Deps

### v1.6.0

- :tada: Add TypeBox schemas for ACERO `Telemetry`, `Operation`, and `Volume` payloads and validate the webhook body against them
- :rocket: Webhook now accepts `application/json` only
- :tada: Submit `Telemetry` as Point markers and `Operation` volumes as state-colored Polygons via `this.submit`
- :tada: Add `TELEMETRY_STALE_MINUTES` input

### v1.5.0

- :arrow_up: Update Core Dependencies

### v1.4.0

- :rocket: Add Capabilities document
- :arrow_up: Update GH Actions

### v1.3.0

- :arrow_up: Update Core Deps

### v1.2.0

- :arrow_up: Update Core Deps

### v1.1.0

- :tada: Add a generic Webhook endpoint that accepts any JSON or XML payload and logs it, authenticated by a `WEBHOOK_SECRET` shared secret

### v1.0.1

- :arrow_up: Update Core Deps

### v1.0.0

- :rocket: Initial Approach

