import type { LocalSaveRepository } from './repository'
import type { LocalSaveSnapshot } from './types'

export interface AutosaveControllerOptions {
  readonly delayMs?: number
  readonly onError?: (error: unknown) => void
}

export class AutosaveController<TGame = unknown, TNotebook = unknown, TSettings = unknown> {
  private readonly delayMs: number
  private readonly onError: (error: unknown) => void
  private timer?: ReturnType<typeof setTimeout>
  private pending?: LocalSaveSnapshot<TGame, TNotebook, TSettings>

  constructor(
    private readonly repository: LocalSaveRepository<TGame, TNotebook, TSettings>,
    options: AutosaveControllerOptions = {},
  ) {
    this.delayMs = Math.max(0, options.delayMs ?? 250)
    this.onError = options.onError ?? (() => undefined)
  }

  /** Replaces pending data, ensuring a burst of state changes writes one record. */
  schedule(snapshot: LocalSaveSnapshot<TGame, TNotebook, TSettings>): void {
    this.pending = snapshot
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.flush().catch(this.onError)
    }, this.delayMs)
  }

  async saveNow(snapshot: LocalSaveSnapshot<TGame, TNotebook, TSettings>): Promise<void> {
    this.pending = undefined
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    await this.repository.save(snapshot)
  }

  async flush(): Promise<void> {
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    const snapshot = this.pending
    this.pending = undefined
    if (snapshot) await this.repository.save(snapshot)
  }

  cancel(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
    this.pending = undefined
  }

  async dispose(options: { flush?: boolean } = { flush: true }): Promise<void> {
    if (options.flush === false) this.cancel()
    else await this.flush()
  }
}

export interface AutosaveSource<TGame, TNotebook, TSettings> {
  getSnapshot(): LocalSaveSnapshot<TGame, TNotebook, TSettings>
  subscribe(listener: () => void): () => void
}

/** Connects any store/session without making persistence depend on Zustand. */
export function bindAutosave<TGame, TNotebook, TSettings>(
  source: AutosaveSource<TGame, TNotebook, TSettings>,
  controller: AutosaveController<TGame, TNotebook, TSettings>,
): () => void {
  controller.schedule(source.getSnapshot())
  return source.subscribe(() => controller.schedule(source.getSnapshot()))
}

