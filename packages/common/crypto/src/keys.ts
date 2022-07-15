//
// Copyright 2020 DXOS.org
//

import assert from 'assert';
import crypto from 'hypercore-crypto';

import { PublicKey, PublicKeyLike, PUBLIC_KEY_LENGTH, SECRET_KEY_LENGTH } from '@dxos/protocols';

import { HumanHasher } from './human-hash';

export const hasher = new HumanHasher();

export const SIGNATURE_LENGTH = 64;

export const zeroKey = () => new Uint8Array(32);

export interface KeyPair {
  publicKey: Buffer
  secretKey: Buffer
}

export const createKeyPair = (seed?: Buffer): KeyPair => {
  if (seed) {
    assert(seed.length >= 32, 'Seedphrase too sort. Expecting length of 32.');
    return crypto.keyPair(seed.slice(0, 32));
  }
  return crypto.keyPair();
};

export const discoveryKey = (key: PublicKeyLike): Buffer => crypto.discoveryKey(PublicKey.from(key).asBuffer());

export const humanize = (value: PublicKeyLike): string => {
  if (value instanceof Buffer || value instanceof Uint8Array) {
    value = PublicKey.stringify(value);
  } else if (value instanceof PublicKey) {
    value = value.toHex();
  }

  return hasher.humanize(value);
};

/**
 * Return random bytes of length.
 * @param [length=32]
 * @return {Buffer}
 */
export const randomBytes = (length = 32): Buffer => crypto.randomBytes(length);

/**
 * @return {string}
 */
// TODO(wittjosiah): This probably shouldn't rely on PublicKey?
export const createId = (): string => PublicKey.stringify(randomBytes(32));

/**
 * Sign the contents of message with secretKey
 * @param {Buffer} message
 * @param {Buffer} secretKey
 * @returns {Buffer} signature
 */
export const sign = (message: Buffer, secretKey: Buffer): Buffer => {
  assert(Buffer.isBuffer(message));
  assert(Buffer.isBuffer(secretKey) && secretKey.length === SECRET_KEY_LENGTH);

  return crypto.sign(message, secretKey);
};

/**
 * Verifies the signature against the message and publicKey.
 * @param {Buffer} message
 * @param {Buffer} publicKey
 * @param {Buffer} signature
 * @return {boolean}
 */
export const verify = (message: Buffer, signature: Buffer, publicKey: Buffer): boolean => {
  assert(Buffer.isBuffer(message));
  assert(Buffer.isBuffer(signature) && signature.length === SIGNATURE_LENGTH);
  assert(Buffer.isBuffer(publicKey) && publicKey.length === PUBLIC_KEY_LENGTH);

  return crypto.verify(message, signature, publicKey);
};
