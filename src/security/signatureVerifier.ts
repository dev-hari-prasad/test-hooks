import crypto from 'node:crypto';

export class SignatureVerifier {
  public static generateSignature(payload: string, secret: string, timestamp: number): string {
    const signaturePayload = `t=${timestamp},v1=${payload}`;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(signaturePayload);
    return `t=${timestamp},v1=${hmac.digest('hex')}`;
  }

  public static verifySignature(
    rawPayload: string,
    signatureHeader: string,
    secret: string,
    toleranceSeconds = 300
  ): boolean {
    if (!signatureHeader || !secret || !rawPayload) {
      return false;
    }

    const parts = signatureHeader.split(',');
    let timestamp = 0;
    let signature = '';

    for (const part of parts) {
      const [key, value] = part.split('=');
      if (key === 't') {
        timestamp = parseInt(value, 10);
      } else if (key === 'v1') {
        signature = value;
      }
    }

    if (!timestamp || !signature) {
      return false;
    }

    // Protect against replay attacks within tolerance window
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - timestamp) > toleranceSeconds) {
      return false;
    }

    const expectedSignaturePayload = `t=${timestamp},v1=${rawPayload}`;
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(expectedSignaturePayload);
    const expectedSignature = hmac.digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'utf8'),
        Buffer.from(expectedSignature, 'utf8')
      );
    } catch {
      return false;
    }
  }
}
