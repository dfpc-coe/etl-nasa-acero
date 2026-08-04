import { createHash, timingSafeEqual } from 'node:crypto';
import type { TSchema } from '@sinclair/typebox';
import { Type } from '@sinclair/typebox';
import type { Event } from '@tak-ps/etl';
import ETL, { SchemaType, handler as internal, local, DataFlowType, InvocationType } from '@tak-ps/etl';
import type Schema from '@openaddresses/batch-schema';

/**
 * The Input Schema contains the environment object that will be requested via the CloudTAK UI
 * It should be a valid TypeBox object - https://github.com/sinclairzx81/typebox
 */
const InputSchema = Type.Object({
    'WEBHOOK_SECRET': Type.String({
        description: 'Shared secret that inbound requests must present via an "Authorization: Bearer <secret>" or "X-Webhook-Secret: <secret>" header'
    }),
    'DEBUG': Type.Boolean({
        default: false,
        description: 'Print inbound request headers in logs'
    })
});

/**
 * The Output Schema contains the known properties that will be returned on the
 * GeoJSON Feature in the .properties.metdata object
 */
const OutputSchema = Type.Object({})

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
        task: Task
    ): Promise<void> {
        const env = await task.env(InputSchema);

        await schema.post('/:webhookid', {
            name: 'Incoming Webhook',
            group: 'Default',
            description: 'Generic endpoint that accepts an arbitrary JSON or XML payload and logs it',
            params: Type.Object({
                webhookid: Type.String({
                    description: 'Unique identifier for the webhook'
                })
            }),
            body: {
                'application/json': true,
                'application/xml': true,
                'text/*': true
            },
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

            const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();

            if (env.DEBUG) {
                console.log(`ok - ${req.params.webhookid}: headers ${JSON.stringify(req.headers, null, 2)}`);
            }

            // JSON bodies arrive parsed, XML & other text bodies arrive as a raw string
            console.log(`ok - ${req.params.webhookid}: ${contentType || '(no content-type)'} payload`);
            console.log(typeof req.body === 'string' ? req.body : JSON.stringify(req.body, null, 2));

            return res.json({
                status: 200,
                message: 'Received'
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
