import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// OWASP-recommended scrypt cost (N=2^17, r=8, p=1). Logins are rare — sessions last a year.
// Tests lower the cost through the environment to stay fast.
const N = Number(process.env.PASSWORD_SCRYPT_N ?? 2 ** 17);
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, options, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

const maxmem = (n: number, r: number) => 128 * n * r * 2;

/** Format: scrypt$N$r$p$salt$hash (base64url). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, { N, r: R, p: P, maxmem: maxmem(N, R) });
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  const options = { N: Number(n), r: Number(r), p: Number(p), maxmem: maxmem(Number(n), Number(r)) };
  const key = await derive(password, Buffer.from(salt, 'base64url'), options);
  return key.length === expected.length && timingSafeEqual(key, expected);
}
