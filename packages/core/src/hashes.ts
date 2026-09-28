import { createHash } from 'node:crypto'

export async function sha256(data: Uint8Array): Promise<string> {
  return createHash('sha256').update(data).digest('hex')
}
