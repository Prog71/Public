// ---- P5: navigation unit tests (node test/nav.test.js) ----
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const src = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8');
// Extract the pure navIndex function + COLS constant from the real renderer source
const navSrc = src.match(/const COLS = \d+;/) [0] + '\n' + src.match(/function navIndex[\s\S]*?\n}\n/)[0];
const navIndex = new Function(navSrc + '; return navIndex;')();

const COLS = 6;
let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok  ' + name); }
  catch (e) { fail++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

// Build a zone map: fav [0..favCount) | grid [favCount..+gridCount) | rec [..+recCount)
function zoneOf(idx, f, g, r) {
  if (idx < f) return 'fav';
  if (idx < f + g) return 'grid';
  return 'rec';
}

console.log('navIndex — 3 columns (fav=2, grid=12, rec=3)');
const F = 2, G = 12, R = 3;

t('ArrowDown in fav advances to next pinned', () => {
  assert.strictEqual(navIndex('ArrowDown', 0, 'fav', F, G, R), 1);
});
t('ArrowDown at last pinned jumps to first All Apps', () => {
  assert.strictEqual(navIndex('ArrowDown', 1, 'fav', F, G, R), 2);
});
t('ArrowDown in grid moves one row (COLS)', () => {
  assert.strictEqual(navIndex('ArrowDown', 2, 'grid', F, G, R), 8);
});
t('ArrowDown in grid clamps to last grid item', () => {
  assert.strictEqual(navIndex('ArrowDown', 13, 'grid', F, G, R), 13);
});
t('ArrowDown in rec advances to next recommended', () => {
  assert.strictEqual(navIndex('ArrowDown', 14, 'rec', F, G, R), 15);
});
t('ArrowDown at last rec stays on last rec', () => {
  assert.strictEqual(navIndex('ArrowDown', 16, 'rec', F, G, R), 16);
});
t('ArrowUp in grid moves one row up', () => {
  assert.strictEqual(navIndex('ArrowUp', 8, 'grid', F, G, R), 2);
});
t('ArrowUp at first grid row jumps to last pinned', () => {
  assert.strictEqual(navIndex('ArrowUp', 2, 'grid', F, G, R), 1);
});
t('ArrowUp in rec at first row jumps to last grid item', () => {
  assert.strictEqual(navIndex('ArrowUp', 14, 'rec', F, G, R), 13);
});
t('ArrowRight in fav jumps to same row in Recommended', () => {
  assert.strictEqual(navIndex('ArrowRight', 1, 'fav', F, G, R), 15);
});
t('ArrowRight in rec jumps to same row in All Apps', () => {
  // rec index 15 -> recRow 1 -> grid index favEnd + min(1*6, 11) = 2+6 = 8
  assert.strictEqual(navIndex('ArrowRight', 15, 'rec', F, G, R), 8);
});
t('ArrowLeft in grid jumps to same row in Recommended', () => {
  // grid index 8 -> gridRow (8-2)/6 = 1 -> rec index gridEnd + min(1, 2) = 14+1 = 15
  assert.strictEqual(navIndex('ArrowLeft', 8, 'grid', F, G, R), 15);
});
t('ArrowLeft in rec jumps to same row in Pinned', () => {
  assert.strictEqual(navIndex('ArrowLeft', 16, 'rec', F, G, R), 1);
});
t('ArrowLeft in grid steps within grid at row start', () => {
  // first row of grid, recCount>0 -> jumps to rec; covered above
  assert.strictEqual(navIndex('ArrowLeft', 3, 'grid', F, G, R), 14);
});

console.log('navIndex — edge cases');
t('no Recommended: ArrowRight in fav stays put', () => {
  assert.strictEqual(navIndex('ArrowRight', 1, 'fav', F, G, 0), 1);
});
t('no Recommended: ArrowLeft in grid steps left', () => {
  assert.strictEqual(navIndex('ArrowLeft', 5, 'grid', F, G, 0), 4);
});
t('no Pinned: ArrowLeft in rec stays put', () => {
  assert.strictEqual(navIndex('ArrowLeft', 14, 'rec', 0, G, R), 14);
});
t('no grid: ArrowRight in rec stays put', () => {
  assert.strictEqual(navIndex('ArrowRight', 2, 'rec', F, 0, R), 2);
});
t('no Pinned: ArrowUp in grid clamps to grid start', () => {
  assert.strictEqual(navIndex('ArrowUp', 0, 'grid', 0, G, R), 0);
});
t('rec count 1: ArrowRight from fav lands on the only rec', () => {
  assert.strictEqual(navIndex('ArrowRight', 1, 'fav', F, G, 1), F + G);
});
t('empty grid: ArrowDown in fav lands on rec start', () => {
  assert.strictEqual(navIndex('ArrowDown', 1, 'fav', F, 0, R), F);
});
t('unknown key returns current index', () => {
  assert.strictEqual(navIndex('Escape', 5, 'grid', F, G, R), 5);
});

console.log('navIndex — invariant sweep (never out of range, never wrong zone)');
(function sweep() {
  const cases = [[0,0,0],[0,0,5],[2,0,0],[0,12,0],[0,12,3],[3,12,3],[1,1,1],[5,30,8],[0,1,0],[2,5,0]];
  for (const [f, g, r] of cases) {
    const total = f + g + r;
    for (let s = 0; s < total; s++) {
      const z = zoneOf(s, f, g, r);
      for (const key of ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight']) {
        const n = navIndex(key, s, z, f, g, r);
        assert.ok(Number.isInteger(n), 'not an integer');
        assert.ok(n >= 0 && n < total, `out of range ${n} for ${key} from ${s} (f${f} g${g} r${r})`);
        const nz = zoneOf(n, f, g, r);
        // Horizontal moves stay in a column; vertical moves may change column.
        if (key === 'ArrowLeft' || key === 'ArrowRight') {
          assert.ok(nz === z || (z === 'grid' && nz === 'rec') || (z === 'rec' && nz === 'grid')
                    || (z === 'fav' && nz === 'rec') || (z === 'rec' && nz === 'fav'),
                    `horizontal ${key} from ${s}(${z}) -> ${n}(${nz}) changed column unexpectedly`);
        }
      }
    }
  }
})();

// ---- P5-A incident guard: anchorGeometry invariants (main.js) ----
// Extract the real anchorGeometry from main.js and run it with a stubbed
// screen. For EVERY anchor the panel must satisfy
//   y + height <= workArea.y + workArea.height - MARGIN
// so the bottom bar is never pushed below the visible panel.
console.log('\nanchorGeometry — workArea invariants (Step 2 guard)');
const mainSrc = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
const agMatch = mainSrc.match(/function anchorGeometry\([\s\S]*?\n}/);
assert.ok(agMatch, 'anchorGeometry not found in main.js');
const MARGIN = 12;
const runGeo = (wa) => {
  const d = { workArea: wa };
  const screen = { getPrimaryDisplay: () => d };
  const fn = new Function('screen', agMatch[0] + '; return anchorGeometry;');
  return fn(screen);
};
// A realistic 1920x1080 screen with a 60px bottom dock => workArea 1920x1020.
const WA = { x: 0, y: 0, width: 1920, height: 1020 };
const ANCHORS7 = ['top-left','top-center','top-right','bottom-left','bottom-center','bottom-right','screen-center'];
for (const a of ANCHORS7) {
  t(`anchor ${a}: panel bottom <= workArea bottom - MARGIN`, () => {
    const g = runGeo(WA)(a);
    assert.ok(g.y + g.height <= WA.y + WA.height - MARGIN,
      `${a}: y(${g.y})+h(${g.height})=${g.y + g.height} exceeds workArea(${WA.height})-MARGIN(${MARGIN})`);
    assert.ok(g.y >= WA.y && g.x >= WA.x, `${a}: panel origin outside workArea`);
    assert.ok(g.width > 0 && g.height > 0, `${a}: zero/negative panel size`);
  });
}
t('anchor bottom row: bottom-left.y === bottom-center.y === bottom-right.y', () => {
  const bl = runGeo(WA)('bottom-left').y;
  const bc = runGeo(WA)('bottom-center').y;
  const br = runGeo(WA)('bottom-right').y;
  assert.strictEqual(bl, bc); assert.strictEqual(bc, br);
});
t('anchor top row: y === workArea.y + MARGIN', () => {
  for (const a of ['top-left','top-center','top-right']) {
    assert.strictEqual(runGeo(WA)(a).y, WA.y + MARGIN);
  }
});

// P5-A FINAL: the window IS the anchor rectangle. Its size must be capped so it
// ALWAYS fits the work area (≤ workArea − 2·MARGIN) and sits inside it — this is
// what makes "panel fills window ⇒ bar can't be clipped" hold for every anchor.
t('FINAL: window (=anchor rect) size fits work area, all 7 anchors', () => {
  for (const a of ANCHORS7) {
    const g = runGeo(WA)(a);
    assert.ok(g.width <= WA.width - 2 * MARGIN, `${a}: width ${g.width} exceeds workArea-${2*MARGIN}`);
    assert.ok(g.height <= WA.height - 2 * MARGIN, `${a}: height ${g.height} exceeds workArea-${2*MARGIN}`);
    // Rectangle fully inside the work area.
    assert.ok(g.x >= WA.x && g.y >= WA.y && g.x + g.width <= WA.x + WA.width && g.y + g.height <= WA.y + WA.height,
      `${a}: rectangle escapes work area: ${JSON.stringify(g)}`);
  }
});
t('FINAL: bottom anchors sit flush at workArea.bottom − MARGIN − h', () => {
  const h = runGeo(WA)('bottom-left').height;
  const expectY = WA.y + WA.height - h - MARGIN;
  for (const a of ['bottom-left','bottom-center','bottom-right']) {
    assert.strictEqual(runGeo(WA)(a).y, expectY, `${a} y=${runGeo(WA)(a).y} != ${expectY}`);
  }
});

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
