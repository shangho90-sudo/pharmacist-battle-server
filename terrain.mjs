// Server-authoritative destructible terrain.
//
// The foreground is a 2D bit mask of square cells (WORLD.cell world units). Unlike the
// former per-column height field, the mask can hold circular holes, overhangs and
// undercut cliffs. Rendering, missile collision and character support all read the same
// mask, so what players see is exactly what blocks them.
//
// Coordinates: x grows right, y grows up, y=0 is the bottom of the world.
// Cell (cx,cy) covers [cx*cell,(cx+1)*cell) x [cy*cell,(cy+1)*cell).

export const WORLD = Object.freeze({
  // Before this change the world was 3200x1800. Both axes are doubled.
  width: 6400,
  height: 3600,
  cell: 4,              // terrain mask resolution in world units
  legacyColumns: 800,   // samples-1 of the legacy `terrain` height array kept for old clients
  profileWidth: 1600,   // authoring space of MAP_PROFILES
  profileHeight: 900,
  islandMaxCells: 900,  // floating fragments smaller than this (about 120x120 units) are removed
  patchHistory: 64      // terrain patches kept for incremental client sync
});
export const COLS = WORLD.width / WORLD.cell;
export const ROWS = WORLD.height / WORLD.cell;
export const LEGACY_STEP = WORLD.width / WORLD.legacyColumns;

export class TerrainMask {
  constructor(bits = new Uint8Array(COLS * ROWS)) { this.bits = bits; }
  static fromHeights(heightAt) {
    const m = new TerrainMask();
    for (let cx = 0; cx < COLS; cx++) {
      const h = heightAt((cx + .5) * WORLD.cell);
      const top = Math.max(0, Math.min(ROWS, Math.round(h / WORLD.cell)));
      for (let cy = 0; cy < top; cy++) m.bits[cy * COLS + cx] = 1;
    }
    return m;
  }
  clone() { return new TerrainMask(this.bits.slice()); }
  cell(cx, cy) { return cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS && this.bits[cy * COLS + cx] === 1; }
  solid(x, y) { return this.cell(Math.floor(x / WORLD.cell), Math.floor(y / WORLD.cell)); }
  // Top of the first solid run at or below y. Returns -1 when nothing supports x.
  surfaceBelow(x, y = WORLD.height) {
    const cx = Math.floor(x / WORLD.cell);
    if (cx < 0 || cx >= COLS) return -1;
    let cy = Math.min(ROWS - 1, Math.floor(y / WORLD.cell));
    if (y >= WORLD.height) cy = ROWS - 1;
    // If y is inside solid material (it should not be for a standing player), climb to its top.
    if (cy >= 0 && this.bits[cy * COLS + cx]) { while (cy + 1 < ROWS && this.bits[(cy + 1) * COLS + cx]) cy++; return (cy + 1) * WORLD.cell; }
    for (; cy >= 0; cy--) if (this.bits[cy * COLS + cx]) return (cy + 1) * WORLD.cell;
    return -1;
  }
  // Clears a disc and the small unsupported fragments it leaves. Returns the dirty cell rect.
  carve(x, y, r) {
    const c = WORLD.cell;
    const x0 = Math.max(0, Math.floor((x - r) / c)), x1 = Math.min(COLS - 1, Math.floor((x + r) / c));
    const y0 = Math.max(0, Math.floor((y - r) / c)), y1 = Math.min(ROWS - 1, Math.floor((y + r) / c));
    if (x0 > x1 || y0 > y1) return null;
    const rect = { x0, y0, x1, y1 }, r2 = r * r;
    let removed = 0;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const dx = (cx + .5) * c - x, dy = (cy + .5) * c - y, i = cy * COLS + cx;
      if (dx * dx + dy * dy <= r2 && this.bits[i]) { this.bits[i] = 0; removed++; }
    }
    if (!removed) return null;
    this.removeIslands(rect);
    return rect;
  }
  // Flood fill from every solid cell bordering the carved rect. A component survives when it
  // touches the bottom row (anchored) or is large; otherwise it is a small floating chunk.
  removeIslands(rect) {
    const keep = new Set(), seeds = [];
    const ex0 = Math.max(0, rect.x0 - 1), ex1 = Math.min(COLS - 1, rect.x1 + 1);
    const ey0 = Math.max(0, rect.y0 - 1), ey1 = Math.min(ROWS - 1, rect.y1 + 1);
    for (let cy = ey0; cy <= ey1; cy++) for (let cx = ex0; cx <= ex1; cx++) if (this.bits[cy * COLS + cx]) seeds.push(cy * COLS + cx);
    const done = new Set();
    for (const seed of seeds) {
      if (done.has(seed) || keep.has(seed)) continue;
      const comp = [seed], seen = new Set([seed]);
      let anchored = false;
      for (let k = 0; k < comp.length; k++) {
        const i = comp[k], cx = i % COLS, cy = (i - cx) / COLS;
        if (cy === 0 || keep.has(i) || comp.length > WORLD.islandMaxCells) { anchored = true; break; }
        const n = [cx > 0 ? i - 1 : -1, cx < COLS - 1 ? i + 1 : -1, i - COLS, cy < ROWS - 1 ? i + COLS : -1];
        for (const j of n) if (j >= 0 && this.bits[j] && !seen.has(j)) { seen.add(j); comp.push(j); }
      }
      if (anchored) { for (const i of seen) keep.add(i); continue; }
      for (const i of comp) {
        this.bits[i] = 0; done.add(i);
        const cx = i % COLS, cy = (i - cx) / COLS;
        rect.x0 = Math.min(rect.x0, cx); rect.x1 = Math.max(rect.x1, cx);
        rect.y0 = Math.min(rect.y0, cy); rect.y1 = Math.max(rect.y1, cy);
      }
    }
  }
  // Row-major run-length encoding of a cell rect: alternating runs starting with empty cells.
  encode(rect = { x0: 0, y0: 0, x1: COLS - 1, y1: ROWS - 1 }) {
    const runs = []; let value = 0, run = 0;
    for (let cy = rect.y0; cy <= rect.y1; cy++) for (let cx = rect.x0; cx <= rect.x1; cx++) {
      const b = this.bits[cy * COLS + cx];
      if (b === value) run++; else { runs.push(run); value = b; run = 1; }
    }
    runs.push(run);
    return { x: rect.x0, y: rect.y0, w: rect.x1 - rect.x0 + 1, h: rect.y1 - rect.y0 + 1, runs };
  }
  apply({ x, y, w, h, runs }) {
    let value = 0, k = 0, left = runs[0];
    for (let cy = y; cy < y + h; cy++) for (let cx = x; cx < x + w; cx++) {
      while (left === 0) { value ^= 1; left = runs[++k]; }
      this.bits[cy * COLS + cx] = value; left--;
    }
  }
  legacyHeights() {
    return Array.from({ length: WORLD.legacyColumns + 1 }, (_, i) => Math.max(0, this.surfaceBelow(Math.min(WORLD.width - .001, i * LEGACY_STEP))));
  }
}
