(() => {
  const root = document.documentElement;

  // Fog lift: the veil over the plant thins once, after fonts settle.
  const lift = () => requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("pre")));
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    drawDays();
    drawHorizon();
    lift();
  });

  // A hairline scale at the fog line: metres across the frame, sample run.
  function drawHorizon() {
    const c = document.querySelector(".horizon");
    if (!c) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const r = c.getBoundingClientRect();
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const pad = parseFloat(getComputedStyle(document.documentElement).fontSize) * 0 + Math.max(16, Math.min(64, innerWidth * 0.04));
    const w = r.width - pad * 2;
    const span = innerWidth < 640 ? 100 : 300;
    const step = innerWidth < 640 ? 10 : 10;
    ctx.fillStyle = "#252a29";
    ctx.fillRect(pad, 0, w, 1);
    ctx.font = '400 11px "Azeret Mono", monospace';
    const label = `${span} m · scale, sample run`;
    const stop = pad + w - ctx.measureText(label).width - 16;
    for (let m = 0; m <= span; m += step) {
      const x = Math.round(pad + (m / span) * w);
      const major = m % 50 === 0;
      ctx.fillRect(Math.min(x, pad + w - 1), 0, 1, major ? 9 : 5);
      if (major && m < span && x + 40 < stop) ctx.fillText(String(m), x + 4, 22);
    }
    ctx.fillText(label, pad + w - ctx.measureText(label).width, 22);
  }

  // The six stations: one lamp lit, the step nearest the middle of the screen
  // while scrolling, or the one under the pointer.
  const items = [...document.querySelectorAll(".line li")];
  const light = (li) => items.forEach((x) => x.classList.toggle("lit", x === li));
  if (items.length) light(items[0]);
  items.forEach((li) => li.addEventListener("pointerenter", () => light(li)));
  const nearest = () => {
    const mid = innerHeight / 2;
    let best = null, d = Infinity;
    for (const li of items) {
      const r = li.getBoundingClientRect();
      const dd = Math.abs(r.top + r.height / 2 - mid);
      if (dd < d) { d = dd; best = li; }
    }
    return best;
  };
  const line = document.querySelector(".line");
  if (line && "IntersectionObserver" in window) {
    let active = false;
    new IntersectionObserver((e) => { active = e[0].isIntersecting; }, { threshold: 0 }).observe(line);
    let ticking = false;
    addEventListener("scroll", () => {
      if (!active || ticking) return;
      ticking = true;
      requestAnimationFrame(() => { light(nearest()); ticking = false; });
    }, { passive: true });
  }

  // Sample run: batches per shift on seeds 1 to 10 (illustrative).
  const RULES = [284, 279, 291, 276, 288, 282, 280, 293, 277, 285];
  const CREW = [297, 290, 301, 288, 299, 294, 289, 305, 286, 296];

  function drawDays() {
    const c = document.getElementById("days");
    if (!c) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const r = c.getBoundingClientRect();
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = r.width, h = r.height;
    const lo = 270, hi = 310;
    const pad = 40;
    const x = (i) => pad + (i / (RULES.length - 1)) * (w - pad * 2);
    const y = (v) => 10 + (1 - (v - lo) / (hi - lo)) * (h - 44);
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(37,42,41,0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h - 24.5);
    ctx.lineTo(w, h - 24.5);
    ctx.stroke();
    const line = (data, dash) => {
      ctx.setLineDash(dash);
      ctx.strokeStyle = "#252a29";
      ctx.beginPath();
      data.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))));
      ctx.stroke();
      ctx.setLineDash([]);
    };
    line(RULES, [3, 4]);
    line(CREW, []);
    ctx.font = '400 11px "Azeret Mono", monospace';
    ctx.fillStyle = "#535b59";
    [270, 290, 310].forEach((v) => ctx.fillText(String(v), 0, y(v) + 4));
    ctx.fillStyle = "#252a29";
    RULES.forEach((v, i) => {
      ctx.beginPath();
      ctx.fillStyle = "#eef0ee";
      ctx.arc(x(i), y(v), 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.fillStyle = "#252a29";
      ctx.arc(x(i), y(CREW[i]), 3.5, 0, Math.PI * 2);
      ctx.fill();
      const label = String(i + 1);
      ctx.fillText(label, x(i) - ctx.measureText(label).width / 2, h - 6);
    });
  }

  let raf = 0;
  addEventListener("resize", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { drawDays(); drawHorizon(); });
  });
})();
