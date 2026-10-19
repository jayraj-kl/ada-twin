(() => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const expo = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
  const MONO = '400 11px "Chivo Mono", monospace';

  // Readout settle, prepared before first paint: each visible value starts as zeros.
  // The real value sits in a screen-reader twin that is never animated.
  const settleItems = reduce ? [] : [...document.querySelectorAll("[data-settle]")];
  const finals = settleItems.map((el) => el.textContent);
  settleItems.forEach((el, i) => {
    el.textContent = finals[i].replace(/[^\s]/g, "0");
    el.classList.add("settling");
  });

  // Sample run: batches per shift over seeds 1 to 10 (illustrative).
  const RULES = [284, 279, 291, 276, 288, 282, 280, 293, 277, 285];
  const CREW = [297, 290, 301, 288, 299, 294, 289, 305, 286, 296];
  const body = document.getElementById("days-body");
  if (body) {
    body.innerHTML = RULES.map(
      (r, i) => `<tr><th scope="row">${i + 1}</th><td>${i + 1}</td><td>${r}</td><td>${CREW[i]}</td></tr>`,
    ).join("");
  }

  // Ranked gains drawn as runs of digits, one per batch.
  document.querySelectorAll(".digits").forEach((el) => {
    const n = Number(getComputedStyle(el).getPropertyValue("--n")) || 0;
    el.textContent = "1".repeat(n);
  });

  function fit(canvas) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: r.width, h: r.height };
  }

  // Beside each step, its own figures written in binary, joined by one rising hairline.
  // Capture: 3 files. Twin: 8 places on the boiler-room flow. Scenario: 34 °C, 340 demand,
  // 300 target. Agents: 3. Results: 10 days, up to 60. New plant: gains 19, 8, 5, 3 (sample run).
  const FIGURES = [[3], [8], [34, 340, 300], [3], [10, 60], [19, 8, 5, 3]];
  function drawStream() {
    const c = document.querySelector(".stream");
    if (!c || !c.offsetParent) return;
    const { ctx, w, h } = fit(c);
    ctx.clearRect(0, 0, w, h);
    ctx.font = MONO;
    ctx.textBaseline = "top";
    const top = c.getBoundingClientRect().top;
    const rows = [...document.querySelectorAll(".step-list li")];
    const anchors = rows.map((li) => li.getBoundingClientRect().top - top + 30);
    const last = rows.length ? rows[rows.length - 1].getBoundingClientRect().bottom - top : h;
    ctx.fillStyle = "rgba(163,195,189,0.45)";
    ctx.fillRect(w - 1, anchors[0] ?? 0, 1, Math.max(0, last - (anchors[0] ?? 0) - 30));
    anchors.forEach((y, i) => {
      (FIGURES[i] || []).forEach((n, k) => {
        const bits = n.toString(2);
        ctx.fillStyle = k === 0 ? "#e4efec" : "rgba(163,195,189,0.85)";
        ctx.fillText(bits, w - 8 - ctx.measureText(bits).width, y + k * 15);
      });
    });
  }

  // Shift ticks: every 30-minute check-in across an 8-hour shift.
  function drawTicks() {
    const c = document.querySelector(".track-ticks");
    if (!c || !c.offsetParent) return;
    const { ctx, w, h } = fit(c);
    ctx.clearRect(0, 0, w, h);
    ctx.font = MONO;
    for (let i = 0; i <= 16; i++) {
      const x = Math.min(w - 1, (i / 16) * w);
      const hour = i % 4 === 0;
      ctx.fillStyle = hour ? "#e4efec" : "rgba(163,195,189,0.7)";
      ctx.fillRect(Math.round(x), h - (hour ? 14 : 7), 1, hour ? 14 : 7);
      if (hour) {
        const label = `${String(6 + i / 2).padStart(2, "0")}:00`;
        const tw = ctx.measureText(label).width;
        ctx.fillText(label, Math.min(Math.max(0, x - tw / 2), w - tw), h - 20);
      }
    }
  }

  // Readout settle: each value resolves out of amber binary digits, left to right.
  function settle() {
    if (!settleItems.length) return;
    let seed = 1;
    const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    const t0 = performance.now();
    const step = (now) => {
      let done = true;
      settleItems.forEach((el, i) => {
        const t = Math.max(0, Math.min(1, (now - t0 - i * 60) / 650));
        if (t < 1) done = false;
        const shown = Math.floor(expo(t) * finals[i].length);
        let s = finals[i].slice(0, shown);
        for (let k = shown; k < finals[i].length; k++) {
          s += finals[i][k] === " " ? " " : rand() > 0.5 ? "1" : "0";
        }
        el.textContent = t >= 1 ? finals[i] : s;
        if (t >= 1) el.classList.remove("settling");
      });
      if (!done) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  const ready = document.fonts ? document.fonts.ready : Promise.resolve();
  ready.then(() => {
    drawStream();
    drawTicks();
    settle();
  });

  let raf = 0;
  addEventListener("resize", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      drawStream();
      drawTicks();
    });
  });
})();
