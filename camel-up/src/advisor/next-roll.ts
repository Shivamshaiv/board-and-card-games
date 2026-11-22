import {
  rankCamels,
  simulateRoll,
  type Color,
  type Crazy,
  type Die,
  type GameView,
  type Movement,
} from '../engine'

export interface RollBranch {
  die: Die
  value: number
  ink: Crazy | null
  weight: number
  movement: Movement
  order: Color[]
}

/** Use integer weights for the six physical faces per die. Identical numbered
 * faces on a colored die share a branch. On grey, the two pip colors can differ. */
export function enumerateNextRoll(
  view: Pick<GameView, 'phase' | 'remainingDice' | 'stacks' | 'tiles'>,
) {
  const branches: RollBranch[] = []
  if (view.phase === 'playing' && view.remainingDice.length > 1) {
    for (const die of view.remainingDice) {
      const inks: (Crazy | null)[] = die === 'grey' ? ['white', 'black'] : [null]
      for (let value = 1; value <= 3; value++) {
        for (const ink of inks) {
          const movement = simulateRoll(view.stacks, view.tiles, die, value, ink ?? undefined)
          branches.push({
            die,
            value,
            ink,
            movement,
            order: rankCamels(movement.stacks),
            weight: ink === null ? 2 : 1,
          })
        }
      }
    }
  }
  const leader = rankCamels(view.stacks)[0]
  const total = branches.reduce((n, b) => n + b.weight, 0)
  const probability = (test: (b: RollBranch) => boolean) =>
    total ? branches.reduce((n, b) => n + (test(b) ? b.weight : 0), 0) / total : 0
  return {
    branches,
    total,
    leadChanges: probability((b) => b.order[0] !== leader),
    endsRace: probability((b) => b.movement.crossed),
  }
}
