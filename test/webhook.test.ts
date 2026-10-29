import test from 'node:test';
import assert from 'node:assert';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

process.env.ETL_API = process.env.ETL_API || 'http://localhost:5001';
process.env.ETL_LAYER = process.env.ETL_LAYER || '1';
process.env.ETL_TOKEN = process.env.ETL_TOKEN || 'etl.test-token';

const { default: Task } = await import('../task.js');

const SECRET = 'test-secret';
const GUFI = '3f2b8c1e-6d4a-4b9e-9a7c-2e5f1d0c8b6a';

const submitted: Array<{ type: string, features: Array<any> }> = [];

const task = new Task(import.meta.url, { logging: { webhooks: false } });
// @ts-expect-error Stub Layer config so env() does not hit the API
task.layer = {
    incoming: {
        environment: {
            WEBHOOK_SECRET: SECRET,
            TELEMETRY_STALE_MINUTES: 5,
            DEBUG: false
        }
    }
};
task.submit = async (fc) => {
    submitted.push(fc);
    return true;
};

let server: Server;
let base: string;

test.before(async () => {
    const app = await task.controlWebhooks();
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

test.after(() => {
    server.close();
});

test.beforeEach(() => {
    submitted.length = 0;
});

async function post(body: unknown): Promise<{ status: number, body: any }> {
    const res = await fetch(`${base}/test-webhook`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SECRET}`
        },
        body: JSON.stringify(body)
    });

    return { status: res.status, body: await res.json() };
}

function telemetry() {
    return {
        type: 'Feature',
        properties: {
            aceroType: 'Telemetry',
            gufi: GUFI,
            timeMeasured: '2026-10-28T16:00:00.000Z',
            accuracyVertical: 'Va1m',
            accuracyHorizontal: 'Ha1m',
            groundSpeedMetersPerSecond: 12.5,
            verticalSpeedMetersPerSecond: -0.5,
            trackDegreesEastOfNorth: 270,
            extrapolated: false
        },
        geometry: {
            type: 'Point',
            coordinates: [-105.0, 39.75, 1650]
        }
    };
}

function operation() {
    return {
        type: 'FeatureCollection',
        aceroType: 'Operation',
        gufi: GUFI,
        state: 'APPROVED',
        features: [{
            type: 'Feature',
            properties: {
                aceroType: 'Volume',
                timeStart: '2026-10-28T16:00:00.000Z',
                timeEnd: '2026-10-28T17:00:00.000Z',
                altitudeMetersWGS84Upper: 1800.4,
                altitudeMetersWGS84Lower: 1600.6
            },
            geometry: {
                type: 'Polygon',
                coordinates: [[
                    [-105.01, 39.74],
                    [-104.99, 39.74],
                    [-104.99, 39.76],
                    [-105.01, 39.74]
                ]]
            }
        }]
    };
}

test('Telemetry Feature is accepted and submitted as an aircraft marker', async () => {
    const res = await post(telemetry());

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: 200, message: 'Submitted 1 features' });

    assert.equal(submitted.length, 1);
    assert.equal(submitted[0].features.length, 1);

    const feat = submitted[0].features[0];
    assert.equal(feat.id, `acero-${GUFI}`);
    assert.equal(feat.properties.type, 'a-f-A-M-F-Q');
    assert.equal(feat.properties.callsign, 'ACERO 3f2b8c1e');
    assert.equal(feat.properties.time, '2026-10-28T16:00:00.000Z');
    assert.equal(feat.properties.stale, '2026-10-28T16:05:00.000Z');
    assert.equal(feat.properties.course, 270);
    assert.equal(feat.properties.speed, 12.5);
    assert.deepEqual(feat.properties.metadata, telemetry().properties);
    assert.deepEqual(feat.geometry, telemetry().geometry);
});

test('Operation FeatureCollection is accepted and submitted as volume polygons', async () => {
    const body = operation();
    body.features.push({
        ...body.features[0],
        properties: {
            ...body.features[0].properties,
            timeStart: '2026-10-28T17:00:00.000Z',
            timeEnd: '2026-10-28T18:00:00.000Z'
        }
    });

    const res = await post(body);

    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { status: 200, message: 'Submitted 2 features' });

    assert.equal(submitted.length, 1);
    assert.equal(submitted[0].features.length, 2);

    const [first, second] = submitted[0].features;
    assert.equal(first.id, `acero-${GUFI}-volume-0`);
    assert.equal(second.id, `acero-${GUFI}-volume-1`);
    assert.equal(first.properties.type, 'u-d-f');
    assert.equal(first.properties.callsign, 'ACERO 3f2b8c1e APPROVED');
    assert.equal(first.properties.start, '2026-10-28T16:00:00.000Z');
    assert.equal(first.properties.stale, '2026-10-28T17:00:00.000Z');
    assert.equal(second.properties.start, '2026-10-28T17:00:00.000Z');
    assert.equal(first.properties.stroke, '#2fb344');
    assert.match(first.properties.remarks, /Altitude: 1601m to 1800m WGS84/);
    assert.deepEqual(first.properties.metadata, {
        gufi: GUFI,
        state: 'APPROVED',
        ...operation().features[0].properties
    });
    assert.deepEqual(first.geometry, operation().features[0].geometry);
});

test('CLOSED Operation volumes go stale immediately', async () => {
    const res = await post({ ...operation(), state: 'CLOSED' });

    assert.equal(res.status, 200);

    const feat = submitted[0].features[0];
    assert.equal(feat.properties.stale, feat.properties.time);
    assert.equal(feat.properties.stroke, '#667382');
});

test('Unknown keys are stripped from the matching branch only', async () => {
    const tel = telemetry();
    const res = await post({
        ...tel,
        extra: true,
        properties: { ...tel.properties, extra: true }
    });

    assert.equal(res.status, 200);
    assert.deepEqual(submitted[0].features[0].properties.metadata, tel.properties);

    const op = operation();
    const res2 = await post({ ...op, extra: true });

    assert.equal(res2.status, 200);
    assert.equal(submitted[1].features[0].properties.metadata.gufi, GUFI);
    assert.equal(submitted[1].features[0].properties.metadata.state, 'APPROVED');
});

test('Unknown discriminator value is rejected', async () => {
    const res = await post({ ...operation(), type: 'GeometryCollection' });

    assert.equal(res.status, 400);
    assert.equal(submitted.length, 0);
});

test('Missing discriminator is rejected', async () => {
    const body: Partial<ReturnType<typeof operation>> = operation();
    delete body.type;
    const res = await post(body);

    assert.equal(res.status, 400);
    assert.equal(submitted.length, 0);
});

test('Operation body tagged as a Telemetry Feature is rejected', async () => {
    const res = await post({ ...operation(), type: 'Feature' });

    assert.equal(res.status, 400);
    assert.equal(submitted.length, 0);
});

test('Operation missing a required field is rejected', async () => {
    const body: Partial<ReturnType<typeof operation>> = operation();
    delete body.state;
    const res = await post(body);

    assert.equal(res.status, 400);
    assert.equal(submitted.length, 0);
});

test('Telemetry with an invalid geometry is rejected', async () => {
    const res = await post({
        ...telemetry(),
        geometry: { type: 'Polygon', coordinates: [-105.0, 39.75] }
    });

    assert.equal(res.status, 400);
    assert.equal(submitted.length, 0);
});
