import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

const PARAMS: ScryptOptions = { N: 2 ** 15, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
const derive = (password: string, salt: Buffer, len: number) => new Promise<Buffer>((resolve, reject) => scrypt(password, salt, len, PARAMS, (e, key) => (e ? reject(e) : resolve(key))));

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, 32);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const got = await derive(password, Buffer.from(salt, 'base64'), expected.length);
  return timingSafeEqual(got, expected);
}
/** Sert à garder le même temps de réponse quand l'adresse e-mail n'existe pas. */
export const DUMMY_HASH = `scrypt$${Buffer.alloc(16).toString('base64')}$${Buffer.alloc(32).toString('base64')}`;
export const newToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
