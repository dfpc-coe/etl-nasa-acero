<h1 align='center'>ETL-Template</h1>

<p align='center'>Template Repository for creating new ETLs</p>

## Development

DFPC provided Lambda ETLs are currently all written in [NodeJS](https://nodejs.org/en) through the use of a AWS Lambda optimized
Docker container. Documentation for the Dockerfile can be found in the [AWS Help Center](https://docs.aws.amazon.com/lambda/latest/dg/images-create.html)

```sh
npm install
```

Add a .env file in the root directory that gives the ETL script the necessary variables to communicate with a local ETL server.
When the ETL is deployed the `ETL_API` and `ETL_LAYER` variables will be provided by the Lambda Environment

```json
{
    "ETL_API": "http://localhost:5001",
    "ETL_LAYER": "19"
}
```

To run the task, ensure the local [CloudTAK](https://github.com/dfpc-coe/CloudTAK/) server is running and then run with typescript runtime
or build to JS and run natively with node

```
ts-node task.ts
```

```
npm run build
cp .env dist/
node dist/task.js
```

### Webhook

This ETL is invoked via Webhook rather than on a schedule. The endpoint accepts NASA ACERO `Telemetry`
Features and `Operation` FeatureCollections (containing `Volume` Features) as JSON, validates them against
the TypeBox schema in `task.ts`, and submits them to CloudTAK. Each `Telemetry` report becomes a Point
marker keyed by `gufi` carrying course and speed, and each `Volume` in an `Operation` becomes a Polygon
colored by operation state (`APPROVED` green, `NONCONFORMING` orange, `CLOSED` grey). `CLOSED` volumes are
submitted already stale so they drop off the map.

Run the webhook server locally on port `5002` with:

```
npm run build
cp .env dist/
node dist/task.js control:webhooks
```

Requests must present the `WEBHOOK_SECRET` configured in the Layer environment via either an
`Authorization: Bearer <secret>` or `X-Webhook-Secret: <secret>` header, otherwise a `401` is returned.

```sh
curl -X POST http://localhost:5002/<webhookid> \
    -H 'Authorization: Bearer <secret>' \
    -H 'Content-Type: application/json' \
    -d '{
        "type": "Feature",
        "properties": {
            "aceroType": "Telemetry",
            "gufi": "59f8c628-a050-4d1e-85ca-55f1e60e24e6",
            "timeMeasured": "2026-10-13T19:37:42.912Z",
            "accuracyVertical": "Va1m",
            "accuracyHorizontal": "Ha1m",
            "groundSpeedMetersPerSecond": 2.002544,
            "verticalSpeedMetersPerSecond": 0,
            "trackDegreesEastOfNorth": 332.028,
            "extrapolated": false
        },
        "geometry": { "type": "Point", "coordinates": [-122.0672965, 37.4290778, 22.65] }
    }'
```

Only `application/json` is accepted. Payloads that do not match the `Telemetry` or `Operation` schema
are rejected with a `400` describing the validation errors.

### Deployment

Deployment into the CloudTAK environment for configuration is done via automatic releases to the DFPC AWS environment.

Github actions will build and push docker releases on every version tag which can then be automatically configured via the 
CloudTAK API.

Non-DFPC users will need to setup their own docker => ECS build system via something like Github Actions or AWS Codebuild.

