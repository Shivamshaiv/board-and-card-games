import { parentPort, workerData } from 'node:worker_threads'
import { chooseBotAction } from '../src/bot.ts'

const { view, difficulty, seed } = workerData
parentPort.postMessage(chooseBotAction(view, difficulty, seed))
