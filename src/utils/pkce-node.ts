// PKCE utilities for Telegram OIDC (Node.js)

/**
 * Generate a random code_verifier (43-128 chars).
 */
export function generateCodeVerifier(): string {
  return Buffer.from(crypto.randomBytes(32)).toString('hex');
}

/**
 * Generate code_challenge = base64url(SHA-256(code_verifier)).
 */
export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const data = crypto.createHash('sha256').update(codeVerifier).digest();
  return base64urlEncode(data);
}

/**
 * Base64url encode (no padding).
 */
function base64urlEncode(bytes: Buffer): string {
  return bytes.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
