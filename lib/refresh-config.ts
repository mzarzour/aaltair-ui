import { env } from 'cloudflare:workers';
import defaults from '../data/default-config.json';
export const key = 'altair/refresh-config.json';
export async function readConfig() {
 if (!env.BUCKET) throw new Error('Configuration storage unavailable');
 const object = await env.BUCKET.get(key);
 return { config:object ? await object.json<any>() : defaults, etag:object?.etag ?? null };
}
export function isOwner(request:Request) {
 return Boolean(env.ALTAIR_OWNER_EMAIL && request.headers.get('oai-authenticated-user-id') && request.headers.get('oai-authenticated-user-email')?.toLowerCase() === env.ALTAIR_OWNER_EMAIL.toLowerCase());
}
export function json(value:unknown,status=200) {return Response.json(value,{status,headers:{'Cache-Control':'no-store'}});}
