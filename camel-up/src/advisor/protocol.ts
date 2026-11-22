import type { GameView } from '../engine'
import type { AdvisorResult } from './analysis'

export interface AdvisorRequest {
  key: string
  view: GameView
}
export type AdvisorReply =
  | { key: string; type: 'result'; result: AdvisorResult }
  | { key: string; type: 'error' }
