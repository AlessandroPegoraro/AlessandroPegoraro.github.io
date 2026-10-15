'use strict';

// ---------------------------------------------------------------------------
// Puzzle generation
//
// Strategy: generate a random valid solution first (one piece per row/column,
// no two pieces in adjacent rows within one column of each other). Then build
// regions that are unique *by construction* rather than by generate-and-test:
// row 0 is entirely region 0; each later row's home cell starts a brand new
// region, and every other cell in that row inherits the region of the cell
// directly above it. This alone provably forces the known solution to be the
// only valid placement (see buildBaseRegions for the argument) and is pure
// O(n^2) construction — no search, no retries.
//
// That base construction looks like rigid vertical stripes on its own, and
// is deterministically skewed (region 0 always n(n+1)/2 cells, later regions
// shrinking every time down to exactly 1). Two further passes fix that:
//   - reshapeRegions: random boundary nudges, biased toward shrinking
//     oversized regions and growing undersized ones, breaking the stripes
//     into organic blobs and softening (not eliminating) the skew.
//   - enforceMinRegionSize: a guaranteed finisher that deterministically
//     rescues any region still left below the minimum size.
// Every single edit in both passes is verified to preserve connectivity and
// the unique-solution property before being kept, so correctness is never at
// risk — only shape and size distribution are being adjusted.
// ---------------------------------------------------------------------------

function shuffledRange(n) {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// One queen per row/column; consecutive rows' columns must differ by more
// than 1 (the only way two one-per-row/column pieces can be grid-adjacent).
function generateSolution(n) {
  const solution = [];
  const usedCols = new Set();

  function backtrack(row) {
    if (row === n) return true;
    const prevCol = row > 0 ? solution[row - 1] : null;

    for (const col of shuffledRange(n)) {
      if (usedCols.has(col)) continue;
      if (prevCol !== null && Math.abs(col - prevCol) <= 1) continue;

      solution.push(col);
      usedCols.add(col);
      if (backtrack(row + 1)) return true;
      solution.pop();
      usedCols.delete(col);
    }

    return false;
  }

  backtrack(0);
  return solution;
}

// Build the region partition that forces the given solution to be the only
// valid placement. The anchor row is entirely its own region; for every
// other row, the home cell (the solution's queen for that row) starts a new
// region, and every other cell inherits the region of the cell directly
// between it and the anchor (above it, for rows below the anchor; below it,
// for rows above the anchor — a mirror image of the same rule).
//
// Why this is unique: take any valid placement P and let r be the first
// non-anchor row (if any, processing outward from the anchor in each
// direction) where P disagrees with `solution`. P's column choice at row r
// must trace back (through the chain of "inherits from its anchor-ward
// neighbor") to either (a) some already-resolved row's home column, which P
// can't reuse without a column clash, since P already placed that row's
// queen there, or (b) the anchor row's region, which P already used via the
// anchor's own queen. Either way, P reusing that region at row r is a
// contradiction, so P must agree with `solution` at every non-anchor row.
// With those n-1 rows pinned to their n-1 distinct columns, only one column
// is left over for the anchor row — the one `solution` already uses there.
// So P = solution: no second placement can exist.
//
// Only the two edge rows (0 and n-1) are used as the anchor in practice: an
// interior anchor row can extend in both directions before being cut off by
// another row's home column, which empirically makes its region *larger* on
// average (tested: ~56% of the board for an edge anchor vs. ~75% for a
// middle one at n=9), the opposite of what we want. Alternating between the
// two edges keeps the anchor's size at its minimum while avoiding it always
// landing in the same place.
function buildBaseRegions(n, solution, anchorRow = 0) {
  const regionOf = Array.from({ length: n }, () => Array(n).fill(anchorRow));

  for (let row = anchorRow + 1; row < n; row++) {
    for (let col = 0; col < n; col++) {
      regionOf[row][col] = (col === solution[row]) ? row : regionOf[row - 1][col];
    }
  }
  for (let row = anchorRow - 1; row >= 0; row--) {
    for (let col = 0; col < n; col++) {
      regionOf[row][col] = (col === solution[row]) ? row : regionOf[row + 1][col];
    }
  }

  return regionOf;
}

function isRegionConnected(n, regionOf, region) {
  const cells = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (regionOf[i][j] === region) cells.push([i, j]);
    }
  }
  if (cells.length === 0) return false;

  const visited = new Set([`${cells[0][0]},${cells[0][1]}`]);
  const stack = [cells[0]];
  const DIRECTIONS = [[0, 1], [0, -1], [1, 0], [-1, 0]];

  while (stack.length) {
    const [ci, cj] = stack.pop();
    for (const [di, dj] of DIRECTIONS) {
      const ni = ci + di, nj = cj + dj;
      const key = `${ni},${nj}`;
      if (ni >= 0 && ni < n && nj >= 0 && nj < n && regionOf[ni][nj] === region && !visited.has(key)) {
        visited.add(key);
        stack.push([ni, nj]);
      }
    }
  }

  return visited.size === cells.length;
}

function regionSizes(n, regionOf) {
  const sizes = new Array(n).fill(0);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) sizes[regionOf[i][j]]++;
  return sizes;
}

// Randomly nudge individual boundary cells into a neighboring region to turn
// the base construction's rigid stripes into organic blobs. Each nudge is
// only kept if it preserves connectivity of both affected regions and the
// puzzle's unique-solution property; otherwise it's reverted immediately.
//
// The base construction is deterministically skewed (region 0 always ends up
// with n(n+1)/2 cells, later regions shrinking down to exactly 1), so nudges
// are biased toward donating from oversized regions into undersized
// neighbors. This is a soft bias, not a hard cap — it de-skews the
// guaranteed-every-time imbalance without forcing every puzzle toward
// uniform sizes; a region can still end up noticeably large by chance, same
// as any other randomized shape.
function reshapeRegions(n, regionOf, solution, sizes, attempts, minRegionSize) {
  const DIRECTIONS = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  const target = n; // n*n cells over n regions

  for (let attempt = 0; attempt < attempts; attempt++) {
    const row = Math.floor(Math.random() * n);
    const col = Math.floor(Math.random() * n);
    if (solution[row] === col) continue; // never move a home (queen) cell

    const oldRegion = regionOf[row][col];
    if (sizes[oldRegion] - 1 < minRegionSize) continue; // don't starve the donor

    const excess = sizes[oldRegion] - target;
    const donateChance = excess > 0 ? Math.min(1, (excess / target) * 2) : 0.05;
    if (Math.random() > donateChance) continue;

    // Only ever move into a region no bigger than the one giving the cell up
    // — moving a smaller region's cell into a bigger one undoes exactly the
    // imbalance this pass exists to fix, and was the root cause of cells
    // visibly oscillating back and forth between two regions (often the
    // anchor) across repeated attempts.
    const neighborRegions = [];
    for (const [di, dj] of DIRECTIONS) {
      const ni = row + di, nj = col + dj;
      if (ni < 0 || ni >= n || nj < 0 || nj >= n) continue;
      const nr = regionOf[ni][nj];
      if (nr !== oldRegion && sizes[nr] <= sizes[oldRegion]) neighborRegions.push(nr);
    }
    if (neighborRegions.length === 0) continue;

    const newRegion = neighborRegions.reduce((best, r) => (sizes[r] < sizes[best] ? r : best), neighborRegions[0]);

    regionOf[row][col] = newRegion;
    const valid = isRegionConnected(n, regionOf, oldRegion) &&
      isRegionConnected(n, regionOf, newRegion) &&
      hasUniqueSolution(n, regionOf);

    if (valid) {
      sizes[oldRegion]--;
      sizes[newRegion]++;
    } else {
      regionOf[row][col] = oldRegion;
    }
  }
}

function sameRegionDegree(n, regionOf, i, j) {
  const DIRECTIONS = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  const region = regionOf[i][j];
  let degree = 0;
  for (const [di, dj] of DIRECTIONS) {
    const ni = i + di, nj = j + dj;
    if (ni >= 0 && ni < n && nj >= 0 && nj < n && regionOf[ni][nj] === region) degree++;
  }
  return degree;
}

// reshapeRegions above only fixes *size* imbalance, which leaves a problem
// of its own: a single-cell-wide region can only safely shed cells from its
// two ends without disconnecting itself (removing a middle cell of a line
// always splits it), so size-only nudges mostly just shorten lines — they
// don't add width. Measured: regions averaged ~1.9 same-region neighbors per
// cell after reshapeRegions alone, right at the signature of a pure 1-wide
// line (interior cells of an infinite line average exactly 2).
//
// This pass specifically targets cells with at most 1 same-region neighbor
// (removing them can never disconnect their region, so almost every attempt
// succeeds instead of being wasted on a doomed interior cell) and donates
// each one to whichever neighboring region it would attach to most snugly
// (the most shared edges), which is what actually builds width instead of
// just shortening a line from its tip. Same verification as every other
// pass — every edit is checked before being kept.
function reshapeForShape(n, regionOf, solution, sizes, attempts, minRegionSize) {
  const DIRECTIONS = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  let safeCells = [];
  const refreshEvery = Math.max(1, Math.floor((n * n) / 4));

  const refreshSafeCells = () => {
    safeCells = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (solution[i] === j) continue; // never move a home (queen) cell
        if (sameRegionDegree(n, regionOf, i, j) <= 1) safeCells.push([i, j]);
      }
    }
  };
  refreshSafeCells();

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt % refreshEvery === 0) refreshSafeCells();

    let row, col;
    if (safeCells.length > 0 && Math.random() < 0.85) {
      [row, col] = safeCells[Math.floor(Math.random() * safeCells.length)];
    } else {
      row = Math.floor(Math.random() * n);
      col = Math.floor(Math.random() * n);
    }
    if (solution[row] === col) continue;

    const oldRegion = regionOf[row][col];
    if (sizes[oldRegion] - 1 < minRegionSize) continue;

    // How many shared edges each neighboring region would gain from this cell
    // (same no-bigger-region rule as reshapeRegions — see its comment)
    const snugness = new Map();
    for (const [di, dj] of DIRECTIONS) {
      const ni = row + di, nj = col + dj;
      if (ni < 0 || ni >= n || nj < 0 || nj >= n) continue;
      const nr = regionOf[ni][nj];
      if (nr !== oldRegion && sizes[nr] <= sizes[oldRegion]) snugness.set(nr, (snugness.get(nr) || 0) + 1);
    }
    if (snugness.size === 0) continue;

    let newRegion = null, bestScore = -Infinity;
    for (const [region, edges] of snugness) {
      const score = edges * 10 - sizes[region] * 0.1; // snug fit first, mild size tiebreak
      if (score > bestScore) { bestScore = score; newRegion = region; }
    }

    regionOf[row][col] = newRegion;
    const valid = isRegionConnected(n, regionOf, oldRegion) &&
      isRegionConnected(n, regionOf, newRegion) &&
      hasUniqueSolution(n, regionOf);

    if (valid) {
      sizes[oldRegion]--;
      sizes[newRegion]++;
    } else {
      regionOf[row][col] = oldRegion;
    }
  }
}

// The two passes above work on whichever region happens to be biggest, but
// since the anchor always *starts* far bigger than anything else (see
// buildBaseRegions), it usually stays the biggest even after them — they
// just don't aim at it specifically. This pass does: it repeatedly hunts for
// a currently-safe (degree <= 1) cell still in the anchor's own original
// row and tries to hand it to a neighbor, looping until no more such cells
// are safe to move or the attempt budget runs out. There's nothing
// special about the anchor mathematically once construction is done — this
// just makes sure it doesn't keep winning "biggest region" by default.
function erodeAnchorRow(n, regionOf, solution, sizes, anchorRegion, maxAttempts) {
  const DIRECTIONS = [[0, 1], [0, -1], [1, 0], [-1, 0]];

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (sizes[anchorRegion] - 1 < 2) break;

    const candidates = [];
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (regionOf[i][j] !== anchorRegion || solution[i] === j) continue;
        // degree <= 1 is the only size that's *guaranteed* safe, but some
        // degree-2 cells are safe too (e.g. one side of a 2-wide strip) —
        // trying them as well (still fully verified below) shrinks the
        // anchor further; tested degree <= 3 too and it did worse, so 2 is
        // the sweet spot.
        if (sameRegionDegree(n, regionOf, i, j) <= 2) candidates.push([i, j]);
      }
    }
    if (candidates.length === 0) break;

    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    let moved = false;
    for (const [row, col] of candidates) {
      // same no-bigger-region rule as reshapeRegions — don't undo the erosion
      // by handing a cell to a neighbor that's already bigger than the anchor
      const neighborRegions = [];
      for (const [di, dj] of DIRECTIONS) {
        const ni = row + di, nj = col + dj;
        if (ni < 0 || ni >= n || nj < 0 || nj >= n) continue;
        const nr = regionOf[ni][nj];
        if (nr !== anchorRegion && sizes[nr] <= sizes[anchorRegion]) neighborRegions.push(nr);
      }
      if (neighborRegions.length === 0) continue;
      const newRegion = neighborRegions[Math.floor(Math.random() * neighborRegions.length)];

      regionOf[row][col] = newRegion;
      const valid = isRegionConnected(n, regionOf, anchorRegion) && isRegionConnected(n, regionOf, newRegion) && hasUniqueSolution(n, regionOf);
      if (valid) {
        sizes[anchorRegion]--;
        sizes[newRegion]++;
        moved = true;
        break;
      }
      regionOf[row][col] = anchorRegion;
    }
    if (!moved) break;
  }
}

// Guaranteed finisher: for any region still under minRegionSize after the
// probabilistic pass above, deterministically exhaust every distinct
// boundary cell that could safely donate into it (verified the same way),
// rather than randomly re-sampling the same few candidates. Returns false
// if some region truly has no safe donor available, so the caller can
// regenerate the puzzle from scratch instead of leaving it undersized.
function enforceMinRegionSize(n, regionOf, solution, sizes, minRegionSize) {
  const DIRECTIONS = [[0, 1], [0, -1], [1, 0], [-1, 0]];

  for (let region = 0; region < n; region++) {
    while (sizes[region] < minRegionSize) {
      const candidates = [];
      const seen = new Set();

      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          if (regionOf[i][j] !== region) continue;
          for (const [di, dj] of DIRECTIONS) {
            const ni = i + di, nj = j + dj;
            if (ni < 0 || ni >= n || nj < 0 || nj >= n) continue;
            const nr = regionOf[ni][nj];
            const key = `${ni},${nj}`;
            if (nr !== region && solution[ni] !== nj && sizes[nr] - 1 >= minRegionSize && !seen.has(key)) {
              seen.add(key);
              candidates.push([ni, nj, nr]);
            }
          }
        }
      }

      if (candidates.length === 0) return false;

      for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      }

      let moved = false;
      for (const [ni, nj, donorRegion] of candidates) {
        regionOf[ni][nj] = region;
        const valid = isRegionConnected(n, regionOf, donorRegion) && isRegionConnected(n, regionOf, region) && hasUniqueSolution(n, regionOf);
        if (valid) {
          sizes[donorRegion]--;
          sizes[region]++;
          moved = true;
          break;
        }
        regionOf[ni][nj] = donorRegion;
      }

      if (!moved) return false;
    }
  }

  return true;
}

// Tail-only backstop: the organic pass above still leaves real variance (a
// region can land anywhere from modest to noticeably large), which is the
// point. This only steps in for the rare unlucky draw that lands above the
// cap, exhausting the oversized region's boundary cells the same verified
// way as enforceMinRegionSize, so correctness is never at risk. It is not
// meant to fire often — see generatePuzzle for why the cap is set well above
// the typical/average size rather than near it.
//
// guardLimit bounds how many cells it will try moving in total, and
// candidateLimit bounds how many boundary-cell options it tries per move
// before giving up on that move — both exist because a single verification
// (hasUniqueSolution) is a full backtracking solve, and trying every
// possible candidate against it has no natural bound otherwise. Pass
// Infinity for either to search exhaustively (used by the fallback path in
// generatePuzzle, where we already know the target is easy to reach).
function enforceMaxRegionSize(n, regionOf, solution, sizes, maxRegionSize, guardLimit = n * n, candidateLimit = Infinity) {
  const DIRECTIONS = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  let guard = 0;

  while (Math.max(...sizes) > maxRegionSize && guard < guardLimit) {
    guard++;
    let region = 0;
    for (let r = 1; r < n; r++) if (sizes[r] > sizes[region]) region = r;

    const candidates = [];
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (regionOf[i][j] !== region || solution[i] === j) continue;
        for (const [di, dj] of DIRECTIONS) {
          const ni = i + di, nj = j + dj;
          if (ni < 0 || ni >= n || nj < 0 || nj >= n) continue;
          const nr = regionOf[ni][nj];
          const key = `${i},${j}`;
          if (nr !== region && !seen.has(key)) {
            seen.add(key);
            candidates.push([i, j, nr]);
          }
        }
      }
    }
    if (candidates.length === 0) return false;

    // try boundary cells whose neighboring region is smallest first
    candidates.sort((a, b) => sizes[a[2]] - sizes[b[2]]);

    let moved = false;
    for (const [i, j, targetRegion] of candidates.slice(0, candidateLimit)) {
      regionOf[i][j] = targetRegion;
      const valid = isRegionConnected(n, regionOf, region) && isRegionConnected(n, regionOf, targetRegion) && hasUniqueSolution(n, regionOf);
      if (valid) {
        sizes[region]--;
        sizes[targetRegion]++;
        moved = true;
        break;
      }
      regionOf[i][j] = region;
    }
    if (!moved) return false;
  }

  return Math.max(...sizes) <= maxRegionSize;
}

// Backtracking solver that stops as soon as it finds a second solution.
function hasUniqueSolution(n, regionOf) {
  const colUsed = Array(n).fill(false);
  const regionUsed = Array(n).fill(false);
  const cols = [];
  let solutionCount = 0;

  function backtrack(row) {
    if (solutionCount >= 2) return;
    if (row === n) { solutionCount++; return; }

    for (let col = 0; col < n; col++) {
      if (colUsed[col]) continue;
      if (row > 0 && Math.abs(col - cols[row - 1]) <= 1) continue;

      const region = regionOf[row][col];
      if (regionUsed[region]) continue;

      colUsed[col] = true;
      regionUsed[region] = true;
      cols.push(col);

      backtrack(row + 1);

      cols.pop();
      regionUsed[region] = false;
      colUsed[col] = false;

      if (solutionCount >= 2) return;
    }
  }

  backtrack(0);
  return solutionCount === 1;
}

function tryGeneratePuzzle(n, minRegionSize, maxRegionSize, guardLimit, candidateLimit, erodeAttempts) {
  const solution = generateSolution(n);
  const anchorRow = Math.random() < 0.5 ? 0 : n - 1; // alternate edges, never the middle (see buildBaseRegions)
  const regionOf = buildBaseRegions(n, solution, anchorRow);
  const sizes = regionSizes(n, regionOf);

  reshapeRegions(n, regionOf, solution, sizes, n * n * 4, minRegionSize);
  reshapeForShape(n, regionOf, solution, sizes, n * n * 6, minRegionSize);
  if (erodeAttempts > 0) {
    erodeAnchorRow(n, regionOf, solution, sizes, anchorRow, erodeAttempts);
  }

  if (!enforceMinRegionSize(n, regionOf, solution, sizes, minRegionSize)) {
    return null; // no safe way to rescue an undersized region
  }

  if (Math.max(...sizes) > maxRegionSize &&
      !enforceMaxRegionSize(n, regionOf, solution, sizes, maxRegionSize, guardLimit, candidateLimit)) {
    return null; // couldn't safely trim the oversized region within budget
  }

  // Sanity net: should always hold given the above, kept as a safety net.
  return hasUniqueSolution(n, regionOf) ? { solution, regionOf } : null;
}

// minRegionSize: 1 allows (but doesn't force) single-cell regions — intended
// for an eventual "easy" difficulty. Everywhere else uses 2, so no region is
// ever a lone cell. There's no difficulty selector yet, so this defaults to
// the stricter floor of 2 until one exists.
//
// The biggest region's size relative to the *average* region (n*n cells over
// n regions = n) grows with n if the cap is a flat fraction of the board —
// tested: at a ~45%-of-board cap the biggest region averaged ~2.4x the size
// of an average other region at n=5, climbing to ~4.8x at n=9, which is why
// larger grids look disproportionately more dominated even at a similar
// board percentage. A cap that scales with n (TIGHT_CAP_MULTIPLIER * n)
// keeps that ratio roughly flat across sizes instead.
//
// But a tighter cap costs real time to enforce (tested: reliably fast at
// n=5-8, but highly variable at n=9 — anywhere from tens of ms to multiple
// seconds depending on the random draw, since each enforcement step is a
// full backtracking solve). So the tight cap gets a few bounded-effort
// attempts first; if none land quickly, we fall back to the looser
// board-fraction cap, which is already confirmed fast and reliable at every
// size tested. Net effect: usually the nicer, more consistent ratio: never
// the multi-second worst case.
// The construction always makes the anchor a horizontal line (top or bottom
// row) — it can never land on a column, since the whole build is row-by-row.
// Applying a random symmetry of the square (optionally transpose, optionally
// flip each axis) to the finished puzzle fixes that without touching the
// generation logic at all: any symmetry of a square maps valid placements to
// valid placements one-to-one, so "exactly one solution" carries over for
// free — no re-verification needed.
function applyRandomSymmetry(n, regionOf, solution) {
  let ro = regionOf, sol = solution.slice();

  if (Math.random() < 0.5) { // transpose: rows and columns swap roles
    const transposed = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => ro[j][i]));
    const inverted = new Array(n);
    for (let r = 0; r < n; r++) inverted[sol[r]] = r;
    ro = transposed;
    sol = inverted;
  }
  if (Math.random() < 0.5) { // mirror left-right
    ro = ro.map((row) => row.slice().reverse());
    sol = sol.map((c) => n - 1 - c);
  }
  if (Math.random() < 0.5) { // mirror top-bottom
    ro = ro.slice().reverse();
    sol = sol.slice().reverse();
  }

  return { regionOf: ro, solution: sol };
}

function generatePuzzle(n, minRegionSize = 2) {
  const TIGHT_CAP_MULTIPLIER = 3.0;
  const TIGHT_ATTEMPTS = 3;
  const LOOSE_ATTEMPTS = 10;

  const tightCap = Math.ceil(n * TIGHT_CAP_MULTIPLIER);
  const looseCap = Math.ceil(n * n * 0.45);

  let result = null;
  for (let attempt = 0; attempt < TIGHT_ATTEMPTS && !result; attempt++) {
    result = tryGeneratePuzzle(n, minRegionSize, tightCap, 5, 10, n * 3);
  }
  for (let attempt = 0; attempt < LOOSE_ATTEMPTS && !result; attempt++) {
    result = tryGeneratePuzzle(n, minRegionSize, looseCap, n * n, Infinity, 0);
  }

  if (!result) {
    throw new Error(`Could not generate a unique ${n}x${n} puzzle after ${TIGHT_ATTEMPTS + LOOSE_ATTEMPTS} attempts`);
  }

  return applyRandomSymmetry(n, result.regionOf, result.solution);
}

// ---------------------------------------------------------------------------
// Game state (placeholder rendering — circle for queen, X for a marked cell,
// green/red to debug correctness at a glance; real art comes in a later pass)
// ---------------------------------------------------------------------------

const gridSizes = [5, 6, 7, 8, 9, 10];
let currentGridSizeIndex = 0;
let gridSize = gridSizes[currentGridSizeIndex];

const EMPTY = 0;
const MARKED = 1;
const QUEEN = 2;

const REGION_COLORS = [
  '#f3a6a0', '#f7cf8e', '#ce7464', '#8a6042', '#b7e3a3',
  '#41aa64', '#a8c6e8', '#c3b2e0', '#e6a8d7', '#d0d0d0'
];

// Which color (and, independently, which plant species) each region index
// gets, reshuffled per puzzle so the anchor region isn't stuck with the same
// color every time. The two orders are shuffled separately — a species is
// always the same shape, but which color it shows up on varies puzzle to
// puzzle, same as which color the anchor region gets.
let regionColorOrder = REGION_COLORS.map((_, i) => i);
let plantOrder = REGION_COLORS.map((_, i) => i);

function shuffleIndexOrder(order) {
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
}

function shuffleRegionColors() {
  regionColorOrder = REGION_COLORS.map((_, i) => i);
  shuffleIndexOrder(regionColorOrder);
  plantOrder = REGION_COLORS.map((_, i) => i);
  shuffleIndexOrder(plantOrder);
}

function colorForRegion(region) {
  return REGION_COLORS[regionColorOrder[region % regionColorOrder.length]];
}

let regionOf = [];
let solution = [];
let cellState = [];
let score = 0;
let timerInterval = null;
let startTime = Date.now();
let isPuzzleSolved = false;
let autoMarkEnabled = true;

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function updateTimer() {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  document.getElementById('timer').textContent = formatTime(elapsed);
}

function updateScore() {
  document.getElementById('score').textContent = `Score: ${score}`;
}

function updateGridSize() {
  gridSize = gridSizes[currentGridSizeIndex];
  const gridElement = document.getElementById('grid');
  gridElement.style.gridTemplateColumns = `repeat(${gridSize}, minmax(0, 1fr))`;
  gridElement.style.gridTemplateRows = `repeat(${gridSize}, minmax(0, 1fr))`;
  document.querySelector(`input[name="grid-size"][value="${currentGridSizeIndex}"]`).checked = true;
}

function changeGridSize() {
  currentGridSizeIndex = parseInt(document.querySelector('input[name="grid-size"]:checked').value, 10);
  updateGridSize();
  startNewPuzzle();
}

function isSolved() {
  for (let row = 0; row < gridSize; row++) {
    if (cellState[row][solution[row]] !== QUEEN) return false;
  }
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      if (cellState[row][col] === QUEEN && col !== solution[row]) return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Region borders
//
// Drawn as one continuous SVG path per region rather than per-cell CSS
// borders, specifically because per-cell borders have no way to agree with
// each other at a diagonal pinch point (two cells of the same region
// touching only at one corner) — each cell's border is an independent
// rectangle, so two of them meeting at a single shared point just produce a
// gap or a crossed line there. A single traced path has one well-defined
// corner join at every vertex it passes through, pinch points included, so
// there's no seam to get wrong.
//
// The algorithm: walk each region-cell's own perimeter clockwise (top:
// left->right, right: top->bottom, bottom: right->left, left: bottom->top),
// keep only the sides that face a different region or the grid edge, then
// chain those unit edges head-to-tail into closed loops. At a pinch point,
// more than one edge can start at the same vertex; the tie is broken by
// always taking the next edge going clockwise from the reverse of the
// direction just traveled, which is the standard way to resolve that
// ambiguity for a raster region's contour. Verified against 1400+ generated
// regions (every size, many puzzles each) plus a hand-built pinch-point
// case: every loop closes, and its enclosed area always matches the
// region's actual cell count.
// ---------------------------------------------------------------------------

const BORDER_DIRECTIONS_CLOCKWISE = ['1,0', '0,1', '-1,0', '0,-1']; // E, S, W, N in y-down coords

function pointKey(p) { return p[0] + ',' + p[1]; }

function directionOf(a, b) { return [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])]; }

function clockwiseIndex(dir) { return BORDER_DIRECTIONS_CLOCKWISE.indexOf(dir[0] + ',' + dir[1]); }

function collectRegionBoundaryEdges(n, region) {
  const edges = [];
  const isOutside = (r, c) => r < 0 || r >= n || c < 0 || c >= n || regionOf[r][c] !== region;

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (regionOf[r][c] !== region) continue;
      if (isOutside(r - 1, c)) edges.push([[c, r], [c + 1, r]]); // top
      if (isOutside(r, c + 1)) edges.push([[c + 1, r], [c + 1, r + 1]]); // right
      if (isOutside(r + 1, c)) edges.push([[c + 1, r + 1], [c, r + 1]]); // bottom
      if (isOutside(r, c - 1)) edges.push([[c, r + 1], [c, r]]); // left
    }
  }
  return edges;
}

// At a vertex with multiple outgoing candidates (a pinch point), pick the
// next edge going clockwise starting just after the reverse of the
// direction just traveled.
function pickNextBoundaryEdge(incomingDir, candidates) {
  if (candidates.length === 1) return candidates[0];
  const reverseIdx = clockwiseIndex([-incomingDir[0], -incomingDir[1]]);
  let best = null;
  let bestOffset = Infinity;
  for (const edge of candidates) {
    const idx = clockwiseIndex(directionOf(edge[0], edge[1]));
    const offset = (idx - reverseIdx + BORDER_DIRECTIONS_CLOCKWISE.length) % BORDER_DIRECTIONS_CLOCKWISE.length;
    if (offset !== 0 && offset < bestOffset) { bestOffset = offset; best = edge; }
  }
  return best || candidates[0];
}

function traceBoundaryLoops(edges) {
  const outgoingByStart = new Map();
  for (const edge of edges) {
    const k = pointKey(edge[0]);
    if (!outgoingByStart.has(k)) outgoingByStart.set(k, []);
    outgoingByStart.get(k).push(edge);
  }

  const used = new Set();
  const edgeId = (e) => `${pointKey(e[0])}->${pointKey(e[1])}`;
  const loops = [];

  for (const startEdge of edges) {
    if (used.has(edgeId(startEdge))) continue;
    const loop = [startEdge[0]];
    let current = startEdge;
    let guard = 0;

    while (true) {
      used.add(edgeId(current));
      loop.push(current[1]);
      if (pointKey(current[1]) === pointKey(startEdge[0])) break;

      const candidates = (outgoingByStart.get(pointKey(current[1])) || []).filter((e) => !used.has(edgeId(e)));
      if (candidates.length === 0) break; // shouldn't happen for a well-formed region; bail safely

      current = pickNextBoundaryEdge(directionOf(current[0], current[1]), candidates);
      guard++;
      if (guard > edges.length + 1) break; // defensive, never expected to trigger
    }

    loops.push(loop);
  }
  return loops;
}

function renderRegionBorders() {
  const svg = document.getElementById('region-borders');
  svg.setAttribute('viewBox', `0 0 ${gridSize} ${gridSize}`);
  svg.innerHTML = '';

  for (let region = 0; region < gridSize; region++) {
    const loops = traceBoundaryLoops(collectRegionBoundaryEdges(gridSize, region));
    for (const loop of loops) {
      const d = loop.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ') + ' Z';
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    }
  }
}

// Cell DOM nodes, kept around so drag gestures can update one cell at a time
// instead of tearing down and rebuilding the whole grid (which would destroy
// the very listeners tracking an in-progress drag).
let cellElements = [];

function renderGrid() {
  const gridContainer = document.getElementById('grid');
  gridContainer.innerHTML = '';
  cellElements = Array.from({ length: gridSize }, () => new Array(gridSize));

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const cell = document.createElement('div');
      cell.className = 'q-cell';
      cell.dataset.row = row;
      cell.dataset.col = col;
      cell.style.backgroundColor = colorForRegion(regionOf[row][col]);
      cellElements[row][col] = cell;
      setupCellInteractions(cell, row, col);
      gridContainer.appendChild(cell);
    }
  }

  renderRegionBorders();
  updateAllCellVisuals();
}

// Split so the rim can be drawn *after* the foliage: the rim needs to sit on
// top of the leaf/stem bases for the "planted in the pot" look, but the body
// behind the trunk stays underneath. One combined POT_SVG used to draw both
// before the foliage, which put the foliage on top of the rim instead.
const POT_BODY_SVG = `
  <path d="M15,38 L33,38 L31,46 L17,46 Z" fill="#b97a56" stroke="#1a1f14" stroke-width="0.6"/>
`;
const POT_RIM_SVG = `
  <rect x="14" y="35" width="20" height="4" rx="1.5" fill="#9c6346" stroke="#1a1f14" stroke-width="0.6"/>
`;

// One SVG per region "species", paired 1:1 with REGION_COLORS by index so a
// given color always grows the same plant. Every shape carries its own dark
// outline so the icon stays legible regardless of which region color it
// lands on. Reusable leaf/petal shapes reference ids defined once in
// index.html's hidden <defs> block (see plantForRegion below for why).
const PLANT_ICONS = [
  // salmon — snake plant
  `<svg viewBox="0 0 48 48" class="plant-icon" aria-hidden="true">
    ${POT_BODY_SVG}
    <g class="plant-foliage">
      <g stroke="#1a1f14" stroke-width="0.6" stroke-linejoin="round">
        <use href="#plant-snake-blade" transform="translate(18,37) rotate(-24) scale(0.82)" fill="#2f6b3c"/>
        <use href="#plant-snake-blade" transform="translate(21,37) rotate(-8) scale(0.95)" fill="#3c8449"/>
        <use href="#plant-snake-blade" transform="translate(24,37) rotate(2) scale(1.05)" fill="#4a9956"/>
        <use href="#plant-snake-blade" transform="translate(27,37) rotate(10) scale(0.92)" fill="#3c8449"/>
        <use href="#plant-snake-blade" transform="translate(30,37) rotate(24) scale(0.8)" fill="#2f6b3c"/>
      </g>
    </g>
    ${POT_RIM_SVG}
  </svg>`,
  // peach — monstera
  `<svg viewBox="0 0 48 48" class="plant-icon" aria-hidden="true">
    ${POT_BODY_SVG}
    <g class="plant-foliage">
      <path d="M24,36 C20,30 10,28 8,18 C14,20 20,22 23,28 C21,20 20,10 24,4 C28,10 27,20 25,28 C28,22 34,20 40,18 C38,28 28,30 24,36 Z" fill="#2e7a42" stroke="#1a1f14" stroke-width="0.6"/>
      <g fill="#eaf3e6">
        <circle cx="21" cy="14" r="1.8"/><circle cx="27" cy="20" r="1.6"/><circle cx="16" cy="22" r="1.4"/>
        <circle cx="31" cy="24" r="1.3"/><circle cx="24" cy="10" r="1.2"/><circle cx="13" cy="16" r="1.1"/><circle cx="34" cy="20" r="1.1"/>
      </g>
    </g>
    ${POT_RIM_SVG}
  </svg>`,
  // brick red — tulips
  `<svg viewBox="0 0 48 48" class="plant-icon" aria-hidden="true">
    ${POT_BODY_SVG}
    <g class="plant-foliage">
      <g stroke="#1a1f14" stroke-width="0.6" stroke-linejoin="round">
        <use href="#plant-tulip-leaf" transform="translate(18,37) rotate(-18) scale(1.1)" fill="#2e7a42"/>
        <use href="#plant-tulip-leaf" transform="translate(31,37) rotate(22) scale(-1.1,1.1)" fill="#357f46"/>
        <use href="#plant-tulip-bloom" transform="translate(16,14) scale(0.85)" fill="#d6568f"/>
        <use href="#plant-tulip-bloom" transform="translate(24,8) scale(1.0)" fill="#e67ba6"/>
        <use href="#plant-tulip-bloom" transform="translate(33,15) scale(0.8)" fill="#c94477"/>
      </g>
      <path d="M20,36 C19,28 18,20 16,14" stroke="#3c8449" stroke-width="1.3" fill="none"/>
      <path d="M24,36 L24,8" stroke="#3c8449" stroke-width="1.3" fill="none"/>
      <path d="M28,36 C29,28 30,20 33,15" stroke="#3c8449" stroke-width="1.3" fill="none"/>
    </g>
    ${POT_RIM_SVG}
  </svg>`,
  // matte brown — succulent rosette
  `<svg viewBox="0 0 48 48" class="plant-icon" aria-hidden="true">
    ${POT_BODY_SVG}
    <g class="plant-foliage">
      <g transform="translate(24,34)" stroke="#1a1f14" stroke-width="0.6" stroke-linejoin="round">
        <use href="#plant-rosette-leaf" transform="rotate(-80) scale(0.65)" fill="#6a9c5a"/>
        <use href="#plant-rosette-leaf" transform="rotate(-53) scale(0.85)" fill="#7fb069"/>
        <use href="#plant-rosette-leaf" transform="rotate(-27) scale(0.98)" fill="#6a9c5a"/>
        <use href="#plant-rosette-leaf" transform="rotate(0) scale(1.05)" fill="#7fb069"/>
        <use href="#plant-rosette-leaf" transform="rotate(27) scale(0.98)" fill="#6a9c5a"/>
        <use href="#plant-rosette-leaf" transform="rotate(53) scale(0.85)" fill="#7fb069"/>
        <use href="#plant-rosette-leaf" transform="rotate(80) scale(0.65)" fill="#6a9c5a"/>
      </g>
    </g>
    ${POT_RIM_SVG}
  </svg>`,
  // green — saguaro cactus
  //
  // The trunk and both arms are each built from two overlapping rounded
  // rects, and a per-shape stroke can't hide the seam where they overlap —
  // each rect still draws its own border straight through the middle of
  // what should read as one continuous arm. Fixed with the standard
  // icon-design trick instead: an enlarged dark copy of every rect drawn
  // first with no stroke of its own, then the real green rects on top, also
  // strokeless. Overlapping same-color fills merge seamlessly (no per-shape
  // border to clash), so the dark layer reads as one unbroken outline peeking
  // out from behind, and the green layer reads as one unbroken silhouette.
  `<svg viewBox="0 0 48 48" class="plant-icon" aria-hidden="true">
    ${POT_BODY_SVG}
    <g class="plant-foliage">
      <g fill="#1a1f14">
        <rect x="20.7" y="9.7" width="6.6" height="28.6" rx="3.3"/>
        <rect x="10.7" y="21.7" width="11.6" height="6.6" rx="3.3"/>
        <rect x="10.7" y="8.7" width="6.6" height="14.6" rx="3.3"/>
        <rect x="25.7" y="18.7" width="11.6" height="6.6" rx="3.3"/>
        <rect x="30.7" y="5.7" width="6.6" height="14.6" rx="3.3"/>
      </g>
      <g fill="#3f8a4f">
        <rect x="21" y="10" width="6" height="28" rx="3"/>
        <rect x="11" y="22" width="11" height="6" rx="3"/>
        <rect x="11" y="9" width="6" height="14" rx="3"/>
        <rect x="26" y="19" width="11" height="6" rx="3"/>
        <rect x="31" y="6" width="6" height="14" rx="3"/>
      </g>
      <g stroke="#2c6b3a" stroke-width="0.9" opacity="0.65">
        <path d="M22.5,12 L22.5,37" fill="none"/><path d="M24,11 L24,37" fill="none"/><path d="M25.5,12 L25.5,37" fill="none"/>
        <path d="M14,11 L14,22" fill="none"/><path d="M34,8 L34,19" fill="none"/>
      </g>
      <circle cx="24" cy="8" r="2" fill="#e8a33d" stroke="#1a1f14" stroke-width="0.5"/>
    </g>
    ${POT_RIM_SVG}
  </svg>`,
  // dark green — fiddle leaf fig
  `<svg viewBox="0 0 48 48" class="plant-icon" aria-hidden="true">
    ${POT_BODY_SVG}
    <g class="plant-foliage">
      <path d="M24,37 L24,16" stroke="#5a4632" stroke-width="2" fill="none"/>
      <g stroke="#1a1f14" stroke-width="0.6" stroke-linejoin="round">
        <use href="#plant-fiddle-leaf" transform="translate(24,37) rotate(8) scale(0.8)" fill="#2e6b3c"/>
        <use href="#plant-fiddle-leaf" transform="translate(21,27) rotate(-18) scale(0.9)" fill="#3c8449"/>
        <use href="#plant-fiddle-leaf" transform="translate(27,20) rotate(16) scale(0.7)" fill="#2e6b3c"/>
        <use href="#plant-fiddle-leaf" transform="translate(23,15) rotate(-6) scale(0.55)" fill="#4a9956"/>
      </g>
    </g>
    ${POT_RIM_SVG}
  </svg>`,
  // blue — orchid
  `<svg viewBox="0 0 48 48" class="plant-icon" aria-hidden="true">
    ${POT_BODY_SVG}
    <g class="plant-foliage">
      <g stroke="#1a1f14" stroke-width="0.6">
        <path d="M19,37 C15,33 14,26 17,20 C19,26 19,33 19,37 Z" fill="#2c6b3a"/>
        <path d="M29,37 C33,33 34,26 31,20 C29,26 29,33 29,37 Z" fill="#35793f"/>
      </g>
      <path d="M24,36 C23,27 20,17 13,9" stroke="#3c6b2e" stroke-width="1.2" fill="none"/>
      <use href="#plant-orchid-bloom" transform="translate(22.1,26.3) scale(1)"/>
      <use href="#plant-orchid-bloom" transform="translate(19,18) scale(0.85)"/>
      <use href="#plant-orchid-bloom" transform="translate(15,11.5) scale(0.7)"/>
    </g>
    ${POT_RIM_SVG}
  </svg>`,
  // purple — ZZ plant
  `<svg viewBox="0 0 48 48" class="plant-icon" aria-hidden="true">
    ${POT_BODY_SVG}
    <g class="plant-foliage">
      <path d="M24,37 C20,28 19,16 24,6" stroke="#2c6b3a" stroke-width="1.6" fill="none"/>
      <path d="M24,37 C28,29 30,18 26,9" stroke="#2c6b3a" stroke-width="1.6" fill="none"/>
      <g fill="#4a9956" stroke="#1a1f14" stroke-width="0.6">
        <use href="#plant-zz-leaflet" transform="translate(22,32) rotate(-20)"/>
        <use href="#plant-zz-leaflet" transform="translate(21,26) rotate(-25)"/>
        <use href="#plant-zz-leaflet" transform="translate(21,19) rotate(-15)"/>
        <use href="#plant-zz-leaflet" transform="translate(23,11) rotate(-5)"/>
        <use href="#plant-zz-leaflet" transform="translate(27,30) rotate(20)"/>
        <use href="#plant-zz-leaflet" transform="translate(28,23) rotate(25)"/>
        <use href="#plant-zz-leaflet" transform="translate(27,15) rotate(10)"/>
      </g>
    </g>
    ${POT_RIM_SVG}
  </svg>`,
  // magenta — lucky bamboo
  `<svg viewBox="0 0 48 48" class="plant-icon" aria-hidden="true">
    ${POT_BODY_SVG}
    <g class="plant-foliage" stroke="#1a1f14" stroke-width="0.55" stroke-linejoin="round">
      <rect x="19" y="8" width="3" height="29" rx="1.2" fill="#6a9c4a"/>
      <rect x="19" y="14" width="3" height="1.4" fill="#4e7a37"/>
      <rect x="19" y="22" width="3" height="1.4" fill="#4e7a37"/>
      <rect x="19" y="29" width="3" height="1.4" fill="#4e7a37"/>
      <rect x="25" y="4" width="3" height="33" rx="1.2" fill="#7fb069"/>
      <rect x="25" y="11" width="3" height="1.4" fill="#5c8a43"/>
      <rect x="25" y="19" width="3" height="1.4" fill="#5c8a43"/>
      <rect x="25" y="27" width="3" height="1.4" fill="#5c8a43"/>
      <use href="#plant-bamboo-leaf" transform="translate(20.5,28) rotate(-35)" fill="#6a9c4a"/>
      <use href="#plant-bamboo-leaf" transform="translate(20.5,18) rotate(150) scale(0.85)" fill="#6a9c4a"/>
      <use href="#plant-bamboo-leaf" transform="translate(26.5,14) rotate(-20)" fill="#7fb069"/>
      <use href="#plant-bamboo-leaf" transform="translate(26.5,14) rotate(145) scale(0.85)" fill="#7fb069"/>
    </g>
    ${POT_RIM_SVG}
  </svg>`,
  // gray — spider plant
  `<svg viewBox="0 0 48 48" class="plant-icon" aria-hidden="true">
    ${POT_BODY_SVG}
    <g class="plant-foliage" stroke="#1a1f14" stroke-width="0.6" stroke-linejoin="round">
      <use href="#plant-spider-blade" transform="translate(24,37) rotate(-35) scale(0.75)" fill="#4a9956"/>
      <use href="#plant-spider-blade" transform="translate(24,37) rotate(-18) scale(0.95)" fill="#5bab66"/>
      <use href="#plant-spider-blade" transform="translate(24,37) rotate(0) scale(1.05)" fill="#4a9956"/>
      <use href="#plant-spider-blade" transform="translate(24,37) rotate(18) scale(0.95)" fill="#5bab66"/>
      <use href="#plant-spider-blade" transform="translate(24,37) rotate(35) scale(0.75)" fill="#4a9956"/>
      <use href="#plant-spider-blade" transform="translate(24,37) rotate(-48) scale(0.55)" fill="#3c8449"/>
      <use href="#plant-spider-blade" transform="translate(24,37) rotate(48) scale(0.55)" fill="#3c8449"/>
    </g>
    ${POT_RIM_SVG}
  </svg>`,
];

// Independent from colorForRegion's shuffle — see plantOrder above — so the
// same region doesn't always pair the same species with the same color.
function plantForRegion(region) {
  return PLANT_ICONS[plantOrder[region % plantOrder.length]];
}

function updateCellVisual(row, col) {
  const cell = cellElements[row][col];
  cell.classList.remove('q-marked', 'q-queen', 'q-correct', 'q-wrong');
  cell.innerHTML = '';

  const state = cellState[row][col];
  if (state === MARKED) {
    cell.classList.add('q-marked');
    cell.textContent = '✕';
  } else if (state === QUEEN) {
    cell.classList.add('q-queen', col === solution[row] ? 'q-correct' : 'q-wrong');
    cell.innerHTML = plantForRegion(regionOf[row][col]) + '<span class="placement-tag" aria-hidden="true"></span>';
  }
}

function updateAllCellVisuals() {
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      updateCellVisual(row, col);
    }
  }
  document.getElementById('status').textContent = isPuzzleSolved ? 'Solved!' : '';
  document.getElementById('grid').classList.toggle('puzzle-solved', isPuzzleSolved);
}

// When a correctly-placed piece is confirmed, no other cell in its row,
// column, or region can ever hold a piece either — so with Auto-mark on,
// every still-empty cell among those gets an X for free. Only EMPTY cells
// are touched; anything already marked or holding a (right or wrong) piece
// is left exactly as the player left it.
function autoMarkEliminated(row, col) {
  const region = regionOf[row][col];
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      if (i === row && j === col) continue;
      if (cellState[i][j] !== EMPTY) continue;
      const isDiagonalNeighbor = Math.abs(i - row) === 1 && Math.abs(j - col) === 1;
      if (regionOf[i][j] === region || i === row || j === col || isDiagonalNeighbor) {
        cellState[i][j] = MARKED;
      }
    }
  }
}

// Clears a cell straight to empty — the fast way to take back an X without
// routing through "place a piece" (which, if wrong, costs a point). No
// scoring effect either way, matching the existing tap cycle: removing a
// piece by tapping back to empty doesn't refund or charge anything either.
function clearCell(row, col) {
  if (isPuzzleSolved || cellState[row][col] === EMPTY) return;
  cellState[row][col] = EMPTY;
  updateCellVisual(row, col);
}

// One-directional paints used by the drag gestures below: paintMark only
// ever turns an EMPTY cell into an X, paintErase only ever turns an X back
// to EMPTY. Neither ever touches a placed piece — dragging is only ever for
// bulk X's, placing/removing a piece stays a deliberate single tap.
function paintMark(row, col) {
  if (isPuzzleSolved || cellState[row][col] !== EMPTY) return;
  cellState[row][col] = MARKED;
  updateCellVisual(row, col);
}

function paintErase(row, col) {
  if (isPuzzleSolved || cellState[row][col] !== MARKED) return;
  cellState[row][col] = EMPTY;
  updateCellVisual(row, col);
}

// Tap cycles a cell through empty -> marked -> queen -> empty.
function toggleCell(row, col) {
  if (isPuzzleSolved) return;

  const nextState = (cellState[row][col] + 1) % 3;
  cellState[row][col] = nextState;

  if (nextState === QUEEN) {
    const isCorrect = col === solution[row];
    if (isCorrect) {
      score++;
      if (autoMarkEnabled) autoMarkEliminated(row, col);
    } else {
      score = Math.max(0, score - 1);
    }
    updateScore();
  }

  // isPuzzleSolved (which the .puzzle-solved class and the status text both
  // read) is decided *before* the one render pass below, rather than
  // rendering once, checking, and re-rendering — no reason for the board to
  // ever paint a transient "not solved yet" frame right before the real one.
  if (isSolved()) {
    isPuzzleSolved = true;
    clearInterval(timerInterval);
  }

  updateAllCellVisuals();
}

// ---------------------------------------------------------------------------
// Cell gestures
//
// Desktop: left-click-drag paints a whole stroke of X's at once, regardless
// of which cell the drag started on — only empty cells along the path turn
// into X's, anything already marked (or holding a piece) is left exactly as
// it was. Removing a mark in bulk isn't a drag gesture on desktop; the mouse
// already has an unambiguous separate action for clearing a single cell
// (right-click). A plain click with no movement is untouched, same 3-state
// cycle as always.
//
// Touch has no separate button, so it borrows a different signal: how long
// the finger sits still before it starts moving. A quick touch that starts
// moving right away is a swipe — paints X's, same as a fresh mouse-drag from
// an empty cell. A touch held past the long-press threshold *before* moving
// is this cell's existing single-clear gesture, generalized: once the hold
// fires, it keeps erasing X's for as long as the finger keeps moving,
// instead of stopping at the one cell.
// ---------------------------------------------------------------------------

let mouseDragActive = false;
let mouseDragStartRow = -1;
let mouseDragStartCol = -1;
let mouseDragMoved = false;

// Right-button drag mirrors the left-button one but erases instead of
// marks, reusing paintErase as-is (same restraint: only touches already-
// marked cells, never a placed piece).
let mouseRightDragActive = false;
let mouseRightDragStartRow = -1;
let mouseRightDragStartCol = -1;
let mouseRightDragMoved = false;

const LONG_PRESS_MS = 450;
const LONG_PRESS_MOVE_CANCEL_PX = 10;

let touchGestureMode = 'idle'; // 'idle' | 'pending' | 'swipe-mark' | 'erase-drag'
let touchStartRow = -1;
let touchStartCol = -1;
let touchStartX = 0;
let touchStartY = 0;
let touchPressTimer = null;
let touchLastRow = -1;
let touchLastCol = -1;

function setupCellInteractions(cell, row, col) {
  cell.addEventListener('click', () => {
    if (mouseDragMoved && row === mouseDragStartRow && col === mouseDragStartCol) {
      mouseDragMoved = false; // this click is just the tail end of a drag; consume it once
      return;
    }
    toggleCell(row, col);
  });

  cell.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (mouseRightDragMoved && row === mouseRightDragStartRow && col === mouseRightDragStartCol) {
      mouseRightDragMoved = false; // already handled via the drag; consume once
      return;
    }
    clearCell(row, col);
  });

  cell.addEventListener('mousedown', (e) => {
    if (e.button === 0) {
      mouseDragActive = true;
      mouseDragStartRow = row;
      mouseDragStartCol = col;
      mouseDragMoved = false;
    } else if (e.button === 2) {
      mouseRightDragActive = true;
      mouseRightDragStartRow = row;
      mouseRightDragStartCol = col;
      mouseRightDragMoved = false;
    }
  });

  cell.addEventListener('mouseenter', () => {
    if (mouseDragActive && !(row === mouseDragStartRow && col === mouseDragStartCol)) {
      if (!mouseDragMoved) {
        mouseDragMoved = true;
        paintMark(mouseDragStartRow, mouseDragStartCol); // no-op if it wasn't empty — "stays the same"
      }
      paintMark(row, col);
    }

    if (mouseRightDragActive && !(row === mouseRightDragStartRow && col === mouseRightDragStartCol)) {
      if (!mouseRightDragMoved) {
        mouseRightDragMoved = true;
        paintErase(mouseRightDragStartRow, mouseRightDragStartCol); // no-op if it wasn't marked
      }
      paintErase(row, col);
    }
  });

  cell.addEventListener('touchstart', (e) => {
    const touch = e.changedTouches[0];
    touchStartX = touch.screenX;
    touchStartY = touch.screenY;
    touchStartRow = row;
    touchStartCol = col;
    touchLastRow = row;
    touchLastCol = col;
    touchGestureMode = 'pending';

    touchPressTimer = setTimeout(() => {
      if (touchGestureMode !== 'pending') return;
      touchGestureMode = 'erase-drag';
      if (navigator.vibrate) navigator.vibrate(12);
      clearCell(touchStartRow, touchStartCol);
    }, LONG_PRESS_MS);
  }, { passive: true });

  cell.addEventListener('touchmove', (e) => {
    const touch = e.changedTouches[0];

    if (touchGestureMode === 'pending') {
      const dx = touch.screenX - touchStartX;
      const dy = touch.screenY - touchStartY;
      if (Math.hypot(dx, dy) > LONG_PRESS_MOVE_CANCEL_PX) {
        clearTimeout(touchPressTimer);
        touchGestureMode = 'swipe-mark';
        paintMark(touchStartRow, touchStartCol);
      }
      return;
    }

    if (touchGestureMode !== 'swipe-mark' && touchGestureMode !== 'erase-drag') return;

    const target = document.elementFromPoint(touch.clientX, touch.clientY);
    if (!target || target.dataset.row === undefined) return;
    const r = Number(target.dataset.row);
    const c = Number(target.dataset.col);
    if (r === touchLastRow && c === touchLastCol) return;
    touchLastRow = r;
    touchLastCol = c;
    (touchGestureMode === 'swipe-mark' ? paintMark : paintErase)(r, c);
  }, { passive: true });

  cell.addEventListener('touchend', (e) => {
    clearTimeout(touchPressTimer);
    if (touchGestureMode === 'swipe-mark' || touchGestureMode === 'erase-drag') {
      e.preventDefault(); // swallow the synthetic click a drag/long-press would otherwise trigger
    }
    touchGestureMode = 'idle';
  });

  cell.addEventListener('touchcancel', () => {
    clearTimeout(touchPressTimer);
    touchGestureMode = 'idle';
  });
}

document.addEventListener('mouseup', () => {
  mouseDragActive = false;
  mouseRightDragActive = false;
  // Deferred so a same-cell click/contextmenu (which fires right after
  // mouseup) still sees *DragMoved and can consume it itself; this is the
  // fallback for drags that end on a different cell, where neither event
  // ever fires on the start cell to do that.
  setTimeout(() => {
    mouseDragMoved = false;
    mouseRightDragMoved = false;
  }, 0);
});

// Generation is synchronous and can occasionally take a while (see
// generatePuzzle's comments on the tight/loose cap tiers) — long enough to
// block the main thread for a few seconds in rare cases. The setTimeout
// here lets the browser paint the overlay before that blocking work starts,
// so it's never left showing the old (or a half-built) grid during the wait.
function startNewPuzzle() {
  clearInterval(timerInterval);

  const overlay = document.getElementById('generating-overlay');
  overlay.hidden = false;

  setTimeout(() => {
    const puzzle = generatePuzzle(gridSize);
    solution = puzzle.solution;
    regionOf = puzzle.regionOf;
    cellState = Array.from({ length: gridSize }, () => Array(gridSize).fill(EMPTY));
    score = 0;
    isPuzzleSolved = false;
    startTime = Date.now();
    shuffleRegionColors();

    document.getElementById('timer').textContent = '00:00';
    timerInterval = setInterval(updateTimer, 1000);

    updateScore();
    renderGrid();

    overlay.hidden = true;
  }, 0);
}

function setupControls() {
  document.getElementById('new-game').addEventListener('click', startNewPuzzle);
  document.querySelectorAll('input[name="grid-size"]').forEach((input) => {
    input.addEventListener('change', changeGridSize);
  });

  const autoMarkToggle = document.getElementById('auto-mark-toggle');
  autoMarkEnabled = autoMarkToggle.checked;
  autoMarkToggle.addEventListener('change', () => {
    autoMarkEnabled = autoMarkToggle.checked;
  });
}

// Initial setup
updateGridSize();
startNewPuzzle();
setupControls();
