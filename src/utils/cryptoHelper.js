import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

// Master Encryption secret key setup (must be 32 bytes for aes-256)
const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'outreachflow_secret_encryption_32b';
const salt = 'outreachflow_salt_constant';
// Derive a standard 32-byte key from the secret using PBKDF2
const KEY = crypto.pbkdf2Sync(ENCRYPTION_SECRET, salt, 10000, 32, 'sha512');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 12 bytes is standard for GCM

/**
 * Encrypt a string using AES-256-GCM
 * Output format: iv_hex:auth_tag_hex:encrypted_text_hex
 */
export function encrypt(text) {
  if (!text) return '';

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');
    
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (error) {
    console.error('🔒 Encryption failed:', error.message);
    throw new Error('Cryptographic failure during save.');
  }
}

/**
 * Decrypt a string encrypted with AES-256-GCM
 */
export function decrypt(encryptedText) {
  if (!encryptedText) return '';
  if (!encryptedText.includes(':')) {
    // If it's not encrypted (legacy or plain), return it
    return encryptedText;
  }

  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted format.');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('🔓 Decryption failed:', error.message);
    // Return placeholder or empty string to prevent application crash
    return '';
  }
}
