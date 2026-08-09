# Tank Pong Simulator

A browser-based reverse-Pong tank duel. Each tank stays on its own half of the arena, but projectiles cross the center line. The player aims with the mouse and moves with WASD/Arrow Keys while the AI focuses on evading incoming fire and returning fire.

## Match rules

- Best of 5: first to 3 round wins takes the match.
- Each tank has 3 HP per round.
- A round win is awarded only when the opposing tank is destroyed.
- The destroyed tank explodes before the next round can begin.
- Ammo is unlimited; firing is controlled by cooldowns.

## Controls

- **WASD / Arrow Keys:** Move
- **Mouse:** Aim turret
- **Left Click:** Fire
- **P:** Pause / resume

## Difficulty

- **Easy:** Later threat detection, slower movement and fire, more dodge mistakes.
- **Medium:** Balanced evasion, movement, and aim.
- **Hard:** Earlier threat detection, faster movement and fire, very few dodge mistakes.

## Power-ups

Power-ups spawn in mirrored pairs so both halves receive the same opportunity.

- **Speed:** +35% movement speed for 6 seconds.
- **Rapid Fire:** 45% shorter firing cooldown for 6 seconds.
- **Shield:** Blocks the next incoming hit.

## Visual design

- Black battlefield.
- Green player tank and magenta AI tank.
- Cyan arena border and 70%-transparent cyan center divider.
- Health, score, instructions, and other text stay outside the battlefield.
