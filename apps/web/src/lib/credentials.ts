import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const LOGIN_CODE_ALLOWED = /[^a-z0-9-]/g;
const PASSWORD_ALPHABET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";

export function normalizeLoginCode(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[._\s]+/g, "-")
    .replace(LOGIN_CODE_ALLOWED, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function createEmailLocalPartCandidate(value: string) {
  const normalized = normalizeLoginCode(value);
  return normalized || "user";
}

export function generateSecurePassword(length = 18) {
  const bytes = randomBytes(length);
  let password = "";

  for (let index = 0; index < length; index += 1) {
    password += PASSWORD_ALPHABET[bytes[index] % PASSWORD_ALPHABET.length];
  }

  return password;
}

function getCredentialSecret() {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;

  if (!secret) {
    throw new Error("AUTH_SECRET or NEXTAUTH_SECRET is required for credential encryption.");
  }

  return createHash("sha256").update(secret).digest();
}

export function encryptProvisionedPassword(password: string) {
  const key = getCredentialSecret();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptProvisionedPassword(payload: string) {
  const [ivEncoded, tagEncoded, encryptedEncoded] = payload.split(".");

  if (!ivEncoded || !tagEncoded || !encryptedEncoded) {
    return null;
  }

  try {
    const key = getCredentialSecret();
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivEncoded, "base64"));
    decipher.setAuthTag(Buffer.from(tagEncoded, "base64"));

    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedEncoded, "base64")),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}
