import { Injectable } from "@nestjs/common";

@Injectable()
export class NonceService {
  private readonly nonces = new Map<string, number>();

  has(nonce: string): boolean {
    return this.nonces.has(nonce);
  }

  add(nonce: string, ttlSeconds: number) {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    this.nonces.set(nonce, expiresAt);
    this.cleanup();
  }

  private cleanup() {
    const now = Date.now();
    for (const [nonce, expiresAt] of this.nonces.entries()) {
      if (expiresAt <= now) {
        this.nonces.delete(nonce);
      }
    }
  }
}
