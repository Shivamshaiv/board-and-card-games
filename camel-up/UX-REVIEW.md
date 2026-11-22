# Camel Up usability review

Three agents independently exercised the game in Chrome using disposable local tables. They reviewed the existing build, challenged the redesign, and repeated problem tasks after fixes. The phone checks used touch-emulated viewports, including 320 × 568 and 390 × 844. The findings describe observed interactions and measured audio output.

| Review | What the reviewer observed | What changed and how it was checked |
| --- | --- | --- |
| First-time player | A new player had to scroll past setup to start. A ticket marked “5 EP” looked unaffordable with three starting coins. The turn panel suggested taking a ticket but offered no ticket button. | The title gives the win condition. Setup puts the playable defaults and Start first. The turn panel offers Roll pyramid and Take a ticket. The tray explains that tickets are free to take and shows their payout. The reviewer started default and customized solo games, took a free ticket, and verified the unchanged balance and increased holdings. LAN host, join, and start also passed. |
| Visibility and touch | On a 320 px phone the ticket tray started at y=635, beyond the first screen. Frequent controls were 28–34 px high. A crowded ranking clipped the last camel on a laptop. Striped tents and hard shadows intersected the silhouettes of stacked camels. | The ribbon shows the leg, roll progress, and leader; tapping the leader shows all five places. The tray shows one deck at a time. Common turn buttons are at least 44 px high on touch. The scenery has softer contrast, clear space plaques, and a stack count for four or more camels. The reviewer inspected a seven-camel stack and selected a legal space in both 2D and 3D. |
| Scrolling and sound | A swipe on the hint backdrop moved the board behind it by 74 px. A short laptop window exposed an eight-seat roster through a 45 px internal scrolling area. The old sound consisted of wind and short taps, with no musical pulse. | The table scrolls as a page, with a sticky return to the race on phones. Player details open on demand. Mobile dialogs contain swipes and restore scroll and focus. The original opt-in score offers 96, 120, and 144 BPM with independent music and effects levels. The reviewer measured all three tempos and verified that hidden tabs and mute stop scheduling notes. |

## Problems caught on the second pass

- **The ticket shortcut could look inert.** If the tray was already on screen, moving focus to the first card gave little visible feedback. It now highlights the entire group and says **Choose a camel**.
- **Finish confirmation competed with other actions.** Opening a finish card now closes Other moves and puts the turn station into finish selection until the player confirms or cancels. The pile is brought into view. On both tested phone widths, Cancel and Confirm returned keyboard focus to a visible control.
- **Spectator selection hid legal spaces.** The board now scrolls below the sticky ribbon before the player picks a space. The prompt explains the movement direction and the one-coin landing reward.
- **Small-screen labels lost information.** The narrow masthead keeps the game name and Rules on one line. The wallet shows tickets held, and each available card shows how many remain. The 320 px header’s sound and fullscreen controls were both measured at 44 × 44 px.

At 320 × 568, the final Start button was visible at y=272–316. A direct tap on **Back to race** restored the board below the sticky ribbon. The two-stage finish bet intentionally requires a card, a pile, and explicit confirmation.

An independent analysis of the captured 5.7-second mix found a 96 BPM pulse, a peak of −4.7 dBFS, and zero clipped samples. Audio verification used waveform measurements and the scheduled score. Listening comfort over a full game remains a matter for human playtesting.

## Reproduce the checks

After `npm run build`, run `npm run qa:flows` for first-turn and LAN flows, `npm run qa:advisor` for hints and board targeting, and `npm run qa:sound` for audio, scroll containment, and keyboard focus. `npm run qa:browser` checks the physical board and cards during an eight-seat race. These commands use temporary rooms.

[Desktop table](./previews/turn-table.webp) · [Phone table](./previews/phone-table.webp) · [Board visibility comparison, earlier view on the left](./previews/board-visibility.webp) · [96 BPM music and roll](./previews/table-music.wav)
