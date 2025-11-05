const crypto = require("crypto");

/**
 * FIPS 140-2 Compliant Password Hashing Utility
 * Uses PBKDF2 with SHA-256 (FIPS-approved algorithm)
 * Replaces bcrypt for FIPS compliance
 */

const PBKDF2_ITERATIONS = 100000; // NIST recommendation
const HASH_LENGTH = 64; // 512 bits
const DIGEST_ALGORITHM = "sha256";
const SALT_LENGTH = 16; // 128 bits

/**
 * Hash a password using PBKDF2-SHA256 (FIPS-compliant)
 * @param {string} password - The plaintext password
 * @returns {string} The hashed password in format: salt:hash
 */
function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_LENGTH).toString("hex");
  const hash = crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, HASH_LENGTH, DIGEST_ALGORITHM)
    .toString("hex");
  return `pbkdf2:${salt}:${hash}`;
}

/**
 * Verify a password against a stored hash
 * Supports both PBKDF2 (new) and bcrypt (legacy) formats for migration
 * @param {string} password - The plaintext password to verify
 * @param {string} storedHash - The stored hash to verify against
 * @returns {boolean} True if password matches, false otherwise
 */
function verifyPassword(password, storedHash) {
  // Check if this is a PBKDF2 hash (new format)
  if (storedHash.startsWith("pbkdf2:")) {
    const parts = storedHash.split(":");
    if (parts.length !== 3) {
      console.error("Invalid PBKDF2 hash format");
      return false;
    }

    const salt = parts[1];
    const originalHash = parts[2];

    const verifyHash = crypto
      .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, HASH_LENGTH, DIGEST_ALGORITHM)
      .toString("hex");

    return originalHash === verifyHash;
  }

  // Legacy bcrypt support for migration
  // Note: This will only work if Node.js is NOT in FIPS mode yet
  // Once fully migrated, this branch can be removed
  try {
    const bcrypt = require("bcrypt");
    return bcrypt.compareSync(password, storedHash);
  } catch (error) {
    console.error("Failed to verify legacy bcrypt password:", error.message);
    console.error("This may be due to FIPS mode being enabled. Please reset password.");
    return false;
  }
}

/**
 * Check if a stored hash is using the legacy bcrypt format
 * @param {string} storedHash - The stored hash to check
 * @returns {boolean} True if this is a legacy bcrypt hash
 */
function isLegacyHash(storedHash) {
  return !storedHash.startsWith("pbkdf2:");
}

/**
 * Synchronous wrapper that mimics bcrypt.hashSync for drop-in replacement
 * @param {string} password - The plaintext password
 * @param {number} rounds - Ignored, kept for API compatibility
 * @returns {string} The hashed password
 */
function hashSync(password, rounds) {
  return hashPassword(password);
}

/**
 * Synchronous wrapper that mimics bcrypt.compareSync for drop-in replacement
 * @param {string} password - The plaintext password
 * @param {string} hash - The stored hash
 * @returns {boolean} True if password matches
 */
function compareSync(password, hash) {
  return verifyPassword(password, hash);
}

module.exports = {
  hashPassword,
  verifyPassword,
  isLegacyHash,
  hashSync,
  compareSync,
  // Export for testing
  PBKDF2_ITERATIONS,
  HASH_LENGTH,
  DIGEST_ALGORITHM,
};
