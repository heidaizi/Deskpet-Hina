import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname } from 'node:path'
import { safeStorage } from 'electron'

export interface SecretStorage {
  isAsyncEncryptionAvailable(): Promise<boolean>
  encryptStringAsync(value: string): Promise<Buffer>
  decryptStringAsync(value: Buffer): Promise<{
    result: string
    shouldReEncrypt: boolean
  }>
}

interface StoredKey {
  schemaVersion: 1 | 2
  ciphertext: string
}

export class DeepSeekKeyStore {
  constructor(
    private readonly filePath: string,
    private readonly secretStorage: SecretStorage = safeStorage,
  ) {}

  isEncryptionAvailable(): Promise<boolean> {
    return this.secretStorage.isAsyncEncryptionAvailable()
  }

  async hasKey(): Promise<boolean> {
    return (await this.loadKey()) !== null
  }

  async saveKey(key: string): Promise<void> {
    const normalized = key.trim()
    if (normalized.length < 20) {
      throw new Error('DeepSeek API Key 格式无效。')
    }
    if (!(await this.isEncryptionAvailable())) {
      throw new Error('macOS 安全存储当前不可用，无法保存 DeepSeek API Key。')
    }
    await this.writeEncryptedKey(normalized)
  }

  async loadKey(): Promise<string | null> {
    if (!existsSync(this.filePath) || !(await this.isEncryptionAvailable())) {
      return null
    }
    try {
      const payload = JSON.parse(readFileSync(this.filePath, 'utf8')) as Partial<StoredKey>
      if (
        (payload.schemaVersion !== 1 && payload.schemaVersion !== 2) ||
        typeof payload.ciphertext !== 'string'
      ) {
        return null
      }
      const decrypted = await this.secretStorage.decryptStringAsync(
        Buffer.from(payload.ciphertext, 'base64'),
      )
      const key = decrypted.result.trim()
      if (key.length < 20) {
        return null
      }
      if (payload.schemaVersion === 1 || decrypted.shouldReEncrypt) {
        await this.writeEncryptedKey(key)
      }
      return key
    } catch {
      return null
    }
  }

  deleteKey(): void {
    rmSync(this.filePath, { force: true })
  }

  private async writeEncryptedKey(key: string): Promise<void> {
    const encrypted = await this.secretStorage.encryptStringAsync(key)
    const payload: StoredKey = {
      schemaVersion: 2,
      ciphertext: encrypted.toString('base64'),
    }
    mkdirSync(dirname(this.filePath), { recursive: true })
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`
    writeFileSync(temporaryPath, `${JSON.stringify(payload)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    })
    renameSync(temporaryPath, this.filePath)
    chmodSync(this.filePath, 0o600)
  }
}
