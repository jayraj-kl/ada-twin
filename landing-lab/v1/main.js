(() => {
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const INK = "#141414";
  const MONO = '400 11px "Martian Mono", monospace';
  const expo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

  // Sample run: batches shipped per shift over ten seeded days (illustrative).
  const RULES = [284, 279, 291, 276, 288, 282, 280, 293, 277, 285];
  const CREW = [297, 290, 301, 288, 299, 294, 289, 305, 286, 296];

  const tbody = document.getElementById("days-table");
  if (tbody) {
    tbody.innerHTML = RULES.map(
      (r, i) => `<tr><th scope="row">${i + 1}</th><td>${r}</td><td>${CREW[i]}</td></tr>`,
    ).join("");
  }

  function fit(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width, height };
  }

  // Film-strip ruler: floor coordinates in metres along the plate (sample run).
  const FLOOR_M = 30;
  function drawRulerX(progress) {
    const c = document.querySelector(".ruler-x");
    if (!c) return;
    const { ctx, width, height } = fit(c);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = INK;
    ctx.font = MONO;
    const steps = FLOOR_M * 2;
    const shown = Math.round(steps * progress);
    const label = "floor x in metres · sample run";
    const labelW = width > 520 ? ctx.measureText(label).width + 24 : 0;
    for (let i = 0; i <= shown; i++) {
      const x = Math.min(width - 1, (i / steps) * width);
      const major = i % 10 === 0;
      const mid = i % 2 === 0;
      const h = major ? 12 : mid ? 7 : 4;
      ctx.fillRect(Math.round(x), height - h, 1, h);
      const clear = x < width - labelW;
      const narrow = width < 520;
      const base = i - (i % 10);
      const labelled = !narrow || base % 20 === 0;
      if (mid && !major && clear && (i % 10 > 3 || !labelled)) ctx.fillRect(Math.round(x) - 2, height - 22, 4, 3);
      if (major && i < steps && clear && (!narrow || i % 20 === 0)) ctx.fillText(`${i / 2}`, Math.round(x) + 5, height - 14);
    }
    if (progress >= 1 && labelW) {
      ctx.fillText(label, width - labelW + 24, height - 14);
    }
  }
  function drawRulerY(progress) {
    const c = document.querySelector(".ruler-y");
    if (!c) return;
    const { ctx, width, height } = fit(c);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = INK;
    ctx.font = MONO;
    const xw = document.querySelector(".ruler-x").getBoundingClientRect().width;
    const pxPerHalf = xw / (FLOOR_M * 2);
    const steps = Math.floor(height / pxPerHalf);
    const shown = Math.round(steps * progress);
    for (let i = 0; i <= shown; i++) {
      const y = Math.min(height - 1, i * pxPerHalf);
      const major = i % 10 === 0;
      const h = major ? 12 : i % 2 === 0 ? 7 : 4;
      ctx.fillRect(width - h, Math.round(y), h, 1);
      if (major && i > 0 && i < steps && width > 20) {
        ctx.save();
        ctx.translate(width - 15, Math.round(y) - 4);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(`${i / 2}`, 0, 0);
        ctx.restore();
      }
    }
  }

  // Days chart: crew against standard rules, the gap screened in halftone.
  function drawChart() {
    const c = document.getElementById("days-chart");
    if (!c) return;
    const { ctx, width, height } = fit(c);
    ctx.clearRect(0, 0, width, height);
    const pad = { l: 40, r: 12, t: 12, b: 30 };
    const lo = 270, hi = 310;
    const x = (i) => pad.l + (i + 0.5) * ((width - pad.l - pad.r) / RULES.length);
    const y = (v) => pad.t + (1 - (v - lo) / (hi - lo)) * (height - pad.t - pad.b);
    ctx.font = MONO;
    ctx.fillStyle = INK;
    ctx.strokeStyle = "rgba(20,20,20,0.28)";
    ctx.lineWidth = 1;
    for (let v = lo; v <= hi; v += 10) {
      ctx.beginPath();
      ctx.moveTo(pad.l, Math.round(y(v)) + 0.5);
      ctx.lineTo(width - pad.r, Math.round(y(v)) + 0.5);
      ctx.stroke();
      ctx.fillText(String(v), 0, y(v) + 4);
    }
    const colW = (width - pad.l - pad.r) / RULES.length;
    RULES.forEach((r, i) => {
      const cx = x(i);
      // halftone screen between standard rules and crew: dots grow toward the crew mark
      const top = y(CREW[i]);
      const bottom = y(r);
      const half = Math.min(colW * 0.32, 22);
      for (let yy = top + 6; yy < bottom - 4; yy += 5) {
        const t = 1 - (yy - top) / Math.max(1, bottom - top);
        const rad = 0.5 + t * 1.7;
        for (let xx = cx - half; xx <= cx + half; xx += 5) {
          ctx.beginPath();
          ctx.arc(xx + ((yy / 5) % 2 ? 2.5 : 0), yy, rad, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.beginPath();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = INK;
      ctx.arc(cx, bottom, 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, top, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText(`${i + 1}`, cx - 4, height - 8);
    });
  }

  // Pin the coordinate chip at its point on the shared metre scale.
  function placeChip() {
    const chip = document.querySelector(".chip-coord");
    const plate = document.querySelector(".plate");
    if (!chip || !plate) return;
    const pxPerM = plate.getBoundingClientRect().width / FLOOR_M;
    chip.style.left = `${Number(chip.dataset.x) * pxPerM}px`;
    chip.style.top = `${Number(chip.dataset.y) * pxPerM}px`;
  }
  placeChip();

  function drawAll(p = 1) {
    drawRulerX(p);
    drawRulerY(p);
  }

  const start = () => {
    drawChart();
    if (reduce) {
      drawAll(1);
      root.classList.remove("pre");
      return;
    }
    drawAll(0);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => root.classList.remove("pre"));
      const t0 = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - t0) / 700);
        drawAll(expo(t));
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  };

  (document.fonts ? document.fonts.ready : Promise.resolve()).then(start);

  let raf = 0;
  addEventListener("resize", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      drawAll(1);
      drawChart();
      placeChip();
    });
  });
})();
