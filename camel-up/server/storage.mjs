import { mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'

const sharingErrors = new Set(['EPERM', 'EACCES', 'EBUSY'])
const retryDelays = [15, 30, 60, 120, 240, 320]

/** On Windows another reader can briefly hold the destination without delete sharing.
 * Retry the same atomic replacement, without replaying the turn or touching the old save. */
export async function replaceSnapshot(
  temp,
  target,
  renameFile = rename,
  platform = process.platform,
) {
  for (let attempt = 0; ; attempt++) {
    try {
      await renameFile(temp, target)
      return
    } catch (error) {
      if (platform !== 'win32' || !sharingErrors.has(error.code) || attempt >= retryDelays.length)
        throw error
      await delay(retryDelays[attempt])
    }
  }
}

export async function openStorage(directory) {
  await mkdir(directory, { recursive: true })
  const rooms = new Map()
  for (const name of await readdir(directory)) {
    if (!/^[A-Z2-9]{6}\.json$/.test(name)) continue
    try {
      const room = JSON.parse(await readFile(join(directory, name), 'utf8'))
      if (room.version !== 1 || name !== room.code + '.json' || !Array.isArray(room.seats)) {
        throw new Error('Unexpected save format')
      }
      rooms.set(room.code, room)
    } catch (error) {
      console.warn('Could not read saved room', name, error.message)
    }
  }
  return {
    rooms,
    async save(room) {
      const target = join(directory, room.code + '.json')
      const temporary = target + '.' + randomUUID() + '.tmp'
      try {
        // Keep the last acknowledged turn intact if the host closes during a write.
        await writeFile(temporary, JSON.stringify(room), { mode: 0o600, flush: true })
        await replaceSnapshot(temporary, target)
      } finally {
        await unlink(temporary).catch(() => {})
      }
      rooms.set(room.code, room)
    },
  }
}
