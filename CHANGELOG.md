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

