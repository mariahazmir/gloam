# Gloam

*Roam the Gloam.*

**Gloam** is a haunted map for night walkers. It guesses which streets are
glowing, which are flickering, and which are swallowed by fog, then plans a
route that trades a few extra minutes for better light.

Built with Kiro for **Kiroween 2026** (Costume Contest).

**Live app:** [URL coming soon]

**Demo video:** [YouTube link coming soon]

## The problem

Most cities don't keep a public record of which streets are lit. 
So Gloam does some detective work: it reads clues from the map
(road type, bus stops, food places, shops, how packed the buildings are) and
makes an educated guess.

## What you'll see

- **Steady glow:** confirmed lit by people who walked it
- **Flicker:** a guess. The more it flickers, the less sure Gloam is
- **Fog:** likely dark, or not enough to go on
- **Lantern path:** your chosen way home

Think Gloam got a street wrong? Tap once to correct it. Enough agreeing
reports and the glow updates. Old reports fade.

## Honest by design

Gloam estimates which streets are likely well lit from map data. Estimates can
be wrong, and Gloam can't tell you whether a route is safe. Trust your
surroundings.

## Your secrets stay with you

No accounts, no sign-in. Where you start, where you're going and your route
never leave your device.

## Run it

[Setup steps coming soon]

## Built with Kiro

Specs, steering docs and hooks live in [`.kiro/`](.kiro/). The story of how
Kiro helped build this is in [`docs/kiro-log.md`](docs/kiro-log.md).

## Data credits

Map data © OpenStreetMap contributors, available under the
[ODbL](https://www.openstreetmap.org/copyright).

## License

MIT. See [LICENSE](LICENSE).
