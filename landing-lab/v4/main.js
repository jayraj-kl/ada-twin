(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const expo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

  // The product's own idea: one seed, one sequence. Seed 1 is AdaTwin's default.
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Sample run ledger (illustrative).
  const RULES = [284, 279, 291, 276, 288, 282, 280, 293, 277, 285];
  const CREW = [297, 290, 301, 288, 299, 294, 289, 305, 286, 296];
  const ledger = document.getElementById("ledger");
  if (ledger) {
    ledger.innerHTML = RULES.map((r, i) => {
      const d = CREW[i] - r;
      return `<tr><th scope="row">${i + 1}</th><td>${r}</td><td>${CREW[i]}</td><td>${d > 0 ? "+" : ""}${d}</td></tr>`;
    }).join("");
  }

  function fit(canvas) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: r.width, h: r.height };
  }

  // Colours along the image's left edge, so the voxels come from the picture itself.
  function edgeColours(img, rows) {
    const off = document.createElement("canvas");
    off.width = 8;
    off.height = rows;
    const o = off.getContext("2d", { willReadFrequently: true });
    try {
      o.drawImage(img, 0, 0, Math.max(1, img.naturalWidth * 0.08), img.naturalHeight, 0, 0, 8, rows);
      const data = o.getImageData(0, 0, 1, rows).data;
      return Array.from({ length: rows }, (_, i) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
    } catch {
      return Array.from({ length: rows }, () => [42, 42, 42]);
    }
  }

  let voxels = [];
  // Wide screens: the image's left edge breaks into voxels that drift left into the black.
  // Narrow screens: the image's top edge breaks and the voxels drift up into the black.
  function planVoxels() {
    const c = document.querySelector(".voxels");
    const img = document.querySelector(".hero-img");
    if (!c || !img) return null;
    const { ctx, w, h } = fit(c);
    const narrow = innerWidth <= 860;
    const cell = narrow ? 8 : 12;
    const inside = narrow ? 32 : 120; // band of the picture itself that loses cells
    const rows = Math.ceil(h / cell);
    const cols = Math.ceil(w / cell);
    const colours = edgeColours(img, narrow ? cols : rows);
    const rand = rng(1);
    voxels = [];
    // banded density: a dense mass at the seam that thins in steps
    const band = (d) => (d < 2 ? 0.9 : d < 5 ? 0.62 : d < 9 ? 0.34 : d < 14 ? 0.16 : 0.06);
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = col * cell;
        const y = row * cell;
        // distance in cells from the picture's edge, positive into the black
        const d = narrow ? (h - inside - y) / cell : (w - inside - x) / cell;
        const [r, g, b] = colours[narrow ? col : row];
        if (d <= 0) {
          if (rand() < 0.55 * Math.exp(d / 3)) voxels.push({ x, y, s: cell, c: "#0a0a0a", fx: x, fy: y });
          continue;
        }
        // taper to nothing before the canvas edge so there is no seam
        const room = narrow ? y / (h * 0.35) : x / (w * 0.3);
        const p = band(d) * Math.min(1, room);
        if (rand() > p) continue;
        const lift = rand() < 0.28 ? 0.62 : 0;
        const mix = (v) => Math.round(v + (243 - v) * lift);
        voxels.push({
          x, y, s: cell, c: `rgb(${mix(r)},${mix(g)},${mix(b)})`,
          fx: narrow ? x : w - inside - cell,
          fy: narrow ? h - inside - cell : y,
        });
      }
    }
    return { ctx, w, h };
  }

  function paint(state, t) {
    const { ctx, w, h } = state;
    ctx.clearRect(0, 0, w, h);
    for (const v of voxels) {
      const travel = Math.hypot(v.fx - v.x, v.fy - v.y) / Math.max(1, Math.max(w, h));
      const local = Math.max(0, Math.min(1, (t - travel * 0.35) / (1 - travel * 0.35 || 1)));
      const e = expo(local);
      ctx.fillStyle = v.c;
      ctx.fillRect(Math.round(v.fx + (v.x - v.fx) * e), Math.round(v.fy + (v.y - v.fy) * e), v.s - 1, v.s - 1);
    }
  }

  function voxelDrift(animate) {
    const state = planVoxels();
    if (!state) return;
    if (!animate) return paint(state, 1);
    const t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / 900);
      paint(state, t);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // Footer edge stepping down in pixels, from the same seed: a few plateaus, jitter only at their edges.
  function drawEdge() {
    const c = document.querySelector(".steps-edge");
    if (!c) return;
    const { ctx, w, h } = fit(c);
    ctx.clearRect(0, 0, w, h);
    const cell = innerWidth <= 640 ? 8 : 16;
    const rowsMax = Math.floor(h / cell);
    const cols = Math.ceil(w / cell);
    const plateaus = 6;
    const rand = rng(1);
    ctx.fillStyle = "#f3f3f0";
    for (let i = 0; i < cols; i++) {
      const pos = (i / cols) * plateaus;
      const step = Math.floor(pos);
      const nearEdge = pos - step > 0.8;
      let level = 1 + Math.round((step / (plateaus - 1)) * (rowsMax - 3));
      if (nearEdge && rand() < 0.5) level += 1;
      ctx.fillRect(i * cell, h - level * cell, cell, level * cell + 1);
      for (let k = level + 2; k < Math.min(rowsMax, level + 4); k++) {
        if (rand() < 0.16) ctx.fillRect(i * cell, h - k * cell, cell, cell);
      }
    }
  }

  const img = document.querySelector(".hero-img");
  const go = () => {
    voxelDrift(!reduce);
    drawEdge();
  };
  const imgReady = img && !img.complete ? new Promise((r) => img.addEventListener("load", r, { once: true })) : Promise.resolve();
  Promise.all([imgReady, document.fonts ? document.fonts.ready : null]).then(go);

  let raf = 0;
  let lastW = innerWidth;
  addEventListener("resize", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (innerWidth !== lastW) {
        lastW = innerWidth;
        voxelDrift(false);
      }
      drawEdge();
    });
  });
})();
