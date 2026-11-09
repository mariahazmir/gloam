---
inclusion: always
---

# Gloam: Product Rules

## What Gloam is
Gloam is a haunted-map walking app for people walking at night. It estimates which streets are likely well lit, shows how sure it is, and plans routes that trade distance against "dread". It works in any city and ships as small city packs: Kuala Lumpur (the case study where lighting records are missing), London, and one US city. It works where lighting records don't exist by estimating from other map data (road class, bus stops, food places, shops, building density, land use), and users can correct wrong estimates.

## Who it's for
People who walk alone at night and feel uneasy about unfamiliar or poorly lit streets, especially where official lighting data is missing.

## Honesty rules (never break these)
- **Never claim safety.** Gloam tells people what is likely lit and busy. It cannot tell them a route is safe.
- **Banned words in any UI text, docs, or comments that could reach users:** "safe route", "safest", "guaranteed", "secure", "dangerous area", "bad neighborhood".
- **Use instead:** "likely well lit", "likely dark", "better lit", "estimated", "confirmed by N people", "unknown".
- Inferred results are always labeled as estimates and shown with confidence.
- Sample or seeded data is always labeled "sample data" in the UI.
- **No fixed probability cut-offs.** The model's probabilities are relative scores (biased low, not calibrated). Never call a street lit or dark because it crosses 0.5. Use rank within the city ("brighter than most streets here", "darker than most streets here").
- Every screen that shows a route includes the disclaimer below.

**Disclaimer text:** "Gloam estimates which streets are likely well lit from map data. Estimates can be wrong, and Gloam can't tell you whether a route is safe. Trust your surroundings."

## Privacy rules
- No accounts and no sign-in.
- Start points, end points and routes stay on the device. Never send coordinates of a route request over the network.
- User corrections store only the street segment and the report type, never a person, device, or location trail.
- No crime data. Don't rate people, neighborhoods or areas as "dangerous". Rate conditions only ("poorly lit", "felt isolated").

## Visual language
- Confirmed lit: steady glow. Inferred: flicker (faster or more irregular when confidence is lower). Likely dark: fog. Chosen route: a lantern path.
- A heartbeat line along the route shows dread level.
- Always provide a reduced-effects option (no flicker, no animation) for accessibility.

## Voice
Calm, a little eerie, never alarming. Spooky in the design, honest in the words.