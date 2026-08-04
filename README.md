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

This ETL is invoked via Webhook rather than on a schedule. The endpoint accepts an arbitrary JSON or XML
payload and logs it to console - it performs no submission to CloudTAK.

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
    -d '{ "hello": "world" }'
```

```sh
curl -X POST http://localhost:5002/<webhookid> \
    -H 'X-Webhook-Secret: <secret>' \
    -H 'Content-Type: application/xml' \
    -d '<event uid="ABC"><point lat="39" lon="-105"/></event>'
```

Supported Content-Types are `application/json`, `application/xml`, and any `text/*` type. JSON bodies are
logged as parsed & pretty printed objects, everything else is logged as the raw string. Any other
Content-Type is rejected with a `400`.

### Deployment

Deployment into the CloudTAK environment for configuration is done via automatic releases to the DFPC AWS environment.

Github actions will build and push docker releases on every version tag which can then be automatically configured via the 
CloudTAK API.

Non-DFPC users will need to setup their own docker => ECS build system via something like Github Actions or AWS Codebuild.

