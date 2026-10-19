(() => {
  const root = document.documentElement;

  // Sample run: batches per shift on seeds 1 to 10 (illustrative).
  const RULES = [284, 279, 291, 276, 288, 282, 280, 293, 277, 285];
  const CREW = [297, 290, 301, 288, 299, 294, 289, 305, 286, 296];
  const body = document.getElementById("plate-body");
  if (body) {
    body.innerHTML = RULES.map(
      (r, i) => `<tr><th scope="row">${i + 1}</th><td>${r}</td><td>${CREW[i]}</td></tr>`,
    ).join("");
  }

  // The six stations sit on one traced orbit, like a motion study's light path.
  const NS = "http://www.w3.org/2000/svg";
  function drawOrbit() {
    const wrap = document.querySelector(".orbit-wrap");
    const svg = wrap && wrap.querySelector(".orbit-path");
    if (!svg) return;
    const box = wrap.getBoundingClientRect();
    const items = [...wrap.querySelectorAll(".stations h3")];
    const ys = items.map((h) => {
      const r = h.getBoundingClientRect();
      return r.top - box.top + r.height * 0.55;
    });
    const h = box.height;
    const pad = parseFloat(getComputedStyle(wrap).paddingLeft);
    const rx = Math.max(24, pad - 28);
    const cx = 6;
    const top = Math.min(...ys) - 40;
    const bottom = Math.max(...ys) + 40;
    const cy = (top + bottom) / 2;
    const ry = (bottom - top) / 2;
    svg.setAttribute("viewBox", `0 0 ${box.width} ${h}`);
    svg.querySelectorAll("circle").forEach((c) => c.remove());
    // the near half of an ellipse whose far side runs off the panel edge
    svg.querySelector("path").setAttribute(
      "d",
      `M ${cx} ${top} A ${rx} ${ry} 0 0 1 ${cx} ${bottom}`,
    );
    ys.forEach((y) => {
      const t = Math.max(-1, Math.min(1, (y - cy) / ry));
      const x = cx + rx * Math.sqrt(1 - t * t);
      const c = document.createElementNS(NS, "circle");
      c.setAttribute("cx", x.toFixed(1));
      c.setAttribute("cy", y.toFixed(1));
      c.setAttribute("r", "5");
      svg.appendChild(c);
    });
  }

  (document.fonts ? document.fonts.ready : Promise.resolve()).then(() => {
    drawOrbit();
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("pre")));
  });

  let raf = 0;
  addEventListener("resize", () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(drawOrbit);
  });
})();
