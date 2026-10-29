import { createHash, timingSafeEqual } from 'node:crypto';
import type { TSchema, Static } from '@sinclair/typebox';
import { Type } from '@sinclair/typebox';
import type { Event } from '@tak-ps/etl';
import ETL, { Feature, SchemaType, handler as internal, local, DataFlowType, InvocationType } from '@tak-ps/etl';
import type Schema from '@openaddresses/batch-schema';

/**
 * The Input Schema contains the environment object that will be requested via the CloudTAK UI
 * It should be a valid TypeBox object - https://github.com/sinclairzx81/typebox
 */
const InputSchema = Type.Object({
    'WEBHOOK_SECRET': Type.String({
        description: 'Shared secret that inbound requests must present via an "Authorization: Bearer <secret>" or "X-Webhook-Secret: <secret>" header'
    }),
    'TELEMETRY_STALE_MINUTES': Type.Integer({
        default: 5,
        minimum: 1,
        description: 'Minutes after the last Telemetry report before an aircraft marker goes stale'
    }),
    'DEBUG': Type.Boolean({
        default: false,
        description: 'Print inbound request headers and submitted features in logs'
    })
});

/**
 * The Output Schema contains the known properties that will be returned on the
 * GeoJSON Feature in the .properties.metdata object
 */
const OutputSchema = Type.Object({
    gufi: Type.String({ description: 'Globally Unique Flight Identifier' }),
    aceroType: Type.String({ description: 'Telemetry or Volume' }),
    timeMeasured: Type.Optional(Type.String()),
    accuracyVertical: Type.Optional(Type.String()),
    accuracyHorizontal: Type.Optional(Type.String()),
    groundSpeedMetersPerSecond: Type.Optional(Type.Number()),
    verticalSpeedMetersPerSecond: Type.Optional(Type.Number()),
    trackDegreesEastOfNorth: Type.Optional(Type.Number()),
    extrapolated: Type.Optional(Type.Boolean()),
    state: Type.Optional(Type.String({ description: 'Operation state the Volume belongs to' })),
    timeStart: Type.Optional(Type.String()),
    timeEnd: Type.Optional(Type.String()),
    altitudeMetersWGS84Upper: Type.Optional(Type.Number()),
    altitudeMetersWGS84Lower: Type.Optional(Type.Number())
});

const Position = Type.Array(Type.Number(), {
    minItems: 2,
    maxItems: 3,
    description: 'GeoJSON position: [longitude, latitude] with an optional WGS84 altitude in meters'
});

const Gufi = Type.String({
    format: 'uuid',
    description: 'Globally Unique Flight Identifier shared by an Operation and its Telemetry'
});

const Telemetry = Type.Object({
    type: Type.Literal('Feature'),
    properties: Type.Object({
        aceroType: Type.Literal('Telemetry'),
        gufi: Gufi,
        timeMeasured: Type.String({
            format: 'date-time',
            description: 'Time the position was measured by the aircraft'
        }),
        accuracyVertical: Type.String({
            description: 'ASTM F3411 vertical accuracy category, e.g. Va1m'
        }),
        accuracyHorizontal: Type.String({
            description: 'ASTM F3411 horizontal accuracy category, e.g. Ha1m'
        }),
        groundSpeedMetersPerSecond: Type.Number(),
        verticalSpeedMetersPerSecond: Type.Number(),
        trackDegreesEastOfNorth: Type.Number({
            minimum: 0,
            maximum: 360,
            description: 'Course over ground in degrees clockwise from true north'
        }),
        extrapolated: Type.Boolean({
            description: 'True when the position was projected rather than measured'
        })
    }),
    geometry: Type.Object({
        type: Type.Literal('Point'),
        coordinates: Position
    })
}, {
    description: 'Single aircraft position report'
});

const Volume = Type.Object({
    type: Type.Literal('Feature'),
    properties: Type.Object({
        aceroType: Type.Literal('Volume'),
        timeStart: Type.String({ format: 'date-time' }),
        timeEnd: Type.String({ format: 'date-time' }),
        altitudeMetersWGS84Upper: Type.Number(),
        altitudeMetersWGS84Lower: Type.Number()
    }),
    geometry: Type.Object({
        type: Type.Literal('Polygon'),
        coordinates: Type.Array(Type.Array(Position, { minItems: 4 }))
    })
}, {
    description: 'Four dimensional airspace volume an Operation is authorized to occupy'
});

const Operation = Type.Object({
    type: Type.Literal('FeatureCollection'),
    aceroType: Type.Literal('Operation'),
    gufi: Gufi,
    state: Type.String({
        description: 'Operation lifecycle state. Observed values: APPROVED, NONCONFORMING, CLOSED'
    }),
    features: Type.Array(Volume)
}, {
    description: 'Operation plan and its current state, emitted on every state change'
});

const Acero = Type.Unsafe<Static<typeof Telemetry> | Static<typeof Operation>>({
    discriminator: { propertyName: 'type' },
    oneOf: [Telemetry, Operation]
});

const StateColor: Record<string, string> = {
    APPROVED: '#2fb344',
    NONCONFORMING: '#f76707',
    CLOSED: '#667382'
};

function telemetryFeature(
    body: Static<typeof Telemetry>,
    staleMinutes: number
): Static<typeof Feature.InputFeature> {
    const time = new Date(body.properties.timeMeasured);
    const stale = new Date(time.getTime() + staleMinutes * 60 * 1000);

    return {
        id: `acero-${body.properties.gufi}`,
        type: 'Feature',
        properties: {
            callsign: `ACERO ${body.properties.gufi.slice(0, 8)}`,
            type: 'a-f-A-M-F-Q',
            how: 'm-g',
            time: time.toISOString(),
            start: time.toISOString(),
            stale: stale.toISOString(),
            course: body.properties.trackDegreesEastOfNorth,
            speed: body.properties.groundSpeedMetersPerSecond,
            metadata: body.properties
        },
        geometry: body.geometry
    };
}

function operationFeatures(
    body: Static<typeof Operation>
): Array<Static<typeof Feature.InputFeature>> {
    const now = new Date().toISOString();
    const color = StateColor[body.state] || '#206bc4';

    return body.features.map((volume, idx) => {
        const stale = body.state === 'CLOSED' ? now : volume.properties.timeEnd;

        return {
            id: `acero-${body.gufi}-volume-${idx}`,
            type: 'Feature',
            properties: {
                callsign: `ACERO ${body.gufi.slice(0, 8)} ${body.state}`,
                type: 'u-d-f',
                how: 'h-e',
                time: now,
                start: volume.properties.timeStart,
                stale,
                stroke: color,
                'stroke-opacity': 0.75,
                fill: color,
                'fill-opacity': 0.25,
                remarks: [
                    `Operation ${body.gufi}`,
                    `State: ${body.state}`,
                    `Active: ${volume.properties.timeStart} to ${volume.properties.timeEnd}`,
                    `Altitude: ${Math.round(volume.properties.altitudeMetersWGS84Lower)}m to ${Math.round(volume.properties.altitudeMetersWGS84Upper)}m WGS84`
                ].join('\n'),
                metadata: {
                    gufi: body.gufi,
                    state: body.state,
                    ...volume.properties
                }
            },
            geometry: volume.geometry
        };
    });
}

/**
 * Compare a presented secret against the configured secret without leaking
 * length or content through timing. Digests normalize length for timingSafeEqual
 */
function secretMatches(presented: string, expected: string): boolean {
    if (!presented || !expected) return false;

    return timingSafeEqual(
        createHash('sha256').update(presented).digest(),
        createHash('sha256').update(expected).digest()
    );
}

export default class Task extends ETL {
    static name = 'etl-nasa-acero'
    static flow = [ DataFlowType.Incoming ];
    static invocation = [ InvocationType.Webhook ];
    static invocationDefaults = {
        webhook: {
            enabled: true
        }
    };

    static async webhooks(
        schema: Schema,
        task: ETL
    ): Promise<void> {
        const env = await task.env(InputSchema);

        await schema.post('/:webhookid', {
            name: 'Incoming Webhook',
            group: 'Default',
            description: 'Accepts NASA ACERO Telemetry features and Operation feature collections',
            params: Type.Object({
                webhookid: Type.String({
                    description: 'Unique identifier for the webhook'
                })
            }),
            body: Acero,
            res: Type.Object({
                status: Type.Integer(),
                message: Type.String()
            })
        }, async (req, res) => {
            const presented = String(req.headers['x-webhook-secret'] || '')
                || String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');

            if (!secretMatches(presented, env.WEBHOOK_SECRET)) {
                console.error(`not ok - ${req.params.webhookid}: rejected request with invalid shared secret`);

                return res.status(401).json({
                    status: 401,
                    message: 'Unauthorized'
                });
            }

            if (env.DEBUG) {
                console.log(`ok - ${req.params.webhookid}: headers ${JSON.stringify(req.headers, null, 2)}`);
            }

            const body: Static<typeof Acero> = req.body;

            const fc: Static<typeof Feature.InputFeatureCollection> = {
                type: 'FeatureCollection',
                features: []
            };

            if (body.type === 'Feature') {
                console.log(`ok - ${req.params.webhookid}: Telemetry ${body.properties.gufi} @ ${body.properties.timeMeasured}`);
                fc.features.push(telemetryFeature(body, env.TELEMETRY_STALE_MINUTES));
            } else {
                console.log(`ok - ${req.params.webhookid}: Operation ${body.gufi} ${body.state} (${body.features.length} volumes)`);
                fc.features.push(...operationFeatures(body));
            }

            if (env.DEBUG) {
                console.log(JSON.stringify(fc, null, 2));
            }

            await task.submit(fc);

            return res.json({
                status: 200,
                message: `Submitted ${fc.features.length} features`
            });
        });
    }

    async schema(
        type: SchemaType = SchemaType.Input,
        flow: DataFlowType = DataFlowType.Incoming
    ): Promise<TSchema> {
        if (flow === DataFlowType.Incoming) {
            if (type === SchemaType.Input) {
                return InputSchema;
            } else {
                return OutputSchema;
            }
        } else {
            return Type.Object({});
        }
    }
}

await local(await Task.init(import.meta.url), import.meta.url);
export async function handler(event: Event = {}, context?: object) {
    return await internal(new Task(import.meta.url), event, context);
}
