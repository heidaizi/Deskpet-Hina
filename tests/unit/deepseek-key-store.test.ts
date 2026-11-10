import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DeepSeekKeyStore, type SecretStorage } from '../../src/main/domain/deepseek-key-store'

const storage: SecretStorage = {
  isAsyncEncryptionAvailable: async () => true,
  encryptStringAsync: async (value) => Buffer.from(`encrypted:${value}`),
  decryptStringAsync: async (value) => ({
    result: value.toString('utf8').replace(/^encrypted:/u, ''),
    shouldReEncrypt: false,
  }),
}

describe('DeepSeek key store', () => {
  it('persists an encrypted key and never writes plaintext', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'deskpet-deepseek-key-'))
    const path = join(directory, 'deepseek-key.enc')
    const store = new DeepSeekKeyStore(path, storage)
    const key = 'sk-test-012345678901234567890123456789'
    try {
      await store.saveKey(key)
      expect(await store.hasKey()).toBe(true)
      expect(await store.loadKey()).toBe(key)
      expect(readFileSync(path, 'utf8')).not.toContain(key)
      store.deleteKey()
      expect(await store.hasKey()).toBe(false)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('refuses plaintext fallback when encryption is unavailable', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'deskpet-deepseek-key-'))
    const store = new DeepSeekKeyStore(join(directory, 'deepseek-key.enc'), {
      ...storage,
      isAsyncEncryptionAvailable: async () => false,
    })
    try {
      await expect(store.saveKey('sk-test-012345678901234567890123456789')).rejects.toThrow(
        '安全存储',
      )
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('migrates legacy synchronous ciphertext to the async storage format', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'deskpet-deepseek-key-migrate-'))
    const path = join(directory, 'deepseek-key.enc')
    const key = 'sk-test-012345678901234567890123456789'
    writeFileSync(
      path,
      JSON.stringify({
        schemaVersion: 1,
        ciphertext: Buffer.from(`encrypted:${key}`).toString('base64'),
      }),
      'utf8',
    )
    const store = new DeepSeekKeyStore(path, storage)
    try {
      expect(await store.loadKey()).toBe(key)
      expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ schemaVersion: 2 })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
