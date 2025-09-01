import { createHash, createHmac } from 'node:crypto';

export function hash(payload: string, algorithm = 'sha256'): string {
    const hasher = createHash(algorithm);
    hasher.update(payload);
    return hasher.digest('hex');
}

export function hmacHash(payload: string, key: Buffer, algorithm = 'sha256'): string {
    const hasher = createHmac(algorithm, key);
    hasher.update(payload);
    return hasher.digest('hex');
}
