/** Original quick reference for the English second-edition rules. */
export const RULEBOOK_URL =
  'https://cdn.svc.asmodee.net/production-asmodeeca/uploads/2023/08/EN-Camel-Up-2-0-Rules.pdf'
export const REPRINT_URL =
  'https://www.lookout-spiele.de/upload/en_camelup.html_CamelUp_PZE30070_Rules_EN_WEB_240305.pdf'
export const COMPONENTS_URL = 'https://www.asmodee.ca/en/product/camel-up/'
export const TUTORIAL_URL = 'https://www.youtube.com/watch?v=5oX4Q7AcpxQ'
export type PrintedPage = 1 | 2 | 3 | 4 | 5 | 6
// Both publisher downloads put the cover (printed page 1) at the end of the file.
export const rulePage = (page: PrintedPage) => RULEBOOK_URL + '#page=' + (page === 1 ? 6 : page - 1)
export const RULES: { title: string; body: string; pages: PrintedPage[]; seconds: number }[] = [
  {
    title: 'Win the most coins',
    pages: [3, 5],
    seconds: 782,
    body: 'You are a spectator. Back any racing camel and finish with the most Egyptian Pounds (EP). Players tied for the most money share the win.',
  },
  {
    title: 'Your first turn',
    pages: [3, 6],
    seconds: 231,
    body: 'Choose one action. Take a free color ticket for the camel you think will lead this leg, or roll the pyramid to earn a 1-coin ticket and move a camel. A leg ends after five rolls unless the race ends sooner. You can also place a spectator tile or play a secret finish card.',
  },
  {
    title: 'Take a leg ticket',
    pages: [2, 3, 5],
    seconds: 273,
    body: 'Take the top ticket of one racing color for free. If that camel leads at leg scoring, the bank pays the amount on your ticket in Egyptian pounds (EP). Each color has tickets worth 5, 3, 2, and 2 EP in order. Second pays 1 EP. Any lower place costs 1 EP. You may take several tickets of the same color.',
  },
  {
    title: 'Roll the pyramid',
    pages: [4, 5],
    seconds: 421,
    body: 'Take a pyramid ticket worth 1 EP at leg scoring and release one of the remaining dice. Its number moves a camel one, two, or three spaces. After the fifth die moves a camel, score the leg. One of the six dice stays inside the pyramid.',
  },
  {
    title: 'Read a stack',
    pages: [3, 4],
    seconds: 441,
    body: 'The moving camel takes every camel above it. They keep their order and land on top of the stack at their destination. Among racers on the same space, the higher racer is ahead. Black and white never count in the standings.',
  },
  {
    title: 'Watch the grey die',
    pages: [4],
    seconds: 441,
    body: 'The grey die usually moves the black or white camel matching its number’s color. If exactly one carries a racer, that carrier moves. If the two sit directly atop one another, the upper one moves. Their normal direction is counterclockwise.',
  },
  {
    title: 'Place your spectator',
    pages: [4],
    seconds: 402,
    body: 'Choose cheer or boo on an empty space from 2 to 16. With either face up, every pair of tiles must have at least one track space between them. A tile on 8 blocks 7 and 9 for other tiles. To move your own tile, lift it, choose a different legal space and choose its face. You cannot turn it over in place.',
  },
  {
    title: 'Cheering and booing',
    pages: [4, 5],
    seconds: 510,
    body: 'Whenever a moving unit lands on your tile, collect 1 EP immediately. A cheer moves the unit one more space in its direction and onto any waiting camels. A boo moves it one space back and underneath any waiting camels. The tile stays for further landings until you move it or the leg ends.',
  },
  {
    title: 'Bet on the whole race',
    pages: [5],
    seconds: 300,
    body: 'Choose either the overall winner pile or the overall loser pile. Play one matching color card from your hand face down. Placed cards stay committed. You have one card of each color for the entire race.',
  },
  {
    title: 'Partner at six or more',
    pages: [6],
    seconds: 333,
    body: 'Use your turn to pair with another available player. The chosen player joins immediately. During leg scoring each partner may copy the reward of one of the other’s leg or pyramid tickets, or decline. Both keep their own rewards. Everyone becomes available again for the next leg.',
  },
  {
    title: 'Settle a leg',
    pages: [5, 6],
    seconds: 576,
    body: 'Add the results of your tickets and any partner copy, then adjust your coins. You cannot owe money. Return leg and pyramid tickets, reclaim spectator tiles, and refill the pyramid. The player after the person who drew the fifth die starts the new leg.',
  },
  {
    title: 'Crossing the line',
    pages: [5],
    seconds: 709,
    body: 'The race stops as soon as any unit crosses the line in either direction. Settle the current leg once, even when dice remain. Racers carried across backward are at the rear. Within a stack the upper racer still ranks higher.',
  },
  {
    title: 'Reveal finish bets',
    pages: [5],
    seconds: 723,
    body: 'Resolve the winner pile first, then the loser pile. Reveal the oldest card first in each pile. Correct predictions earn 8, 5, 3, 2, then 1 EP for every later correct card. Each incorrect card costs 1 EP and leaves the next reward available. Reveal and pay each card before moving to the next.',
  },
  {
    title: 'Count your coins',
    pages: [3, 5],
    seconds: 576,
    body: 'One coin of value 5 is worth five singles. You can see the denominations in an opponent’s piles. Your own purse shows an exact total. The bank handles change, and a loss can take a purse down to zero. At the finish everyone counts their total.',
  },
  {
    title: 'Set the table',
    pages: [1, 2],
    seconds: 88,
    body: 'Play with 3–8 seats. Everyone starts with 3 EP and one finish card for each racing color. Each racer starts on space 1, 2, or 3 according to its die. The black and white camels each start on space 14, 15, or 16, facing the other way. The youngest player opens. Play continues clockwise.',
  },
]

export const COMPONENTS: { quantity: number; name: string }[] = [
  { quantity: 1, name: 'sixteen-space race board' },
  { quantity: 20, name: 'leg betting tickets' },
  { quantity: 5, name: 'pyramid tickets' },
  { quantity: 40, name: 'finish cards' },
  { quantity: 8, name: 'partnership cards' },
  { quantity: 8, name: 'double-sided spectator tiles' },
  { quantity: 5, name: 'racing camels' },
  { quantity: 5, name: 'matching racing dice' },
  { quantity: 2, name: 'crazy camels' },
  { quantity: 1, name: 'grey die' },
  { quantity: 1, name: 'dice pyramid' },
  { quantity: 1, name: 'starting-player marker' },
  { quantity: 50, name: 'one-pound coins' },
  { quantity: 30, name: 'five-pound coins' },
]
