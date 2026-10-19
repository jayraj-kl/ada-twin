import HL from "./kernel.js";

/**
 * Copy floor: the boiler room twice, on two plinths of the same size. The far
 * one is the plant: a feed pump, a boiler with its flue, a control cabinet and
 * a valve train. The near one is its copy, with a free slot beside each
 * station. The station under the pointer gets a second unit, risen out of the
 * copy's floor beside it; the plant behind never moves. At rest the copy
 * already holds one change, a second boiler, bright. The slider is the stagger,
 * in ms, between the unit that sinks and the one that rises.
 *
 * The pattern: discrete items, after Riffle. Tweens, a stagger by distance,
 * and a hit test on static columns over the copy's stations at rest.
 */
const {
  Cam, facing, fit, prism, proj, rings, seg, tdone, tset, tval, tween,
  disposer, mk, pointer, put, register, solid,
} = HL;

const N = 4, GAP = 50, X1 = (N - 1) * GAP, SLOT = 21, REST = 1;
const PLANT = -74, COPY = 0; // each plinth's row of stations, on y
const PX0 = -27, PX1 = X1 + 27, PY0 = -15, PY1 = 34; // a plinth's footprint, relative to its row

/** Each station's parts, centred on it: [x0, y0, x1, y1, z0, z1, r]. */
const KINDS = [
  [[-13, -9, 13, 9, 0, 3, 1.6], [-11, -7, 2, 7, 3, 20, 3], [3, -6, 12, 6, 3, 16, 2.4]], // feed pump: a skid, the pump, its motor
  [[-12, -12, 12, 12, 0, 3, 3], [-10, -10, 10, 10, 3, 30, 10], [-3, -3, 3, 3, 30, 40, 3]], // boiler: a base, the round drum, its flue
  [[-10, -6, 10, 6, 0, 3, 1.6], [-9, -4, 9, 4, 3, 32, 1.8], [-10, -5, 10, 5, 32, 34, 1.4]], // control panel: a plinth, the cabinet, its hood
  [[-15, -5, 15, 5, 0, 7, 2], [-11, -5, -1, 5, 7, 22, 5], [1, -5, 11, 5, 7, 22, 5]], // valve train: a rail, two round valves
];
const NAMES = ["feed pump", "boiler", "control panel", "valve train"];

/** A station's parts at (cx, cy), each with its rings and its own solid. */
function unit(g, i, cx, cy) {
  return KINDS[i].map(([x0, y0, x1, y1, z0, z1, r]) => {
    const [ring, inner] = rings(cx + x0, cy + y0, cx + x1, cy + y1, r, 0.9);
    return { ring, inner, z0, z1, el: solid(g) };
  });
}

function mount({ stage, svg, read }, value) {
  const bag = disposer();
  let stag = value;

  // Fitted to both plinths and the boiler's flue, the highest part there is.
  const C = Cam(45, 0.5, 1.46);
  fit(C, [[PX0, PLANT + PY0, -5], [PX1, PLANT + PY0, -5], [PX0, COPY + PY1, -5], [PX1, COPY + PY1, -5], [GAP, PLANT, 40]], 200, 160);
  const P = proj(C), front = facing(C);
  const g = mk("g", {}, svg);

  const plinth = (y) => {
    const [r, i] = rings(PX0, y + PY0, PX1, y + PY1, 8, 2);
    put(solid(g), prism(P, front, r, i, -5, 0));
  };

  // The plant, back to front: its plinth, then its stations, drawn once.
  plinth(PLANT);
  for (let i = 0; i < N; i++) for (const p of unit(g, i, i * GAP, PLANT)) put(p.el, prism(P, front, p.ring, p.inner, p.z0, p.z1));

  // The copy's guides, painted before the copy's plinth so it covers their feet.
  const guide = mk("path", { class: "nf dash" }, g);
  guide.setAttribute("d", seg(P(PX0, PLANT + PY1, -5), P(PX0, COPY + PY0, -5)) + seg(P(PX1, PLANT + PY1, -5), P(PX1, COPY + PY0, -5)));

  // The copy: its plinth, then each station and the slot beside it, nearer.
  plinth(COPY);
  const st = [];
  for (let i = 0; i < N; i++) {
    const cx = i * GAP;
    for (const p of unit(g, i, cx, COPY)) put(p.el, prism(P, front, p.ring, p.inner, p.z0, p.z1));
    st.push({ parts: unit(g, i, cx, COPY + SLOT), h: tween(i === REST ? 1 : 0), drawn: NaN, col: [P(cx, COPY + SLOT / 2, 0), P(cx, COPY + SLOT / 2, 34)] });
  }

  /** A second unit at height h of its full size: nothing at all while it is still in the floor. */
  function draw(s, h) {
    for (const p of s.parts) {
      if (h < 0.03) { p.el.sil.setAttribute("d", ""); p.el.cr.setAttribute("d", ""); continue; }
      put(p.el, prism(P, front, p.ring, p.inner, p.z0 * h, p.z1 * h));
    }
  }

  const B = register(stage, (_dt, now) => {
    let moving = false;
    for (const s of st) {
      const h = tval(s.h, now);
      if (!tdone(s.h, now)) moving = true;
      if (h === s.drawn) continue;
      s.drawn = h;
      draw(s, h);
    }
    return moving;
  });
  bag.add(B.unregister);

  /** The copy's station whose column passes nearest the point; -1 beyond reach. Columns never move. */
  function hit([x, y]) {
    let best = -1, d = 24;
    st.forEach((s, i) => {
      const [a, b] = s.col, dx = b[0] - a[0], dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)));
      const e = Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy);
      if (e < d) { d = e; best = i; }
    });
    return best;
  }

  let act = -2;
  /** Raises a second unit at station a and sinks the rest; -1 puts back the change the copy holds at rest. */
  function setActive(a) {
    if (a === act) return;
    const now = performance.now(), on = a < 0 ? REST : a, from = a >= 0 ? a : act;
    act = a;
    st.forEach((s, i) => {
      tset(s.h, i === on ? 1 : 0, now, Math.abs(i - from) * stag);
      for (const p of s.parts) p.el.sil.classList.toggle("hi", i === on);
    });
    read.textContent = a < 0 ? "rest" : `copy · ${NAMES[a]} +1`;
    B.wake();
  }
  setActive(-1);

  bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
  bag.add(() => svg.replaceChildren());

  return {
    set: (v) => { stag = v; },
    destroy: bag.dispose,
  };
}

export const copyFloor = {
  name: "copy-floor",
  means: "A plant and its copy: the station under the pointer gets a second unit on the copy, and the plant never moves.",
  rules: [1, 2, 4, 5],
  range: [0, 45, 90],
  tour: [[150, 210], [300, 150], [230, 180], null],
  mount,
};
