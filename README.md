# pharmacist-battle-server

The authoritative multiplayer server for 약사대전 (Node 22 + `ws`). `npm test` runs the rule, map, terrain and real-socket synchronization tests.

## World size (single source: `terrain.mjs` → `WORLD`)

| | Before | After |
|---|---|---|
| World | 3200 × 1800 | **6400 × 3600** |
| Terrain | Height field: 801 columns, one height per column | **2D bit mask: 1600 × 900 cells, 4 units per cell** |

Character sizes, hit radii, explosion radii and projectile physics are unchanged in world units. The map doubles in size, and characters stay the same size on screen when the camera scale stays the same. Map profiles are authored in a 1600 × 900 space and scaled by `WORLD.width/1600` and `WORLD.height/900`. Every snapshot carries `world:{width,height,cell,columns,rows}`. Clients must read the world bounds from it and must not hardcode them.

## Destructible foreground

- `TerrainMask` is the single source for rendering, missile collision, character support and movement, so the visible foreground and the collision shape always match.
- An explosion clears a disc of radius `radius × 0.8` (`lastShot.craterRadius`). The server then flood-fills the solid cells that border the carved area. A fragment that does not touch the bottom row and has fewer than `WORLD.islandMaxCells` cells (about 120 × 120 units) is removed. Large or anchored terrain, including undercut cliffs, is never cut vertically.
- Missiles sweep each frame in ≤1-unit sub-steps against the mask and the characters, then bisect to the exact contact point. `lastShot.paths[i].impact` equals the last path point. Clients must center the explosion there.
- Volley weapons are traced in impact order against a scratch copy of the mask. A later shot continues into the crater an earlier shot opened, and impacts resolve in that same order.
- After each impact every character is settled onto the first solid surface below it. Fall damage and void deaths work as before.

## Terrain sync protocol

Each `state` message carries `terrainVersion`. Per session, the server sends:

- `terrainMask: {v,x,y,w,h,runs}`: the full mask. It is sent on first join, on reconnect, and when a new map starts.
- `terrainPatches: [{v,x,y,w,h,runs}, …]`: only the cell rects changed since the version the client holds. The last 64 patches are kept; a client that falls further behind gets a full mask instead.

`runs` is row-major (y upward, then x) run-length encoding over the rect. Runs alternate empty and solid and start with empty, so the first run may be 0. Apply patches in `v` order. After applying, a client should re-upload only the texture region `x..x+w, y..y+h` (in cells).

`terrain` (801 surface heights) and `baseTerrain` are still sent for older clients. New clients should ignore them.
