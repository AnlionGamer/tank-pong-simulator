# Tank Pong Simulator

A browser-based reverse-Pong tank duel. Each tank stays on its own half of the arena, projectiles cross the center divider, and the first tank to win three rounds takes the best-of-five match.

## Current game flow

Opening the game starts at a main menu instead of loading every control and statistic onto one page.

- **Single Player** — choose Easy, Medium, or Hard.
- **Multiplayer** — reserved for the upcoming private-room networking build.
- **Options** — local appearance, sound, effects, HUD size, and fullscreen controls.
- **How to Play** — rules, PC/phone controls, and illustrated power-up explanations.

The match screen is intentionally minimal so the arena can use nearly the entire available display.

## Match rules

- Best of 5: first to 3 round wins takes the match.
- Each tank has 3 HP per round.
- A round win is awarded only when the opposing tank is destroyed.
- The destroyed tank explodes before the next round can begin.
- Every round begins with **3 → 2 → 1 → GO** overlaid directly on the already-visible arena. Gameplay remains frozen until GO.
- Ammo is unlimited; firing is controlled by cooldowns.

## PC controls

- **WASD / Arrow Keys:** Move.
- **Mouse:** Aim turret.
- **Hold Left Mouse:** Keep firing whenever the cooldown is ready.
- **P:** Pause single-player only.

## Phone controls — current test build

Phone matches are designed for landscape orientation and use low-obstruction floating sticks that appear under the player's thumbs only while touched.

- **Left thumb:** Touch and drag in the lower-left half of the arena to move.
- **Right thumb:** Touch and drag in the lower-right half of the arena to aim.
- **Right aim stick engaged:** The tank automatically fires whenever its normal cooldown is ready.
- **Release the right aim stick:** Firing stops.
- The controls are phone-only and are not displayed for normal PC mouse/keyboard play.
- Portrait play shows a rotate-to-landscape prompt during a match.

## Difficulty

- **Easy:** Later threat detection, slower movement and fire, more dodge mistakes.
- **Medium:** Balanced evasion, movement, and aim.
- **Hard:** Earlier threat detection, faster movement and fire, very few dodge mistakes.

## Power-ups

Power-ups spawn in mirrored pairs so both halves receive the same opportunity. They work without adding status text to the combat HUD.

- **Speed:** +35% movement speed for 6 seconds.
- **Rapid Fire:** 45% shorter firing cooldown for 6 seconds.
- **Shield:** Blocks the next incoming hit.

## Local options

The following settings are saved in the browser using local storage and are intended to remain private to each device even in multiplayer:

- Your tank color from a curated palette.
- Opponent tank color from a curated palette.
- Arena border / center-divider color from a curated palette.
- Sound effects on/off and volume.
- Full or reduced effects quality.
- Small, normal, or large HUD.
- Fullscreen toggle where supported.

## Planned multiplayer direction

- PC multiplayer pairs only with PC players.
- Phone multiplayer pairs only with phone players.
- No PC-to-phone multiplayer.
- Multiplayer has no pause function.
- Private room creation/joining and synchronized match networking are the next major development stage after the current two-phone control test.
