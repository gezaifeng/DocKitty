// vendor/hairline/package/dist/index.js
var LIGHT = { plate: "#ffffff", hi: "#232327", edge: "#a4a4ac", mid: "#c3c3c9", lo: "#e0e0e4" };
var DARK = { plate: "#08090a", hi: "#d0d6e0", edge: "#5b5d64", mid: "#3e3e44", lo: "#29292d" };
var KEYS = ["plate", "hi", "edge", "mid", "lo"];
var vars = (p) => KEYS.map((k) => `--hl-${k}:var(--hairline-${k},${p[k]});`).join("");
var EASE = "cubic-bezier(0.5,0,0.1,1)";
var SVG = ":where([data-hairline]>svg)";
function css(lightDark) {
  const both = Object.fromEntries(KEYS.map((k) => [k, `light-dark(${LIGHT[k]},${DARK[k]})`]));
  return [
    // the box, and the palette: light unless something below says otherwise
    `:where([data-hairline]){display:block;position:relative;aspect-ratio:5/4;touch-action:pan-y;user-select:none;-webkit-user-select:none;--hl-sw:var(--hairline-stroke,0.9);${vars(LIGHT)}}`,
    // the page's color-scheme
    lightDark ? `:where([data-hairline]){${vars(both)}}` : "",
    // an ancestor that says dark
    `:where(.dark,[data-theme="dark"]) :where([data-hairline]){${vars(DARK)}}`,
    // the figure's own theme option
    `:where([data-hairline][data-hairline-theme="light"]){${vars(LIGHT)}}`,
    `:where([data-hairline][data-hairline-theme="dark"]){${vars(DARK)}}`,
    `:where([data-hairline]:focus-visible){outline:1.5px solid var(--hl-hi);outline-offset:2px}`,
    `${SVG}{position:absolute;inset:0;width:100%;height:100%;display:block}`,
    // Riffle's live region: read, not seen
    `:where([data-hairline]>[data-hairline-live]){position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}`,
    // the drawing: plates are filled with the plate colour and painted back to front
    `${SVG} :where(path,polygon,ellipse,line){fill:var(--hl-plate);stroke:var(--hl-mid);stroke-width:var(--hl-sw);vector-effect:non-scaling-stroke;stroke-linejoin:round;stroke-linecap:round;transition:stroke 260ms ${EASE}}`,
    `${SVG} :where(.nf){fill:none}`,
    `${SVG} :where(.fo){stroke:none}`,
    `${SVG} :where(.sil){stroke:var(--hl-edge)}`,
    `${SVG} :where(.hi){stroke:var(--hl-hi)}`,
    `${SVG} :where(.lo){stroke:var(--hl-lo)}`,
    `${SVG} :where(.dash){stroke-dasharray:1 3}`,
    `${SVG} :where(.dot){stroke:none;fill:var(--hl-hi);transition:fill 260ms ${EASE}}`,
    `${SVG} :where(.dot.m){fill:var(--hl-edge)}`,
    `${SVG} :where(.dot.off){fill:var(--hl-lo)}`,
    `${SVG} :where(.ghost path){fill:none;stroke:var(--hl-mid)}`
  ].join("");
}
var done = /* @__PURE__ */ new WeakSet();
function inject(root) {
  if (done.has(root)) return;
  done.add(root);
  const doc = root.nodeType === 9 ? root : root.ownerDocument;
  const win = doc.defaultView;
  const text = css(!!win?.CSS?.supports?.("color", "light-dark(#000,#fff)"));
  if (win && "adoptedStyleSheets" in root) {
    try {
      const sheet = new win.CSSStyleSheet();
      sheet.replaceSync(text);
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
      return;
    } catch {
    }
  }
  const style = doc.createElement("style");
  style.setAttribute("data-hairline-style", "");
  style.textContent = text;
  (root.nodeType === 9 ? doc.head ?? doc.documentElement : root).appendChild(style);
}
var clamp = (v, a, b) => Math.max(a, Math.min(b, v));
var lerp = (a, b, t) => a + (b - a) * t;
var rad = (d) => d * Math.PI / 180;
var r2 = (n) => Math.round(n * 100) / 100;
var poly = (pts) => "M" + pts.map((p) => r2(p[0]) + " " + r2(p[1])).join("L") + "Z";
var seg = (a, b) => `M${r2(a[0])} ${r2(a[1])}L${r2(b[0])} ${r2(b[1])}`;
var open = (pts) => pts.length < 2 ? "" : "M" + pts.map((p) => r2(p[0]) + " " + r2(p[1])).join("L");
var Cam = (azDeg, k, S9) => ({ az: rad(azDeg), k, S: S9, ox: 0, oy: 0 });
function proj(C) {
  const c = Math.cos(C.az), s = Math.sin(C.az), zf = Math.sqrt(1 - C.k * C.k);
  return (x, y, z) => {
    const X = x * c - y * s, Y = x * s + y * c;
    return [C.ox + C.S * X, C.oy + C.S * (Y * C.k - z * zf)];
  };
}
function fit(C, pts, cx, cy) {
  C.ox = 0;
  C.oy = 0;
  const P = proj(C);
  let a = 1e9, b = -1e9, c = 1e9, d = -1e9;
  for (const p of pts) {
    const q = P(p[0], p[1], p[2]);
    a = Math.min(a, q[0]);
    b = Math.max(b, q[0]);
    c = Math.min(c, q[1]);
    d = Math.max(d, q[1]);
  }
  C.ox = cx - (a + b) / 2;
  C.oy = cy - (c + d) / 2;
}
function rrect(u0, v0, u1, v1, r, n = 4) {
  r = Math.max(0, Math.min(r, (u1 - u0) / 2, (v1 - v0) / 2));
  const out = [];
  for (const [cu, cv, a0] of [[u1 - r, v1 - r, 0], [u0 + r, v1 - r, 90], [u0 + r, v0 + r, 180], [u1 - r, v0 + r, 270]])
    for (let k = 0; k <= n; k++) {
      const a = rad(a0 + 90 * k / n), ca = Math.cos(a), sa = Math.sin(a);
      out.push({ u: cu + r * ca, v: cv + r * sa, nu: ca, nv: sa });
    }
  return out;
}
function circ(R9, n = 96) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = k / n * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    out.push({ u: R9 * ca, v: R9 * sa, nu: ca, nv: sa });
  }
  return out;
}
function hull(input) {
  const pts = input.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const x = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of pts) {
    while (lo.length > 1 && x(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop();
    lo.push(p);
  }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (up.length > 1 && x(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop();
    up.push(p);
  }
  lo.pop();
  up.pop();
  return lo.concat(up);
}
var ringAt = (P, ring, z) => ring.map((q) => P(q.u, q.v, z));
var facing = (C) => {
  const s = Math.sin(C.az), c = Math.cos(C.az);
  return (q) => q.nu * s + q.nv * c >= -1e-6;
};
function run(ring, keep) {
  const n = ring.length;
  let s = -1;
  for (let i = 0; i < n; i++) if (keep(ring[i]) && !keep(ring[(i + n - 1) % n])) {
    s = i;
    break;
  }
  if (s < 0) return keep(ring[0]) ? ring.slice() : [];
  const out = [];
  for (let k = 0; k < n && keep(ring[(s + k) % n]); k++) out.push(ring[(s + k) % n]);
  return out;
}
function prism(P, front2, ring, inner3, z0, z1) {
  return {
    sil: poly(hull(ringAt(P, ring, z1).concat(ringAt(P, ring, z0)))),
    crease: inner3 ? open(ringAt(P, run(inner3, front2), z1)) : ""
  };
}
var rings = (x0, y0, x1, y1, r, b) => [
  rrect(x0, y0, x1, y1, r),
  rrect(x0 + b, y0 + b, x1 - b, y1 - b, Math.max(0.3, r - b))
];
function fillet(pts, rs, n = 4) {
  const m = pts.length, out = [];
  for (let i = 0; i < m; i++) {
    const a = pts[(i + m - 1) % m], p = pts[i], b = pts[(i + 1) % m];
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const t = Math.min(rs[i], la / 2, lb / 2);
    const p1 = [p[0] + (a[0] - p[0]) / la * t, p[1] + (a[1] - p[1]) / la * t];
    const p2 = [p[0] + (b[0] - p[0]) / lb * t, p[1] + (b[1] - p[1]) / lb * t];
    for (let k = 0; k <= n; k++) {
      const s = k / n, w = 1 - s;
      out.push([w * w * p1[0] + 2 * w * s * p[0] + s * s * p2[0], w * w * p1[1] + 2 * w * s * p[1] + s * s * p2[1]]);
    }
  }
  return out;
}
function ghost(P, front2, ring, z0, depth2) {
  const f = run(ring, front2), lowP = ringAt(P, f, z0 - depth2);
  return {
    d: open(lowP) + [f[0], f[f.length - 1]].map((q) => seg(P(q.u, q.v, z0), P(q.u, q.v, z0 - depth2))).join(""),
    y0: Math.min(...ringAt(P, f, z0).map((p) => p[1])),
    y1: Math.max(...lowP.map((p) => p[1])) + 2
  };
}
var reduced = false;
var setReducedMotion = (on) => {
  reduced = on;
};
var reducedMotion = () => reduced;
function spring(x, o = {}) {
  return { x, v: 0, t: x, k: o.k ?? 100, c: o.c ?? 18, m: o.m ?? 1, eps: o.eps ?? 0.01 };
}
function stepS(sp, dt) {
  if (reduced) {
    sp.x = sp.t;
    sp.v = 0;
    return false;
  }
  const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
  for (let i = 0; i < n; i++) {
    const a = (-sp.k * (sp.x - sp.t) - sp.c * sp.v) / sp.m;
    sp.v += a * h;
    sp.x += sp.v * h;
  }
  if (Math.abs(sp.x - sp.t) < sp.eps && Math.abs(sp.v) < sp.eps * 10) {
    sp.x = sp.t;
    sp.v = 0;
    return false;
  }
  return true;
}
function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax2 = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (u) => ((ax2 * u + bx) * u + cx) * u;
  const Y = (u) => ((ay * u + by) * u + cy) * u;
  const dX = (u) => (3 * ax2 * u + 2 * bx) * u + cx;
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let u = t;
    for (let i = 0; i < 8; i++) {
      const e = X(u) - t;
      if (Math.abs(e) < 1e-5) break;
      const d = dX(u);
      if (Math.abs(d) < 1e-6) break;
      u -= e / d;
    }
    if (!(u >= 0 && u <= 1) || Math.abs(X(u) - t) > 1e-4) {
      let lo = 0, hi = 1;
      u = t;
      for (let i = 0; i < 24; i++) {
        if (X(u) < t) lo = u;
        else hi = u;
        u = (lo + hi) / 2;
      }
    }
    return Y(u);
  };
}
var EASE_LIFT = bezier(0.32, 0.72, 0, 1);
var tween = (v, dur = 700) => ({ from: v, to: v, t0: -1e9, dur });
var tval = (tw, now) => {
  const p = clamp((now - tw.t0) / tw.dur, 0, 1);
  return tw.from + (tw.to - tw.from) * (reduced ? 1 : EASE_LIFT(p));
};
var tset = (tw, to, now, delay) => {
  if (tw.to === to) return;
  tw.from = tval(tw, now);
  tw.to = to;
  tw.t0 = now + delay;
};
var tdone = (tw, now) => reduced || now >= tw.t0 + tw.dur;
var NS = "http://www.w3.org/2000/svg";
function mk(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  if (attrs) for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  if (parent) parent.appendChild(e);
  return e;
}
function solid(parent) {
  const g = mk("g", {}, parent);
  return { g, sil: mk("path", { class: "sil" }, g), cr: mk("path", { class: "nf lo" }, g) };
}
var put = (el, s) => {
  el.sil.setAttribute("d", s.sil);
  el.cr.setAttribute("d", s.crease);
};
var flatDot = (parent, C, r, cls) => mk("ellipse", { rx: r2(r * C.S), ry: r2(r * C.S * C.k), class: cls }, parent);
var place = (el, q) => {
  el.setAttribute("cx", String(r2(q[0])));
  el.setAttribute("cy", String(r2(q[1])));
};
var fid = 0;
function fade(svg, y0, y1, a0 = 0.7) {
  const id = "hl-fd" + ++fid, defs = mk("defs", {}, svg);
  const lg = mk("linearGradient", { id: id + "g", gradientUnits: "userSpaceOnUse", x1: 0, y1: r2(y0), x2: 0, y2: r2(y1) }, defs);
  mk("stop", { offset: 0, "stop-color": "#fff", "stop-opacity": a0 }, lg);
  mk("stop", { offset: 1, "stop-color": "#fff", "stop-opacity": 0 }, lg);
  const m = mk("mask", { id, maskUnits: "userSpaceOnUse", x: 0, y: 0, width: 400, height: 320 }, defs);
  mk("rect", { x: 0, y: 0, width: 400, height: 320, fill: `url(#${id}g)` }, m);
  return `url(#${id})`;
}
function reflect(svg, parent, P, front2, ring, z0, depth2) {
  const r = ghost(P, front2, ring, z0, depth2);
  const gh = mk("g", { class: "ghost", mask: fade(svg, r.y0, r.y1) }, parent);
  mk("path", { d: r.d }, gh);
}
var boards = [];
var byStage = /* @__PURE__ */ new Map();
var raf = 0;
var last = 0;
var io = null;
var rm = null;
function frame(now) {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1e3));
  last = now;
  let any = false;
  for (const b of boards.slice()) if (b.vis && b.awake) {
    try {
      b.awake = !!b.tick(dt, now);
    } catch (err) {
      b.awake = false;
      setTimeout(() => {
        throw err;
      });
    }
    any = any || b.awake;
  }
  raf = any ? requestAnimationFrame(frame) : 0;
}
function wake(b) {
  b.awake = true;
  if (!raf) {
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
}
var onMotion = () => {
  setReducedMotion(!!rm?.matches);
  boards.forEach(wake);
};
function start() {
  if (io) return;
  io = new IntersectionObserver((es) => {
    for (const e of es) {
      const set = byStage.get(e.target);
      if (!set) continue;
      for (const b of set) {
        b.vis = e.isIntersecting;
        if (b.vis) wake(b);
      }
    }
  }, { rootMargin: "80px" });
  rm = matchMedia("(prefers-reduced-motion: reduce)");
  setReducedMotion(rm.matches);
  rm.addEventListener("change", onMotion);
}
function stop() {
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
  io?.disconnect();
  io = null;
  rm?.removeEventListener("change", onMotion);
  rm = null;
}
function register(stage, tick) {
  start();
  const b = { stage, tick, vis: false, awake: true };
  boards.push(b);
  const peers = byStage.get(stage);
  if (peers) {
    for (const p of peers) b.vis = p.vis;
    peers.add(b);
    if (b.vis) wake(b);
  } else {
    byStage.set(stage, /* @__PURE__ */ new Set([b]));
    io.observe(stage);
  }
  tick(0, performance.now());
  let gone = false;
  return {
    wake: () => {
      if (!gone) wake(b);
    },
    unregister: () => {
      if (gone) return;
      gone = true;
      boards = boards.filter((x) => x !== b);
      const set = byStage.get(stage);
      if (set) {
        set.delete(b);
        if (!set.size) {
          byStage.delete(stage);
          io?.unobserve(stage);
        }
      }
      if (!boards.length) stop();
    }
  };
}
var handlers = /* @__PURE__ */ new WeakMap();
var touring = /* @__PURE__ */ new WeakMap();
function pointer(stage, on) {
  handlers.set(stage, on);
  let tm = 0;
  const pt = (e) => {
    const r = stage.getBoundingClientRect();
    return [(e.clientX - r.left) / r.width * 400, (e.clientY - r.top) / r.height * 320];
  };
  const move = (e) => {
    clearTimeout(tm);
    touring.get(stage)?.hold();
    on.move(pt(e), e);
  };
  const down = (e) => {
    clearTimeout(tm);
    touring.get(stage)?.hold();
    if (e.pointerType !== "mouse") stage.releasePointerCapture?.(e.pointerId);
    if (on.down) on.down(pt(e), e);
    else on.move(pt(e), e);
  };
  const leave = (e) => {
    clearTimeout(tm);
    tm = window.setTimeout(() => {
      on.leave(e);
      touring.get(stage)?.release();
    }, e.pointerType === "mouse" ? 0 : 1400);
  };
  stage.addEventListener("pointermove", move);
  stage.addEventListener("pointerdown", down);
  stage.addEventListener("pointerleave", leave);
  return () => {
    clearTimeout(tm);
    if (handlers.get(stage) === on) handlers.delete(stage);
    stage.removeEventListener("pointermove", move);
    stage.removeEventListener("pointerdown", down);
    stage.removeEventListener("pointerleave", leave);
  };
}
var LAP = [[128, 150], [200, 118], [272, 150], [200, 206], null];
var TRAVEL = 900;
var DWELL = 1200;
var REST = 1800;
var RESUME = 1200;
var STAGGER = 450;
var GHOST = { pointerType: "ghost" };
var started = 0;
function entry([x, y]) {
  const dx = x - 200, dy = y - 160;
  if (!dx && !dy) return [200, 320];
  const k = Math.min(dx ? (dx > 0 ? 200 : -200) / dx : Infinity, dy ? (dy > 0 ? 160 : -160) / dy : Infinity);
  return [200 + dx * k, 160 + dy * k];
}
function tour(stage, stops, onStop) {
  let i = 0;
  let wait = RESUME + STAGGER * (started++ % 4);
  let t = -1;
  let at2 = null;
  let origin = [200, 320];
  let hand = false, keys2 = stage.contains(stage.ownerDocument.activeElement);
  let gone = false;
  const leave = () => {
    at2 = null;
    t = -1;
    handlers.get(stage)?.leave(GHOST);
  };
  const tick = (dt) => {
    if (hand || keys2 || !stops.length) return false;
    if (reducedMotion()) {
      if (at2) leave();
      return false;
    }
    if (wait > 0) {
      wait -= dt * 1e3;
      return true;
    }
    const stop2 = stops[i];
    if (stop2 === null) {
      if (at2) leave();
      onStop?.(i);
      i = (i + 1) % stops.length;
      wait = REST;
      return true;
    }
    const h = handlers.get(stage);
    if (!h) return true;
    if (t < 0) {
      origin = at2 ?? entry(stop2);
      t = 0;
    }
    t = Math.min(TRAVEL, t + dt * 1e3);
    const k = EASE_LIFT(t / TRAVEL);
    at2 = [origin[0] + (stop2[0] - origin[0]) * k, origin[1] + (stop2[1] - origin[1]) * k];
    h.move(at2, GHOST);
    if (t < TRAVEL) return true;
    onStop?.(i);
    i = (i + 1) % stops.length;
    t = -1;
    wait = DWELL;
    return true;
  };
  const take = () => {
    at2 = null;
    t = -1;
  };
  const give = () => {
    if (hand || keys2) return;
    i = 0;
    t = -1;
    wait = RESUME;
    board.wake();
  };
  const me = {
    hold: () => {
      hand = true;
      take();
    },
    release: () => {
      if (!hand) return;
      hand = false;
      give();
    }
  };
  const focusIn = () => {
    keys2 = true;
    take();
  };
  const focusOut = (e) => {
    if (keys2 && !stage.contains(e.relatedTarget)) {
      keys2 = false;
      give();
    }
  };
  stage.addEventListener("focusin", focusIn);
  stage.addEventListener("focusout", focusOut);
  touring.set(stage, me);
  const board = register(stage, tick);
  return {
    stop: () => {
      if (gone) return;
      gone = true;
      board.unregister();
      stage.removeEventListener("focusin", focusIn);
      stage.removeEventListener("focusout", focusOut);
      if (touring.get(stage) === me) touring.delete(stage);
      if (at2) leave();
    }
  };
}
function disposer() {
  let fns = [];
  return {
    add: (fn) => {
      fns.push(fn);
    },
    on: (target, type, fn, opts) => {
      const h = fn;
      target.addEventListener(type, h, opts);
      fns.push(() => target.removeEventListener(type, h, opts));
    },
    dispose: () => {
      const run2 = fns;
      fns = [];
      for (let i = run2.length - 1; i >= 0; i--) run2[i]();
    }
  };
}
var TABLE = {
  riffle: [0, 40, 90],
  // stagger, ms
  terrain: [1.5, 3, 5],
  // radius, cells
  exploded: [12, 28, 40],
  // gap, viewBox units
  phosphor: [150, 520, 1500],
  // afterglow, ms
  slow: [0.6, 0.2, 0.05],
  // rate, × normal speed
  turntable: [200, 650, 1500],
  // coast, ms
  keyboard: [1, 2, 3.5],
  // radius, keys
  elevator: [40, 100, 220],
  // stiffness, spring units
  phone: [16, 28, 40],
  // gap, viewBox units
  laptop: [100, 125, 150],
  // lid, degrees
  terminal: [1, 2, 3.5],
  // spread, lines
  cabinet: [1.5, 3, 5],
  // reach, blades
  branches: [1, 3, 6],
  // reach, commits
  vault: [250, 600, 1500],
  // coast, ms
  lockers: [55, 90, 120],
  // opening, degrees
  padlock: [45, 90, 100],
  // swing, degrees
  patch: [1, 2.5, 5],
  // radius, ports
  dish: [30, 50, 70],
  // reach, degrees
  router: [0.5, 1.5, 3],
  // spread, antennas
  loupe: [1.3, 1.8, 2.6],
  // magnification, ×
  sieve: [6, 14, 24],
  // gap, viewBox units
  rail: [1, 2, 3.5],
  // radius, hangers
  plug: [0.35, 0.6, 0.9],
  // pull, fraction of the way to the socket
  query: [20, 40, 55],
  // turn, degrees; past 55 the hook folds over itself and stops reading as one
  drawer: [12, 22, 34],
  // pull, viewBox units
  basket: [8, 16, 28],
  // tilt, degrees
  plot: [3, 6, 12],
  // lift, viewBox units
  hub: [10, 16, 24],
  // rise, viewBox units
  relay: [40, 120, 220],
  // delay, ms per hop
  settle: [90, 120, 150],
  // reach, viewBox units from the hub
  format: [9, 12, 14],
  // disorder, degrees of the worst skew
  rebuild: [8, 14, 20],
  // rise, viewBox units
  stack: [22, 34, 46]
  // lift, viewBox units
};
var DEFAULT = 0.5;
function intensity(value) {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) return DEFAULT;
  return Math.min(1, Math.max(0, n));
}
function parameter(figure, value) {
  const [lo, mid, hi] = TABLE[figure];
  const i = intensity(value);
  const v = i <= 0.5 ? lo + i / 0.5 * (mid - lo) : mid + (i - 0.5) / 0.5 * (hi - mid);
  return Math.round(v * 1e3) / 1e3;
}
var NS2 = "http://www.w3.org/2000/svg";
var mounted = /* @__PURE__ */ new WeakMap();
var report = (err) => {
  if (typeof reportError === "function") reportError(err);
  else setTimeout(() => {
    throw err;
  });
};
function create(spec, el, options) {
  if (typeof document === "undefined") {
    throw new Error(`hairline: ${spec.id}() needs a DOM. Call it in the browser, once the element exists: in an effect, in onMount, or in a script after the element.`);
  }
  if (!el || el.nodeType !== 1) {
    throw new TypeError(`hairline: ${spec.id}() takes an element as its first argument, and got ${el === null ? "null" : typeof el}.`);
  }
  mounted.get(el)?.();
  const opts = { ...options };
  const doc = el.ownerDocument;
  const root = el.getRootNode();
  inject(root.nodeType === 9 || "host" in root ? root : doc);
  const owned = /* @__PURE__ */ new Set();
  const attr = (name, value2) => {
    if (!owned.has(name) && el.hasAttribute(name)) return;
    if (value2 === null) {
      el.removeAttribute(name);
      owned.delete(name);
    } else {
      el.setAttribute(name, value2);
      owned.add(name);
    }
  };
  const dress = () => {
    attr("data-hairline-theme", opts.theme === "light" || opts.theme === "dark" ? opts.theme : null);
    attr("aria-label", el.hasAttribute("aria-labelledby") ? null : typeof opts.label === "string" ? opts.label : spec.label);
  };
  attr("data-hairline", spec.id);
  attr("role", spec.focusable ? "group" : "img");
  if (spec.focusable) attr("tabindex", "0");
  dress();
  const svg = doc.createElementNS(NS2, "svg");
  svg.setAttribute("viewBox", "0 0 400 320");
  svg.setAttribute("aria-hidden", "true");
  el.appendChild(svg);
  let live = null;
  if (spec.focusable) {
    live = doc.createElement("span");
    live.setAttribute("data-hairline-live", "");
    live.setAttribute("aria-live", "polite");
    el.appendChild(live);
  }
  let text = null;
  let playing = null;
  const read = {
    get textContent() {
      return text;
    },
    set textContent(value2) {
      const next = value2 ?? "";
      if (next === text) return;
      text = next;
      if (live && live.textContent !== next && (!playing || next === spec.rest || el.matches(":hover, :focus-within"))) live.textContent = next;
      const fn = opts.onRead;
      if (typeof fn === "function") try {
        fn(next);
      } catch (err) {
        report(err);
      }
    }
  };
  let value = parameter(spec.id, opts.intensity);
  playing = opts.play === true ? tour(el, spec.tour ?? LAP) : null;
  let engine;
  try {
    engine = spec.engine({ stage: el, svg, read }, value);
  } catch (err) {
    playing?.stop();
    throw err;
  }
  if (text === null) read.textContent = spec.rest;
  let dead = false;
  const destroy = () => {
    if (dead) return;
    dead = true;
    if (mounted.get(el) === destroy) mounted.delete(el);
    playing?.stop();
    playing = null;
    engine.destroy();
    svg.remove();
    live?.remove();
    for (const name of owned) el.removeAttribute(name);
    owned.clear();
  };
  mounted.set(el, destroy);
  return {
    update(next) {
      if (dead || !next) return;
      const own = opts, given = next;
      for (const k in given) {
        if (given[k] === void 0) delete own[k];
        else own[k] = given[k];
      }
      const v = parameter(spec.id, opts.intensity);
      if (v !== value) {
        value = v;
        engine.set(v);
      }
      const play = opts.play === true;
      if (play !== !!playing) {
        playing?.stop();
        playing = play ? tour(el, spec.tour ?? LAP) : null;
      }
      dress();
    },
    destroy
  };
}
var HH = 30;
var GRIP = 9;
var GRIPS = [[-GRIP, HH], [GRIP, HH]];
var D = 30;
var FY = 58;
var RT2 = 2.6;
var PH = 2.4;
var CH = 6;
var BX1 = 7 * D + 15;
var BY1 = FY + 14;
var ZTOP = RT2 + PH + CH;
var N2 = 12;
var U = 10.4;
var BH = 9.6;
var W = 84;
var EAR = 4;
var FT2 = 2;
var D2 = 44;
var OUT = 26;
var X0 = -10;
var X1 = W + 10;
var Z0 = 6;
var ZB = 11;
var ZT = ZB + (N2 - 1) * U + BH;
var H2 = ZT + 6;
var REST2 = [0, 0, 0.2, 0, 0, 0.3, 0.58, 0.26, 0, 0, 0.13, 0];
var LIT = 6;
var falloff = (u) => u >= 1 ? 0 : (1 - u) * (1 - u);
var inner = (q) => 0.375 * q.nu + 0.307 * q.nv > 0;
function slab(P, ring, inset2, y0, y1) {
  const at2 = (r, y) => r.map((q) => P(q.u, y, q.v));
  return { sil: poly(hull(at2(ring, y0).concat(at2(ring, y1)))), crease: inset2 ? open(at2(run(inset2, inner), y1)) : "" };
}
var mount3 = ({ stage, svg, read }, value) => {
  const bag = disposer();
  const C = Cam(45, 0.5, 1.5);
  const yo = D2 + FT2 + OUT;
  fit(C, [[X0, 0, 0], [X1, 0, H2], [X1, D2, 0], [X0, 0, H2], [-EAR, yo, ZB], [-EAR, yo, ZT], [W + EAR, yo, ZB]], 200, 166);
  const P = proj(C), front2 = facing(C);
  let R9 = value, over = null, lit2 = null;
  const g = mk("g", {}, svg);
  const [pr, pi] = rings(X0 + 3, 3, X1 - 3, D2 - 3, 3, 1.2);
  put(solid(g), prism(P, front2, pr, pi, 0, Z0));
  const [br, bi] = rings(X0, 0, X1, D2, 3.5, 1.6);
  put(solid(g), prism(P, front2, br, bi, Z0, H2));
  const onFront = (r) => r.map((q) => P(q.u, D2, q.v)), onSide = (r) => r.map((q) => P(X1, q.u, q.v));
  mk("path", { d: poly(onFront(rrect(-7.6, ZB - 2.2, W + 7.6, ZT + 2.2, 2, 4))) + poly(onSide(rrect(5, Z0 + 7, D2 - 5, H2 - 7, 3, 4))), class: "lo nf" }, g);
  for (let i = 0; i < N2; i++) for (const x of [-5.8, W + 5.8]) {
    place(mk("circle", { r: 0.75, class: "dot off" }, g), P(x, D2, ZB + i * U + BH / 2));
  }
  const blades = [];
  for (let i = 0; i < N2; i++) {
    const z = ZB + i * U, gi = mk("g", {}, g);
    blades.push({
      i,
      z,
      body: rrect(0, z + 0.4, W, z + BH - 0.4, 1.6, 4),
      face: rrect(-EAR, z, W + EAR, z + BH, 2, 4),
      faceIn: rrect(-EAR + 0.8, z + 0.8, W + EAR - 0.8, z + BH - 0.8, 1.2, 4),
      chassis: solid(gi),
      plate: solid(gi),
      marks: mk("path", { class: "lo nf" }, gi),
      lamp: mk("circle", { r: 1.1, class: "dot off" }, gi),
      sp: spring(OUT * REST2[i], { eps: 0.02 }),
      drawn: NaN
    });
  }
  function marks(b, y) {
    const z = b.z, F2 = (r) => poly(r.map((q) => P(q.u, y, q.v)));
    let d = F2(rrect(-3.4, z + 2, -1.2, z + BH - 2, 1, 3)) + F2(rrect(W + 1.2, z + 2, W + 3.4, z + BH - 2, 1, 3));
    for (let k = 0; k < 4; k++) d += F2(rrect(4 + k * 10.6, z + 2, 13.8 + k * 10.6, z + BH - 2, 1, 3));
    for (let k = 0; k < 8; k++) d += seg(P(50 + k * 2.6, y, z + 2.5), P(50 + k * 2.6, y, z + BH - 2.5));
    return d;
  }
  function drawBlade(b) {
    const o = b.sp.x;
    if (o === b.drawn) return;
    b.drawn = o;
    const yf = D2 + o + FT2, zm = b.z + BH / 2;
    const ch = slab(P, b.body, null, D2, D2 + o + 0.5);
    put(b.chassis, { sil: ch.sil, crease: seg(P(W, D2, zm), P(W, D2 + o, zm)) });
    put(b.plate, slab(P, b.face, b.faceIn, D2 + o, yf));
    b.marks.setAttribute("d", marks(b, yf));
    place(b.lamp, P(W - 5, yf, zm));
  }
  function light(b) {
    if (b === lit2) return;
    if (lit2) {
      lit2.plate.sil.classList.remove("hi");
      lit2.lamp.setAttribute("class", "dot off");
    }
    lit2 = b;
    lit2.plate.sil.classList.add("hi");
    lit2.lamp.setAttribute("class", "dot");
  }
  const B6 = register(stage, (dt) => {
    let m = false;
    for (const b of blades) {
      if (stepS(b.sp, dt)) m = true;
      drawBlade(b);
    }
    return m;
  });
  bag.add(B6.unregister);
  const o0 = P(0, 0, 0), E2 = [P(1, 0, 0), P(0, 1, 0), P(0, 0, 1)].map((p) => [p[0] - o0[0], p[1] - o0[1]]);
  function onPlane(p, axis, c) {
    const [a, k] = [0, 1, 2].filter((n) => n !== axis), ea = E2[a], ek = E2[k];
    const rx = p[0] - o0[0] - c * E2[axis][0], ry = p[1] - o0[1] - c * E2[axis][1], det = ea[0] * ek[1] - ea[1] * ek[0];
    const w = [0, 0, 0];
    w[axis] = c;
    w[a] = (rx * ek[1] - ry * ek[0]) / det;
    w[k] = (ea[0] * ry - ea[1] * rx) / det;
    return w;
  }
  function hit(p) {
    for (let i = N2 - 1; i >= 0; i--) {
      const q = onPlane(p, 1, D2 + FT2 + OUT * REST2[i]), z2 = (q[2] - ZB - BH / 2) / U;
      if (q[0] >= -EAR && q[0] <= W + EAR && Math.abs(z2 - i) <= 0.5) return z2;
    }
    const f = onPlane(p, 1, D2 + FT2), s = onPlane(p, 0, X1);
    let z = null;
    if (f[0] >= X0 - OUT - 4 && f[0] <= X1 && f[2] >= -OUT * 0.8 && f[2] <= H2) z = f[2];
    else if (s[1] >= 0 && s[1] <= D2 && s[2] >= 0 && s[2] <= H2 + 4) z = s[2];
    return z === null ? null : clamp((z - ZB - BH / 2) / U, 0, N2 - 1);
  }
  function retarget() {
    if (over === null) {
      for (const b of blades) b.sp.t = OUT * REST2[b.i];
      light(blades[LIT]);
      read.textContent = "rest";
    } else {
      for (const b of blades) b.sp.t = OUT * falloff(Math.max(0, Math.abs(b.i - over) - 0.5) / R9);
      const a = Math.round(over);
      light(blades[a]);
      read.textContent = "blade " + (a + 1);
    }
    B6.wake();
  }
  light(blades[LIT]);
  bag.add(pointer(stage, {
    move: (p) => {
      over = hit(p);
      retarget();
    },
    leave: () => {
      over = null;
      retarget();
    }
  }));
  bag.add(() => svg.replaceChildren());
  return {
    set: (v) => {
      R9 = v;
      if (over !== null) retarget();
    },
    destroy: bag.dispose
  };
};
var R = 26;
var FOC = 17;
var DEP = R * R / (4 * FOC);
var N3 = 3;
var W3 = 54;
var D3 = 60;
var Z02 = 5;
var M = 3;
var PITCH = 26;
var G = 1.6;
var FT3 = 2.4;
var T2 = 1.3;
var IN = 3.2;
var LOW = 2.2;
var HIGH = 3.6;
var DIV = 2.6;
var S2 = 2.1;
var ZB3 = Z02 + M;
var H3 = ZB3 + N3 * PITCH + M;
var REST4 = 0.7;
var inner2 = (q) => 0.375 * q.nu + 0.307 * q.nv > 0;
function slab2(P, ring, inset2, y0, y1) {
  const at2 = (r, y) => r.map((q) => P(q.u, y, q.v));
  return { sil: poly(hull(at2(ring, y0).concat(at2(ring, y1)))), crease: open(at2(run(inset2, inner2), y1)) };
}
var mount5 = ({ stage, svg, read }, value) => {
  const bag = disposer();
  const MAX2 = TABLE.drawer[2];
  const C = Cam(45, 0.5, S2);
  const out = D3 + MAX2 + FT3, ext = [[0, 0, 0], [W3, 0, 0], [0, 0, H3], [W3, 0, H3], [W3, D3, 0], [0, out, ZB3], [0, out, H3 - M], [W3, out, ZB3]];
  fit(C, ext.concat(ext.map(([x, y, z]) => [W3 - x, D3 - y, H3 - z])), 200, 166);
  const P = proj(C), front2 = facing(C);
  const g = mk("g", {}, svg);
  const [pr, pi] = rings(3, 3, W3 - 3, D3 - 3, 2.4, 1);
  put(solid(g), prism(P, front2, pr, pi, 0, Z02));
  const [cr, ci] = rings(0, 0, W3, D3, 3, 1.4);
  put(solid(g), prism(P, front2, cr, ci, Z02, H3));
  const x0 = M + IN, x1 = W3 - M - IN, xs = [x0 + (x1 - x0) / 3, x0 + 2 * (x1 - x0) / 3];
  const onFace = (r, y) => poly(r.map((q) => P(q.u, y, q.v)));
  mk("path", { class: "nf lo", d: Array.from({ length: N3 }, (_, k) => {
    const z = ZB3 + k * PITCH + G / 2;
    return onFace(rrect(x0 - 0.8, z + LOW - 0.8, x1 + 0.8, z + PITCH - G - HIGH + 1.4, 0.8, 2), D3);
  }).join("") }, g);
  const drawers = Array.from({ length: N3 }, (_, k) => {
    const z0 = ZB3 + k * PITCH + G / 2, z1 = z0 + PITCH - G, dg = mk("g", {}, g);
    const parts = [0, 1, 2, 3].map(() => mk("path", { class: "lo" }, dg));
    parts.push(mk("path", { class: "nf sil" }, dg));
    return { z0, z1, parts, front: solid(dg), pull: solid(dg), drawn: NaN };
  });
  const face = (d) => rrect(M, d.z0, W3 - M, d.z1, 1.6, 4), faceIn = (d) => rrect(M + 1, d.z0 + 1, W3 - M - 1, d.z1 - 1, 1, 4);
  const box = (a, b, y0, y1, z0, z1, r) => y1 - y0 < 0.05 ? "" : prism(P, front2, rrect(a, y0, b, y1, r, 3), null, z0, z1).sil;
  function draw(d, o) {
    if (o === d.drawn) return;
    d.drawn = o;
    const zb = d.z0 + LOW, zt = d.z1 - HIGH, yb = D3 + o, yf = yb + FT3;
    const [floor, left, divs, right, outline] = d.parts;
    floor.setAttribute("d", box(x0, x1, D3, yb, zb, zb + T2, 0.6));
    left.setAttribute("d", box(x0, x0 + T2, D3, yb, zb + T2, zt, 0.5));
    divs.setAttribute("d", xs.map((x) => box(x - 0.5, x + 0.5, D3, yb, zb + T2, zt - DIV, 0.4)).join(""));
    right.setAttribute("d", box(x1 - T2, x1, D3, yb, zb + T2, zt, 0.5));
    outline.setAttribute("d", box(x0, x1, D3, yb, zb, zt, 0.8));
    put(d.front, slab2(P, face(d), faceIn(d), yb, yf));
    const zp = (d.z0 + d.z1) / 2, xm = W3 / 2;
    const [br, bi] = rings(xm - 9, yf, xm + 9, yf + 2.6, 1.3, 0.6);
    put(d.pull, prism(P, front2, br, bi, zp - 1.3, zp + 1.3));
  }
  const tw = drawers.map(() => tween(0));
  const B6 = register(stage, (_dt, now) => {
    let m = false;
    drawers.forEach((d, k) => {
      draw(d, tval(tw[k], now));
      if (!tdone(tw[k], now)) m = true;
    });
    return m;
  });
  bag.add(B6.unregister);
  let pull = value, picked = -2;
  function choose(f, now) {
    if (f === picked) return;
    picked = f;
    const a = f < 0 ? 1 : f;
    tw.forEach((t, k) => tset(t, k === a ? f < 0 ? pull * REST4 : pull : 0, now, 0));
    drawers.forEach((d, k) => d.front.sil.classList.toggle("hi", k === a));
    read.textContent = f < 0 ? "rest" : `drawer ${N3 - f} \xB7 0`;
    B6.wake();
  }
  tw[1] = tween(pull * REST4);
  choose(-1, -1e9);
  drawers.forEach((d, k) => draw(d, tval(tw[k], 0)));
  const c = Math.cos(C.az), s = Math.sin(C.az), zf = Math.sqrt(1 - C.k * C.k);
  const onFront = (p, yf) => {
    const x = (p[0] - C.ox) / (C.S * c) + yf * s / c;
    return [x, ((x * s + yf * c) * C.k - (p[1] - C.oy) / C.S) / zf];
  };
  function pick(p) {
    for (let k = N3 - 1; k >= 0; k--) {
      const [x, z2] = onFront(p, D3 + FT3 + (k === 1 ? pull * REST4 : 0)), d = drawers[k];
      if (x >= M && x <= W3 - M && z2 >= d.z0 && z2 <= d.z1) return k;
    }
    const z = onFront(p, D3 + FT3)[1];
    return drawers.reduce((best, d, k) => Math.abs(z - (d.z0 + d.z1) / 2) < Math.abs(z - (drawers[best].z0 + drawers[best].z1) / 2) ? k : best, 0);
  }
  bag.add(pointer(stage, { move: (p) => choose(pick(p), performance.now()), leave: () => choose(-1, performance.now()) }));
  bag.add(() => svg.replaceChildren());
  return {
    set: (v) => {
      pull = v;
      const f = picked;
      picked = -2;
      choose(f, performance.now());
    },
    destroy: bag.dispose
  };
};
var SY = 34;
var FH = 36;
var CH2 = 25;
var TOP = 3 * FH + CH2 + 7;
var RX = 16.5;
var CW = [-8, 11, -2, 23];
var BASE = fillet([[-16, -2], [33, -2], [33, -56], [76, -56], [76, 38], [-16, 38]], [3, 2, 4, 6, 6, 6]);
var FLOOR = fillet([[33, -56], [72, -56], [72, -6], [43, -6], [43, 34], [33, 34]], [4, 4, 4, 3, 3, 3]);
var CWX = (CW[0] + CW[2]) / 2;
var SR = (RX - CWX) / 2;
var SC = [CWX + SR, SY / 2, TOP + 3 + SR + 2];
var REST_Z = 1.5 * FH - 4;
var G2 = 12;
var WD = 5.5;
var BY12 = 9 * G2 + WD + 8;
var LINES = [
  [0, 56, 0.3, -8, -2, 0],
  [1, 40, 0.75, 8, -1.9, 0],
  [1, 58, 0.3, -8, -0.8, 0],
  [2, 74, 1, -8, -1.9, 0],
  [2, 48, 1, 8, 1.3, 0],
  [1, 34, 0.3, 8, 2, 0],
  [1, 66, 1, -8, -2, 0],
  [2, 52, 1, -8, -0.8, 0],
  [1, 30, 0.45, 8, 2, 0],
  [0, 22, 1, -8, 1.6, 0]
];
var N4 = LINES.length;
var L = (s) => s.split(" ").map((c) => [1, "key " + c]);
var ROWS = [
  [[1, "esc"], ...L("1 2 3 4 5 6 7 8 9 0 - ="), [2, "bksp"]],
  [[1.5, "tab"], ...L("q w e r t y u i o p [ ]"), [1.5, "key \\"]],
  [[1.75, "caps"], ...L("a s d f g h j k l ; '"), [2.25, "enter"]],
  [[2.25, "shift l"], ...L("z x c v b n m , . /"), [2.75, "shift r"]],
  [[1.5, "ctrl l"], [1, "super"], [1.5, "alt l"], [7, "space"], [1.5, "alt r"], [1, "fn"], [1.5, "ctrl r"]]
];
var HB = 4;
var T6 = 2.4;
var HZ = HB + T6 / 2;
var COLS = 6;
var ROWS2 = 2;
var W6 = 24;
var HR2 = 38;
var GAP = 1.2;
var FM = 3;
var BW = COLS * W6 + 2 * FM;
var BH2 = ROWS2 * HR2 + 2 * FM;
var DW = W6 - 2 * GAP;
var DH = HR2 - 2 * GAP;
var OUTLINE = rrect(0, 0, DW, DH, 1.8, 4);
var VENTS = [0, 1, 2].map((k) => rrect(4, DH - 6.6 - k * 3.2, DW - 4, DH - 5.2 - k * 3.2, 0.7, 2));
var PLATE = rrect(DW / 2 - 4.5, DH - 19, DW / 2 + 4.5, DH - 15, 1, 3);
var CUP = rrect(DW - 5.6, DH / 2 - 7, DW - 2.8, DH / 2 + 2, 1.2, 3);
var FRAME = rrect(2.6, 2.6, DW - 2.6, DH - 2.6, 1.4, 3);
var ML = 26;
var R3 = 27;
var GLASS = R3 - 1.4;
var REST7 = [ML + 9, 46];
var D7 = 20;
var YC = D7 / 2;
var VX = Math.SQRT1_2 * Math.sqrt(3);
var NC = 12;
var PITCH2 = 15;
var GAP2 = 8;
var EAR2 = 15;
var MAR = 5;
var X03 = EAR2 + MAR;
var W8 = 2 * X03 + NC * PITCH2 + GAP2;
var W9 = 68;
var L2 = 140;
var TG = 2;
var TB = 1.6;
var TC = 1.8;
var TBAT = 7;
var TS = 6;
var TBUMP = 2.2;
var TL = 0.9;
var STACK = TG + TB + TC + TBAT + TS + TBUMP + TL;
var BOARD = [[4, L2 - 44], [W9 - 4, L2 - 44], [W9 - 4, L2 - 5], [36, L2 - 5], [36, L2 - 30], [4, L2 - 30]];
var BAT = [9, 12, W9 - 9, L2 - 48];
var CHIPS = [
  [10, L2 - 41, 26, L2 - 34, 1.4],
  [45, L2 - 40, 54, L2 - 35, 1.2],
  [57, L2 - 42, 62, L2 - 36, 1.2],
  [42, L2 - 27, 56, L2 - 13, 1.8]
];
var RECT = [[0, 0], [W9, 0], [W9, L2], [0, L2]];
var FOOT2 = [RECT, BOARD, [[BAT[0], BAT[1]], [BAT[2], BAT[1]], [BAT[2], BAT[3]], [BAT[0], BAT[3]]], RECT];
var N5 = 7;
var PITCH3 = 10;
var M2 = 8;
var EXT = M2 * 2 + PITCH3 * (N5 - 1);
var N6 = 7;
var X04 = 13;
var DX = 10;
var L3 = 2 * X04 + (N6 - 1) * DX;
var HP = 34;
var ARC = 5;
var FACE = /* @__PURE__ */ fillet([[L3 - 2, 0], [L3 - 2, HP], [2, HP], [2, 0]], [0.6, 4, 4, 0.6], ARC);
var EDGE = [ARC, 3 * (ARC + 1)];
var LIGHT2 = [-Math.SQRT1_2, -Math.SQRT1_2];
var N8 = 8;
var W10 = 84;
var H6 = 54;
var G3 = 13;
var TW2 = 22;
var TH4 = 7;
var TABS = [6, 31, 56];
var TK2 = 1.4;
var REST13 = -12;
var BACK = -24;
var FWD = 20;
var LIFT5 = 16;
var X06 = -5;
var X12 = W10 + 5;
var Y02 = -9;
var Y1 = (N8 - 1) * G3 + 9;
var WH = 20;
var WR = 6;
var WT = 2.4;
function camera() {
  const C = Cam(45, 0.5, 1.62);
  fit(C, [[X06, Y02, 0], [X12, Y1, -8], [X12, Y02, 0], [X06, Y1, 0], [X06, Y02, H6 + TH4], [X12, Y02, H6 + TH4 + LIFT5]], 200, 166);
  return C;
}
var trayRings = () => ({
  outer: rrect(X06, Y02, X12, Y1, WR, 6),
  inner: rrect(X06 + WT, Y02 + WT, X12 - WT, Y1 - WT, WR - WT, 6)
});
var LR = (pts) => pts[0][0] <= pts[pts.length - 1][0] ? pts : pts.slice().reverse();
function tray(P, front2, outer, inner3) {
  const far = [
    [poly(hull(ringAt(P, outer, 0).concat(ringAt(P, outer, WH)))), "sil"],
    [poly(ringAt(P, inner3, WH)), "nf"],
    [open(ringAt(P, run(inner3, (q) => !front2(q)), 2.5)), "nf lo"]
  ];
  const iF = LR(ringAt(P, run(inner3, front2), WH)), oT = LR(ringAt(P, run(outer, front2), WH)), oB = LR(ringAt(P, run(outer, front2), 0));
  const hx = (X06 + X12) / 2, onFront = (ring) => ring.map((q) => P(q.u, Y1, q.v));
  const near = [
    [poly([...iF, oT[oT.length - 1], ...oB.slice().reverse(), oT[0]]), "fo"],
    [open(oT), "nf lo"],
    [open(iF), "nf"],
    [open([oT[0], ...oB, oT[oT.length - 1]]), "nf sil"],
    [poly(onFront(rrect(hx - 11, 6.5, hx + 11, 12.5, 3, 5))), "nf"],
    [poly(onFront(rrect(hx - 9.4, 8, hx + 9.4, 11, 1.5, 5))), "nf lo"]
  ];
  return { far, near };
}
function card(i) {
  const n = N8 - i, t0 = TABS[(N8 - 1 - i) % 3];
  const shape = fillet(
    [[0, 0], [W10, 0], [W10, H6], [t0 + TW2, H6], [t0 + TW2, H6 + TH4], [t0, H6 + TH4], [t0, H6], [0, H6]],
    [1, 1, 3.2, 1.8, 2.4, 2.4, 1.8, 3.2]
  );
  return { n, t0, shape };
}
function pose2(P, i, t0, shape, th, lift) {
  const yb = i * G3, s = Math.sin(rad(th)), c = Math.cos(rad(th));
  const w = (u, v) => P(u, yb + v * s, v * c + lift);
  const wb = (u, v) => P(u, yb + v * s - TK2 * c, v * c + TK2 * s + lift);
  const punch = [];
  for (let k = 0; k < 8; k++) punch.push(w(t0 + TW2 / 2 + (k % 4 - 1.5) * 3.6, H6 + TH4 / 2 + (0.5 - Math.floor(k / 4)) * 2.8));
  return {
    back: poly(shape.map((p) => wb(p[0], p[1]))),
    face: poly(shape.map((p) => w(p[0], p[1]))),
    head: seg(w(6, H6 - 11), w(W10 - 6, H6 - 11)),
    rules: [H6 - 18, H6 - 25, H6 - 32, H6 - 39].map((v) => seg(w(6, v), w(W10 - 6, v))).join(""),
    punch
  };
}
function scene() {
  const C = camera();
  return { C, P: proj(C), front: facing(C), ...trayRings() };
}
var mount24 = ({ stage, svg, read }, value) => {
  const bag = disposer();
  let stag = value;
  const { P, front: front2, outer, inner: inner3 } = scene();
  const paths = tray(P, front2, outer, inner3);
  const g = mk("g", {}, svg);
  reflect(svg, g, P, front2, outer, 0, 14);
  for (const [d2, cls] of paths.far) mk("path", { d: d2, class: cls }, g);
  const cards = [];
  for (let i = 0; i < N8; i++) {
    const { n, t0, shape } = card(i);
    const grp = mk("g", {}, g);
    const back = mk("path", { class: "lo" }, grp), face = mk("path", { class: "sil" }, grp);
    const head = mk("path", { class: "nf" }, grp), rules = mk("path", { class: "nf lo" }, grp);
    const punch = [];
    for (let k = 0; k < 8; k++) punch.push(mk("circle", { r: 1.05, class: "dot " + (k === n - 1 ? "m" : "off") }, grp));
    cards.push({ n, t0, shape, back, face, head, rules, punch, a: tween(REST13), z: tween(0) });
  }
  for (const [d2, cls] of paths.near) mk("path", { d: d2, class: cls }, g);
  const top = (i) => P(W10 / 2, i * G3 + H6 * Math.sin(rad(REST13)), H6 * Math.cos(rad(REST13)));
  const c0 = top(0), c1 = top(1), d = [c1[0] - c0[0], c1[1] - c0[1]];
  const px0 = P(0, 0, 0), px1 = P(1, 0, 0), ex = [px1[0] - px0[0], px1[1] - px0[1]];
  const HALF3 = W10 / 2 + 6, det = d[0] * ex[1] - d[1] * ex[0];
  function hit([x, y]) {
    const qx = x - c0[0], qy = y - c0[1];
    const s = (qx * ex[1] - qy * ex[0]) / det, r = (d[0] * qy - d[1] * qx) / det;
    if (Math.abs(r) > HALF3 || s < -0.5 || s > N8 + 1) return -1;
    return clamp(Math.round(s), 0, N8 - 1);
  }
  function draw(i, th, lift) {
    const cd = cards[i], q = pose2(P, i, cd.t0, cd.shape, th, lift);
    cd.back.setAttribute("d", q.back);
    cd.face.setAttribute("d", q.face);
    cd.head.setAttribute("d", q.head);
    cd.rules.setAttribute("d", q.rules);
    cd.punch.forEach((el, k) => place(el, q.punch[k]));
  }
  const B6 = register(stage, (_dt, now) => {
    let moving = false;
    cards.forEach((cd, i) => {
      draw(i, tval(cd.a, now), tval(cd.z, now));
      if (!tdone(cd.a, now) || !tdone(cd.z, now)) moving = true;
    });
    return moving;
  });
  bag.add(B6.unregister);
  let act = -1;
  const caption = (a) => a < 0 ? "rest" : String(N8 - a).padStart(2, "0");
  function setActive(a) {
    if (a === act) return;
    const now = performance.now(), from = a >= 0 ? a : act;
    act = a;
    cards.forEach((cd, i) => {
      const delay = Math.abs(i - from) * stag;
      const th = a < 0 ? REST13 : i < a ? BACK : i > a ? FWD : 0;
      tset(cd.a, th, now, delay);
      tset(cd.z, a === i ? LIFT5 : 0, now, delay);
      cd.face.classList.toggle("hi", i === a);
      cd.head.classList.toggle("hi", i === a);
      cd.punch[cd.n - 1].classList.toggle("m", i !== a);
    });
    read.textContent = caption(a);
    B6.wake();
  }
  bag.add(pointer(stage, { move: (p) => setActive(hit(p)), leave: () => setActive(-1) }));
  bag.on(stage, "keydown", (e) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      setActive(act < 0 ? N8 - 1 : Math.min(N8 - 1, act + 1));
      e.preventDefault();
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      setActive(act < 0 ? N8 - 1 : Math.max(0, act - 1));
      e.preventDefault();
    } else if (e.key === "Escape" && act >= 0) {
      setActive(-1);
      e.preventDefault();
    }
  });
  bag.on(stage, "blur", () => setActive(-1));
  bag.add(() => svg.replaceChildren());
  return {
    set: (v) => {
      stag = v;
    },
    destroy: bag.dispose
  };
};
var R12 = 2.1;
var STOP = R12 + 1;
var D9 = [Math.SQRT1_2, -Math.SQRT1_2];
var L6 = 210;
var NC2 = 6;
var SPEED = 1 / 9;
var GATE = L6 * 0.62;
var RISE2 = L6 / NC2 / 2;
var FALL3 = RISE2 / 2;
var N11 = 24;
var V = 7;
var G4 = 11;
var T17 = 2.1;
var LH = 1.8;
var CH3 = 3.9;
var LIFT6 = 5.5;
var HB2 = 3.4;
var SLAB = 3;
var W11 = 150;
var TB2 = 17;
var PB3 = 17;
var PAD3 = 11;
var IN2 = 2.5;
var FIRST = 37;
var VB = PB3;
var VA = PB3 + V * G4;
var H9 = VA + TB2;
var E = 4;
var HIST = [
  "0 5 12",
  "2 7 3 9",
  "2 14",
  "4 6 10",
  "4 18",
  "2 3",
  "0 2",
  "0 2 6 8",
  "0 26",
  "0 20",
  "0 11 4",
  "2 9 12",
  "2 5 3 7",
  "4 16",
  "4 8 8",
  "2 4",
  "0 3 14",
  "0 24",
  "0 30",
  "0 17",
  "2 6 11",
  "2 13",
  "0 9 5",
  "0 4 7"
];
var REST_TOP = N11 - V - 2.6;
var REST_LINE = 18;
var REST_R = 2;
var falloff6 = (d, R9) => clamp(1 - d / R9, 0, 1);
var smooth = (t) => t * t * (3 - 2 * t);
var front = (q) => 0.612 * q.nu + 0.5 * q.nv > 0;
var cut = (ring) => ring.map((q) => ({ ...q, v: clamp(q.v, VB, VA) }));
var mount30 = ({ stage, svg, read }, value) => {
  const bag = disposer();
  const C = Cam(45, 0.5, 1.62);
  const W32 = (u, v, w) => [u, w, v];
  fit(C, [W32(0, 0, -SLAB), W32(W11, 0, -SLAB), W32(0, H9, -SLAB), W32(W11, H9, -SLAB), W32(W11, 0, HB2 + 2.8), W32(0, H9, HB2 + 1.3), W32(PAD3, VA - 4, LIFT6 + LH)], 200, 166);
  const P = proj(C), P2 = (u, v, w) => P(u, w, v);
  let R9 = value, over = null, lit2 = [];
  const g = mk("g", {}, svg);
  const [sr, si] = rings(0, 0, W11, H9, 9, 2);
  put(solid(g), prism(P2, front, sr, si, -SLAB, 0));
  const rows = HIST.map((s, j) => {
    const [ind, ...tok] = s.split(" ").map(Number), segs = [];
    let at2 = ind;
    for (const n of tok) {
      const x0 = PAD3 + at2 * CH3;
      segs.push({ x0, x1: x0 + n * CH3 - 1.4, el: solid(g) });
      at2 += n + 1;
    }
    return { j, segs, sp: spring(0, { eps: 0.01 }), drawn: "" };
  });
  const [pr, pi] = rings(IN2, IN2, W11 - IN2, VB, 6, 1.4);
  put(solid(g), prism(P2, front, pr, pi, 0, HB2));
  const cy = (IN2 + VB) / 2;
  const chev = fillet([[0, 6.2], [8.5, 0], [0, -6.2], [0, -3.1], [4.25, 0], [0, 3.1]], [0.9, 1.1, 0.9, 0.5, 0.6, 0.5]);
  const chevEl = mk("path", { d: poly(chev.map(([x, y]) => P2(PAD3 + x, cy + y, HB2))), class: "nf" }, g);
  const [kr, ki] = rings(PAD3 + 13, cy - 5.2, PAD3 + 13 + CH3 * 1.5, cy + 5.2, 1.2, 0.8);
  const cursor = solid(g);
  put(cursor, prism(P2, front, kr, ki, HB2, HB2 + 2.8));
  const [tr, ti] = rings(IN2, VA, W11 - IN2, H9 - IN2, 6, 1.4);
  put(solid(g), prism(P2, front, tr, ti, 0, HB2));
  for (let i = 0; i < 3; i++) {
    const cx = PAD3 + i * 8.5, cv = (VA + H9 - IN2) / 2;
    const [r, ri] = rings(cx - 2.8, cv - 2.8, cx + 2.8, cv + 2.8, 2.8, 0.8);
    put(solid(g), prism(P2, front, r, ri, HB2, HB2 + 1.3));
  }
  function drawRow(rw, top2) {
    const key = top2 + "|" + rw.sp.x;
    if (key === rw.drawn) return;
    rw.drawn = key;
    const vc = VA - (rw.j - top2 + 0.5) * G4, v0 = Math.max(vc - T17, VB), v1 = Math.min(vc + T17, VA);
    const env = smooth(clamp((VA - vc - T17) / E, 0, 1)) * smooth(clamp((vc - T17 - VB) / E, 0, 1));
    const w0 = rw.sp.x * env;
    for (const s of rw.segs) {
      if (v1 - v0 < 0.05) {
        put(s.el, { sil: "", crease: "" });
        continue;
      }
      const ring = cut(rrect(s.x0, vc - T17, s.x1, vc + T17, T17, 4)), inner3 = cut(rrect(s.x0 + 0.7, vc - T17 + 0.7, s.x1 - 0.7, vc + T17 - 0.7, T17 - 0.7, 4));
      put(s.el, prism(P2, front, ring, inner3, w0, w0 + LH));
    }
  }
  function light(els) {
    for (const el of lit2) el.classList.remove("hi");
    lit2 = els;
    for (const el of lit2) el.classList.add("hi");
  }
  const top = spring(REST_TOP, { eps: 2e-3 });
  const B6 = register(stage, (dt) => {
    let m = stepS(top, dt);
    for (const rw of rows) {
      if (stepS(rw.sp, dt)) m = true;
      drawRow(rw, top.x);
    }
    return m;
  });
  bag.add(B6.unregister);
  function onFace([sx, sy], w) {
    const o = P2(0, 0, w), a = P2(1, 0, w), b = P2(0, 1, w);
    const ax2 = a[0] - o[0], ay = a[1] - o[1], bx = b[0] - o[0], by = b[1] - o[1], det = ax2 * by - ay * bx;
    return [((sx - o[0]) * by - (sy - o[1]) * bx) / det, (ax2 * (sy - o[1]) - ay * (sx - o[0])) / det];
  }
  function hit(p) {
    const qb = onFace(p, HB2), inU = (q2) => q2[0] > IN2 && q2[0] < W11 - IN2;
    if (inU(qb) && qb[1] > IN2 && qb[1] < VB) return "prompt";
    if (inU(qb) && qb[1] > VA && qb[1] < H9 - IN2) return 0;
    const q = onFace(p, 0);
    if (q[0] < 0 || q[0] > W11 || q[1] < 0 || q[1] > H9) return null;
    return q[1] <= VB ? "prompt" : clamp((VA - G4 / 2 - q[1]) / ((V - 1) * G4), 0, 1);
  }
  function retarget() {
    let t, c, r = R9;
    if (over === null) {
      t = REST_TOP;
      c = REST_LINE;
      r = REST_R;
      read.textContent = "rest";
    } else if (over === "prompt") {
      t = N11 - V;
      c = -1;
      read.textContent = "prompt";
    } else {
      t = over * (N11 - V);
      c = clamp(Math.round(over * (N11 - 1)), Math.ceil(t), Math.floor(t + V - 1));
      read.textContent = "line " + (FIRST + c);
    }
    top.t = t;
    for (const rw of rows) rw.sp.t = c < 0 ? 0 : LIFT6 * falloff6(Math.abs(rw.j - c), r);
    light(c < 0 ? [cursor.sil, chevEl] : rows[c].segs.map((s) => s.el.sil));
    B6.wake();
  }
  retarget();
  for (const rw of rows) rw.sp.x = rw.sp.t;
  bag.add(pointer(stage, {
    move: (p) => {
      over = hit(p);
      retarget();
    },
    leave: () => {
      over = null;
      retarget();
    }
  }));
  bag.add(() => svg.replaceChildren());
  return {
    set: (v) => {
      R9 = v;
      if (over !== null) retarget();
    },
    destroy: bag.dispose
  };
};
var N12 = 9;
var CELL = 14;
var EXT2 = N12 * CELL;
var BLK = [
  [-42, -42, 0, -12, -12, 14, 0],
  [-36, -36, 14, -18, -18, 34, 0],
  [0, -46, 0, 16, -6, 10, 1],
  [24, -32, 0, 40, -16, 44, 2],
  [-44, 4, 0, -4, 18, 22, 3],
  [8, 6, 0, 40, 38, 8, 4],
  [16, 14, 8, 28, 26, 20, 4],
  [-30, 28, 0, -16, 42, 12, 5]
];
var HOME = 45;
var DETENT = 90;
var detent = (a) => HOME + DETENT * Math.round((a - HOME) / DETENT);
var depth = (b, s, c) => (b[0] + b[3]) * s + (b[1] + b[4]) * c + (b[2] + b[5]) * 0.01;
function behind(A2, B6, s, c) {
  if (A2[6] === B6[6]) return A2[2] < B6[2];
  if (A2[3] <= B6[0]) return s > 0;
  if (B6[3] <= A2[0]) return s < 0;
  if (A2[4] <= B6[1]) return c > 0;
  if (B6[4] <= A2[1]) return c < 0;
  return depth(A2, s, c) < depth(B6, s, c);
}
function scr(b, s, c, k) {
  const zf = Math.sqrt(1 - k * k);
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const x of [b[0], b[3]]) for (const y of [b[1], b[4]]) for (const z of [b[2], b[5]]) {
    const X = x * c - y * s, Y = (x * s + y * c) * k - z * zf;
    x0 = Math.min(x0, X);
    x1 = Math.max(x1, X);
    y0 = Math.min(y0, Y);
    y1 = Math.max(y1, Y);
  }
  return [x0, y0, x1, y1];
}
function paintOrder(bs, s, c, k) {
  const n = bs.length, bx = bs.map((b) => scr(b, s, c, k));
  const next = bs.map(() => []), wait = bs.map(() => 0);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const a = bx[i], b = bx[j];
    if (i === j || a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1]) continue;
    if (behind(bs[i], bs[j], s, c)) {
      next[i].push(j);
      wait[j]++;
    }
  }
  const out = [], done2 = bs.map(() => false);
  let forced = 0;
  while (out.length < n) {
    let pick = -1, pass = 0;
    for (; pass < 2 && pick < 0; pass++)
      for (let i = 0; i < n; i++)
        if (!done2[i] && (pass || !wait[i]) && (pick < 0 || depth(bs[i], s, c) < depth(bs[pick], s, c))) pick = i;
    if (pass === 2) forced++;
    done2[pick] = true;
    out.push(pick);
    for (const j of next[pick]) wait[j]--;
  }
  return { order: out, forced };
}
var order = (bs, s, c, k) => paintOrder(bs, s, c, k).order;
var RING = 70;
var PT3 = 4;
var WMAX = 540;
var ON_INDEX = 14;
var mount32 = ({ stage, svg, read }, value) => {
  const bag = disposer();
  let coast = value;
  const spin = { a: HOME, w: 0, mode: "rest", tgt: HOME };
  const kk = spring(0.5, { eps: 5e-4 });
  let lastX = null, lastT = 0, lastMove = -1e9;
  function stepSpin(dt, now) {
    if (spin.mode === "rest") return false;
    const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;
    for (let i = 0; i < n; i++) {
      if (spin.mode === "coast") {
        spin.w *= Math.exp(-h * 1e3 / coast);
        spin.a += spin.w * h;
        if (Math.abs(spin.w) < 45 && now - lastMove > 90) {
          spin.mode = "settle";
          spin.tgt = detent(spin.a + spin.w * 0.2);
        }
      } else {
        spin.w += (-90 * (spin.a - spin.tgt) - 16 * spin.w) * h;
        spin.a += spin.w * h;
      }
    }
    if (spin.mode === "settle" && Math.abs(spin.a - spin.tgt) < 0.02 && Math.abs(spin.w) < 0.3) {
      spin.a = spin.tgt;
      spin.w = 0;
      spin.mode = "rest";
    }
    return spin.mode !== "rest";
  }
  const C = Cam(HOME, 0.5, 1.85);
  C.ox = 200;
  C.oy = 184;
  const plat = circ(RING), platIn = circ(RING - 1.5);
  const blocks = BLK.map((b) => {
    const [ring, inner3] = rings(b[0], b[1], b[3], b[4], 3, 1.1);
    return { b, ring, inner: inner3 };
  });
  const TALL = blocks.find((k) => k.b[5] >= 40);
  const tops = {};
  blocks.forEach((k) => {
    if (!tops[k.b[6]] || k.b[5] > tops[k.b[6]].b[5]) tops[k.b[6]] = k;
  });
  const base = {};
  blocks.forEach((k) => {
    if (k.b[2] === 0) base[k.b[6]] = [(k.b[0] + k.b[3]) / 2, (k.b[1] + k.b[4]) / 2];
  });
  const g = mk("g", {}, svg);
  const platter = solid(g), ticks = mk("path", { class: "nf lo" }, g), major = mk("path", { class: "nf" }, g);
  const north = flatDot(g, C, 1.7, "dot m");
  const index = mk("path", { class: "nf" }, g);
  const pool = BLK.map(() => solid(g));
  const acc = mk("g", {}, g), accD = [];
  for (let k = 0; k < 16; k++) {
    const r = Math.floor(k / 4), q = k % 4, edge = r % 3 === 0, side = q % 3 === 0;
    if (edge && side) continue;
    accD.push({ r, q, el: flatDot(acc, C, 0.6, edge || side ? "dot m" : "dot") });
  }
  let accAt = null;
  const B6 = register(stage, (dt, now) => {
    let m = stepSpin(dt, now);
    if (stepS(kk, dt)) m = true;
    C.az = rad(spin.a);
    C.k = kk.x;
    const P = proj(C), front2 = facing(C), c = Math.cos(C.az), s = Math.sin(C.az);
    put(platter, prism(P, front2, plat, platIn, -PT3, 0));
    const tk = [], mj = [];
    for (let d = 0; d < 360; d += 15) {
      const a = rad(d), long = d % 90 === 0, r0 = long ? RING - 12 : RING - 8;
      (long ? mj : tk).push(seg(P(Math.cos(a) * r0, Math.sin(a) * r0, 0), P(Math.cos(a) * (RING - 4.5), Math.sin(a) * (RING - 4.5), 0)));
    }
    ticks.setAttribute("d", tk.join(""));
    major.setAttribute("d", mj.join(""));
    place(north, P(0, -(RING - 17), 0));
    north.setAttribute("ry", String(r2(1.7 * C.S * C.k)));
    const bottom = C.oy + RING * C.S * C.k + PT3 * C.S * Math.sqrt(1 - C.k * C.k);
    index.setAttribute("d", `M${C.ox - 4} ${r2(bottom + 10)}L${C.ox} ${r2(bottom + 4)}L${C.ox + 4} ${r2(bottom + 10)}`);
    let lit2 = -1, best = ON_INDEX;
    if (lastX !== null || spin.mode !== "rest")
      for (const col in base) {
        const [x, y] = base[col], off = Math.abs(Math.atan2(x * c - y * s, x * s + y * c)) * 180 / Math.PI;
        if (off < best) {
          best = off;
          lit2 = +col;
        }
      }
    order(BLK, s, c, C.k).forEach((j, i) => {
      const k = blocks[j];
      put(pool[i], prism(P, front2, k.ring, k.inner, k.b[2], k.b[5]));
      pool[i].sil.classList.toggle("hi", k === tops[lit2]);
      if (k === TALL && accAt !== pool[i]) {
        accAt = pool[i];
        accAt.g.after(acc);
      }
    });
    const [x0, y0, , x1, y1, z1] = TALL.b, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    accD.forEach(({ r, q, el }) => {
      place(el, P(cx + (q - 1.5) * 2.6, cy + (r - 1.5) * 2.6, z1));
      el.setAttribute("ry", String(r2(0.6 * C.S * C.k)));
    });
    read.textContent = `az ${String(Math.round((spin.a % 360 + 360) % 360)).padStart(3, "0")}\xB0 \xB7 el ${Math.round(Math.asin(kk.x) * 180 / Math.PI)}\xB0`;
    return m;
  });
  bag.add(B6.unregister);
  bag.add(pointer(stage, {
    move: (p) => {
      const now = performance.now();
      kk.t = lerp(Math.sin(rad(40)), Math.sin(rad(20)), clamp(p[1] / 320, 0, 1));
      if (lastX !== null) {
        const dx = p[0] - lastX;
        if (reducedMotion()) spin.a -= dx * 0.9;
        else {
          const vp = dx / Math.max(8e-3, (now - lastT) / 1e3);
          spin.w = clamp(lerp(spin.w, -vp * 0.9, 0.35), -WMAX, WMAX);
          spin.mode = "coast";
        }
        if (Math.abs(dx) > 0.5) lastMove = now;
      }
      lastX = p[0];
      lastT = now;
      B6.wake();
    },
    leave: () => {
      lastX = null;
      kk.t = 0.5;
      if (reducedMotion()) spin.a = detent(spin.a);
      B6.wake();
    }
  }));
  bag.add(() => svg.replaceChildren());
  return { set: (v) => {
    coast = v;
    B6.wake();
  }, destroy: bag.dispose };
};
var R8 = 40;
var HX = -R8 - 8;
var V2 = [Math.SQRT1_2 * Math.sqrt(0.75), Math.SQRT1_2 * Math.sqrt(0.75), 0.5];
function riffle(el, options) {
  return create({
    id: "riffle",
    label: "A tray of eight cards. Hover or use the arrow keys to pull a card.",
    rest: "rest",
    engine: mount24,
    focusable: true
  }, el, options);
}
function turntable(el, options) {
  return create({
    id: "turntable",
    label: "Blocks on a turntable. Flick across it to spin it; it settles on the nearest quarter turn.",
    rest: "az 045\xB0 \xB7 el 30\xB0",
    engine: mount32
  }, el, options);
}
function terminal(el, options) {
  return create({
    id: "terminal",
    label: "A terminal window: the pointer's height scrolls back through its history, and the line under it lifts off the screen.",
    rest: "rest",
    engine: mount30
  }, el, options);
}
function cabinet(el, options) {
  return create({
    id: "cabinet",
    label: "A rack of twelve blades: the pointer's height pulls the nearest ones out on their rails, the farther the less.",
    rest: "rest",
    engine: mount3
  }, el, options);
}
function drawer(el, options) {
  return create({
    id: "drawer",
    label: "A filing cabinet of three drawers: the pointer's height picks one, it slides out, and inside are two dividers and nothing between them.",
    rest: "rest",
    engine: mount5
  }, el, options);
}
export {
  cabinet,
  drawer,
  riffle,
  terminal,
  turntable
};
