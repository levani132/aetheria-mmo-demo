# Aetheria

A multiplayer 3D MMORPG demo built in a single shot for the web. Next.js + Socket.io + Three.js + (optional) MongoDB.

## What's in the box

- **Two classes × two genders** — Warrior (steel) and Mage (arcane), each with class-locked weapons (swords vs. staves), class-flavored armor, and distinct combat feedback (sword swing arc vs. spell projectile).
- **Account-based login** — username + passphrase. New username creates a fresh account on first login (which is when you pick class/gender). Existing usernames must enter the correct password. Passwords are PBKDF2-hashed with a per-account salt.
- **A small walled town** — fountain, eight buildings ringing a paved plaza, torches that flicker, a stone wall with two gates.
- **A surrounding forest** — ~220 procedurally placed pine trees, scattered boulders, and five mob types that ramp from level 2 wolves to level 15 trolls.
- **Equipment system** — 18 items across weapon / armor / helmet / ring slots, three tiers, with stat tooltips, class restrictions, and visible mesh changes when equipped.
- **Shop** — only accessible inside the town (safe zone). Filters by your class. Tier-coloured rows.
- **Leveling 1–20** — XP curve, stat growth per class, full HP/MP restore on level up with a visible burst FX.
- **PvP zones** — inside the wall ring is safe. Outside is open. The zone label switches and pulses red.
- **Multiplayer** — see other players move, attack, take damage; chat overlay with `Enter`. Server runs at 15Hz with smooth client interpolation.
- **Persistence** — MongoDB if `MONGODB_URI` is set, else falls back to in-memory store automatically (no setup required to play).

## Run it

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

To test multiplayer, open the page in two different browser windows (or one normal + one private) and pick different usernames. Both characters will appear in the same world.

## Optional: MongoDB

The game works fully without a database. To enable persistence between server restarts:

```bash
cp .env.example .env
# uncomment the MONGODB_URI line and point it at your Mongo
npm run dev
```

If the connection fails, the server logs a warning and silently falls back to memory storage.

## Controls

| Action | Input |
|---|---|
| Move | `W A S D` |
| Select target / move-to-point | Left click |
| Camera orbit | Right-click drag |
| Camera zoom | Mouse wheel |
| Inventory | `I` |
| Shop (in town) | `B` |
| Chat | `Enter` |
| Close panels | `Esc` |

## Honest scope notes

This was built in one go so a few things are foundation rather than polish:

- Graphics are **stylized procedural** — no GLTF/FBX assets are downloaded; everything is generated from primitives + canvas textures + lighting + fog. Realistic-ish, not Unreal-ish. The trade is that it loads instantly with zero asset pipeline.
- Combat is **auto-attack only** — click a target, walk into range, the swing/projectile fires on a 700 ms cooldown. No skills/spells beyond the weapon attack. No animation rig — limbs swing via simple joint rotations.
- Mob density is light: ~24 mobs total in the forest. Plenty for a multiplayer demo, not for a long grind.
- No quests, no NPCs with dialog, no ambient audio. The shop is a single merchant accessible from anywhere in town.
- "20 levels" means the leveling math, stat curves, and tier-3 items are all wired up to scale that high. The content (mobs, shops) only really fills levels 1–10 in any depth.

## Architecture sketch

```
server.js                      ← custom Next.js HTTP server + Socket.io
lib/
  db.js                        ← Mongoose connect + memory fallback
  models.js                    ← Player schema + store adapter
  gamedata.js                  ← items, mobs, world consts, level curve
  serverstate.js               ← authoritative state, mob AI, combat resolution
  three/
    world.js                   ← sky shader, ground, city, forest, lighting
    characters.js              ← procedural humanoid + mob meshes + animation
    effects.js                 ← damage popups, sparks, projectiles, FX
pages/
  index.js                     ← character select ↔ game switch
components/
  CharacterSelect.js           ← title screen
  Game.js                      ← Three.js mount, input, networking glue
  HUD.js, Inventory.js, Shop.js, Chat.js
styles/globals.css             ← the entire dark-fantasy theme
```

The server is authoritative. The client sends `move` (10 Hz) and `attack` intents; the server validates, runs combat math and mob AI, and broadcasts a `snapshot` of all players + mobs at 15 Hz. Self vitals (HP/MP/XP/gold) come down on a private `vitals` channel each tick.

## Known limitations / next steps

- Item drops from mobs (currently mobs drop only gold + XP)
- Skills and class abilities (currently auto-attack only)
- Animation rig with proper IK (currently joint-rotation walk cycles)
- More mob types and forest layouts per level band
- Multiple characters per account (currently one character per account)

---

Built as a Claude vibe-coding demo. Have fun.
