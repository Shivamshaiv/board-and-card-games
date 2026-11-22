import { analyzeGame } from './analysis'
import type { AdvisorReply, AdvisorRequest } from './protocol'

self.onmessage = ({ data }: MessageEvent<AdvisorRequest>) => {
  let reply: AdvisorReply
  try {
    reply = { type: 'result', key: data.key, result: analyzeGame(data.view) }
  } catch {
    reply = { type: 'error', key: data.key }
  }
  self.postMessage(reply)
}
