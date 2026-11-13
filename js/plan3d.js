/* 3D-план этажа (Ф1.4, Ф10.1): стены вытягиваются из разметки помещений,
   устройства окрашены по статусу, камера летит к очагу (Ф5.5). */
'use strict';

window.Plan3D = (function () {
  let S, onPick, container, renderer, scene, camera, raycaster, labelsEl;
  let zoneMeshes = {}, devMeshes = {}, halos = {}, routeGroup, flagGroup, fireLights = {};
  let running = false, ok = false;
  const cam = { tx: 0, tz: 0, r: 58, th: -0.55, ph: 0.95 };
  let fly = null;
  const W = 60, H = 24;
  const P = (x, y) => [x - W / 2, y - H / 2]; // план (x,y) → 3D (x,z)

  const COL = {
    ok: 0x2c3e36, warn: 0x8a6d1c, f1: 0xb4541a, f2: 0xc0262d, fault: 0x5b3f86, test: 0x2b5c9e, repair: 0x4a4a32,
    corridor: 0x2a3036
  };
  const DCOL = { ok: 0x3ddc84, warn: 0xffc94a, alarm: 0xff3b30, fault: 0xb084ff, offline: 0x7b7f86, test: 0x4aa3ff, maint: 0x4aa3ff };

  function mount(el, state, pick) {
    S = state; onPick = pick; container = el;
    if (typeof THREE === 'undefined') { el.innerHTML = '<div class="empty">3D недоступно — используйте 2D</div>'; return false; }
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch (e) { el.innerHTML = '<div class="empty">WebGL недоступен — используйте 2D-режим</div>'; return false; }
    ok = true;
    el.innerHTML = '';
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    el.appendChild(renderer.domElement);
    labelsEl = document.createElement('div'); labelsEl.className = 'labels3d'; el.appendChild(labelsEl);
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f1316);
    scene.fog = new THREE.Fog(0x0f1316, 90, 170);
    camera = new THREE.PerspectiveCamera(42, 1, 0.5, 400);
    raycaster = new THREE.Raycaster();
    scene.add(new THREE.HemisphereLight(0xcfd8e3, 0x1a1d21, 0.75));
    const sun = new THREE.DirectionalLight(0xffffff, 0.6); sun.position.set(-20, 40, 25); scene.add(sun);

    // основание
    const base = new THREE.Mesh(new THREE.BoxGeometry(W + 6, 0.4, H + 6), new THREE.MeshLambertMaterial({ color: 0x161b1f }));
    base.position.y = -0.25; scene.add(base);

    // полы зон
    S.zoneList.forEach((z) => {
      const [x, y, w, h] = z.rect; const [cx, cz] = P(x + w / 2, y + h / 2);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w - 0.12, 0.08, h - 0.12), new THREE.MeshLambertMaterial({ color: z.type === 'corridor' ? COL.corridor : COL.ok, emissive: 0x000000 }));
      m.position.set(cx, 0, cz); m.userData = { type: 'zone', id: z.id };
      scene.add(m); zoneMeshes[z.id] = m;
    });

    // стены из контуров помещений (без дублей и без стен между сегментами коридора)
    const wallMat = new THREE.MeshLambertMaterial({ color: 0xd9dee3, transparent: true, opacity: 0.88 });
    const seen = new Set();
    const wall = (x1, y1, x2, y2) => {
      const k = [x1, y1, x2, y2].map((v) => v.toFixed(2)).join(',');
      if (seen.has(k)) return; seen.add(k);
      const len = Math.hypot(x2 - x1, y2 - y1); if (len < 0.05) return;
      const g = new THREE.BoxGeometry(x1 === x2 ? 0.18 : len, 2.6, x1 === x2 ? len : 0.18);
      const m = new THREE.Mesh(g, wallMat); const [cx, cz] = P((x1 + x2) / 2, (y1 + y2) / 2);
      m.position.set(cx, 1.3, cz); scene.add(m);
    };
    S.zoneList.forEach((z) => {
      const [x, y, w, h] = z.rect;
      if (z.type === 'corridor') return;
      // двери в коридор: проём 1.6 м по центру стены, обращённой к коридору
      const doorSide = y < 9 ? 'bottom' : 'top';
      const edge = (x1, y1, x2, y2, side) => {
        if (side === doorSide) {
          const mid = (x1 + x2) / 2;
          wall(x1, y1, mid - 0.8, y2); wall(mid + 0.8, y1, x2, y2);
        } else wall(x1, y1, x2, y2);
      };
      edge(x, y, x + w, y, 'top'); edge(x, y + h, x + w, y + h, 'bottom');
      wall(x, y, x, y + h); wall(x + w, y, x + w, y + h);
    });

    // выходы
    S.exits.forEach((e) => {
      const [cx, cz] = P(e.x, e.y);
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.4, 3.6), new THREE.MeshBasicMaterial({ color: 0x18c964 }));
      m.position.set(cx + (e.x === 0 ? -0.4 : 0.4), 1.2, cz); scene.add(m);
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2, 3), new THREE.MeshBasicMaterial({ color: 0x18c964 }));
      arrow.rotation.z = e.x === 0 ? Math.PI / 2 : -Math.PI / 2;
      arrow.position.set(cx + (e.x === 0 ? -2.4 : 2.4), 0.6, cz); scene.add(arrow);
    });

    // устройства
    S.devList.forEach((d) => {
      const [cx, cz] = P(d.x, d.y);
      const geo = d.kind === 'manual' ? new THREE.BoxGeometry(0.7, 0.7, 0.25) : new THREE.CylinderGeometry(0.42, 0.5, 0.25, 20);
      const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: DCOL.ok, emissive: DCOL.ok, emissiveIntensity: 0.6 }));
      m.position.set(cx, d.kind === 'manual' ? 1.4 : 2.62, cz);
      m.userData = { type: 'device', id: d.id };
      scene.add(m); devMeshes[d.id] = m;
      const halo = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.0, depthWrite: false }));
      halo.position.copy(m.position); scene.add(halo); halos[d.id] = halo;
    });

    routeGroup = new THREE.Group(); scene.add(routeGroup);
    flagGroup = new THREE.Group(); scene.add(flagGroup);

    // подписи зон
    S.zoneList.forEach((z) => {
      const l = document.createElement('div'); l.className = 'l3d' + (z.type === 'corridor' ? ' corr' : ''); l.dataset.zone = z.id;
      l.innerHTML = '<b></b><span></span>';
      l.addEventListener('click', () => onPick({ type: 'zone', id: z.id }));
      labelsEl.appendChild(l);
    });

    // управление камерой
    let drag = null, moved = false;
    const dom = renderer.domElement;
    dom.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, b: e.button, sh: e.shiftKey }; moved = false; dom.setPointerCapture(e.pointerId); });
    dom.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      drag.x = e.clientX; drag.y = e.clientY; fly = null;
      if (drag.b === 2 || drag.sh) {
        const s = cam.r / 600;
        cam.tx -= (dx * Math.cos(cam.th) + dy * Math.sin(cam.th)) * s;
        cam.tz -= (-dx * Math.sin(cam.th) + dy * Math.cos(cam.th)) * s;
      } else { cam.th -= dx * 0.006; cam.ph = U.clamp(cam.ph - dy * 0.005, 0.25, 1.45); }
    });
    dom.addEventListener('pointerup', (e) => {
      if (drag && !moved) pick(e);
      drag = null;
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    dom.addEventListener('wheel', (e) => { e.preventDefault(); fly = null; cam.r = U.clamp(cam.r * (1 + Math.sign(e.deltaY) * 0.1), 14, 110); }, { passive: false });

    new ResizeObserver(resize).observe(el);
    resize();
    return true;
  }

  function pick(e) {
    const r = renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(v, camera);
    const objs = Object.values(devMeshes).concat(Object.values(zoneMeshes));
    const hit = raycaster.intersectObjects(objs)[0];
    if (hit) onPick(hit.object.userData);
  }

  function resize() {
    if (!ok) return;
    const w = container.clientWidth || 600, h = container.clientHeight || 400;
    renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }

  function flyTo(x, y, r) {
    if (!ok) return;
    const [tx, tz] = P(x, y);
    fly = { from: Object.assign({}, cam), to: { tx, tz, r: r || 26, th: cam.th, ph: 0.85 }, t0: performance.now(), d: 1400 };
  }
  function overview() { fly = { from: Object.assign({}, cam), to: { tx: 0, tz: 0, r: 58, th: -0.55, ph: 0.95 }, t0: performance.now(), d: 1200 }; }

  function routeLine(room) {
    const z = S.zones[room.zone]; const [x, y, w, h] = z.rect;
    const ex = S.exits.find((e) => e.id === room.route.exit);
    const doorX = Math.min(Math.max(x + w / 2, 1), 59);
    const cy = 11.5 + (y < 9 ? -0.55 : 0.55);
    const pts = [[x + w / 2, y + h / 2], [doorX, y < 9 ? y + h : y], [doorX, cy], [ex.x + (ex.x === 0 ? -1.5 : 1.5), cy]];
    return pts.map(([a, b]) => { const [px, pz] = P(a, b); return new THREE.Vector3(px, 0.25, pz); });
  }

  let routeKey = '', flagKey = '';
  function update(sel) {
    if (!ok) return;
    const t = performance.now() / 1000;
    S.zoneList.forEach((z) => {
      const m = zoneMeshes[z.id]; const st = Engine.zoneStatus(z.id);
      const c = st === 'ok' ? (z.type === 'corridor' ? COL.corridor : COL.ok) : COL[st] || COL.ok;
      m.material.color.setHex(c);
      const pulse = st === 'f2' ? 0.35 + 0.35 * Math.sin(t * 6) : st === 'f1' ? 0.2 + 0.2 * Math.sin(t * 4) : 0;
      m.material.emissive.setHex(st === 'f1' || st === 'f2' ? 0xff2a00 : (sel && sel.type === 'zone' && sel.id === z.id ? 0x1d4f73 : 0x000000));
      m.material.emissiveIntensity = st === 'f1' || st === 'f2' ? pulse : 0.6;
      // огненный свет в зоне тревоги
      if ((st === 'f1' || st === 'f2') && !fireLights[z.id]) {
        const [x, y, w, h] = z.rect; const [cx, cz] = P(x + w / 2, y + h / 2);
        const L = new THREE.PointLight(0xff5a1f, 1.6, 18); L.position.set(cx, 2, cz); scene.add(L); fireLights[z.id] = L;
      } else if (!(st === 'f1' || st === 'f2') && fireLights[z.id]) { scene.remove(fireLights[z.id]); delete fireLights[z.id]; }
      if (fireLights[z.id]) fireLights[z.id].intensity = 1.2 + Math.sin(t * 13) * 0.3 + Math.sin(t * 7.3) * 0.3;
    });
    S.devList.forEach((d) => {
      const m = devMeshes[d.id]; const st = Engine.devStatus(d); const c = DCOL[st] || DCOL.ok;
      m.material.color.setHex(c); m.material.emissive.setHex(c);
      m.material.emissiveIntensity = st === 'offline' ? 0.05 : 0.6;
      const h = halos[d.id];
      if (st === 'alarm' || st === 'test') {
        const s = 1 + ((t * 1.4) % 1) * 2.4; h.scale.set(s, s, s);
        h.material.color.setHex(st === 'test' ? 0x4aa3ff : 0xff3b30);
        h.material.opacity = 0.45 * (1 - ((t * 1.4) % 1));
      } else if (sel && sel.type === 'device' && sel.id === d.id) { h.scale.set(1.3, 1.3, 1.3); h.material.color.setHex(0x9ad1ff); h.material.opacity = 0.25; }
      else h.material.opacity = 0;
    });
    // маршруты эвакуации
    const rc = Engine.activeRollcall();
    const rk = rc ? rc.id + rc.rooms.map((r) => r.route.exit + (r.markedAt ? 1 : 0)).join('') : '';
    if (rk !== routeKey) {
      routeKey = rk;
      while (routeGroup.children.length) routeGroup.remove(routeGroup.children[0]);
      if (rc) rc.rooms.forEach((r) => {
        if (r.route.stay) return;
        const g = new THREE.BufferGeometry().setFromPoints(routeLine(r));
        const mat = r.route.alt ? new THREE.LineDashedMaterial({ color: 0xffc94a, dashSize: 0.8, gapSize: 0.5 }) : new THREE.LineBasicMaterial({ color: r.markedAt ? 0x2a7a4b : 0x18c964 });
        const line = new THREE.Line(g, mat); if (r.route.alt) line.computeLineDistances();
        routeGroup.add(line);
      });
    }
    const pp = rc ? Engine.possiblePeople(rc) : [];
    const fk = pp.map((p) => p.zone).join();
    if (fk !== flagKey) {
      flagKey = fk;
      while (flagGroup.children.length) flagGroup.remove(flagGroup.children[0]);
      pp.forEach((p) => {
        const [x, y, w, h] = S.zones[p.zone].rect; const [cx, cz] = P(x + w / 2, y + h / 2);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 3.4, 16), new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.8 }));
        m.position.set(cx, 1.7, cz); flagGroup.add(m);
      });
    }
    flagGroup.children.forEach((m) => { m.material.opacity = 0.5 + 0.4 * Math.sin(t * 5); });
    labels(rc);
  }

  function labels(rc) {
    const occ = Engine.occupancy();
    const w = container.clientWidth, h = container.clientHeight;
    U.$$('.l3d', labelsEl).forEach((l) => {
      const z = S.zones[l.dataset.zone]; const [x, y, ww, hh] = z.rect;
      const [cx, cz] = P(x + ww / 2, y + hh / 2);
      const v = new THREE.Vector3(cx, 3.2, cz).project(camera);
      if (v.z > 1) { l.style.display = 'none'; return; }
      l.style.display = '';
      l.style.transform = 'translate(-50%,-100%) translate(' + ((v.x + 1) / 2 * w).toFixed(1) + 'px,' + ((1 - v.y) / 2 * h).toFixed(1) + 'px)';
      const st = Engine.zoneStatus(z.id);
      l.className = 'l3d zs-' + st + (z.type === 'corridor' ? ' corr' : '');
      l.querySelector('b').textContent = Engine.zname(z.id);
      let txt = '';
      const o = occ.find((q) => q.zone === z.id);
      if (o) txt = '👥 ' + o.count;
      if (rc) { const r = rc.rooms.find((q) => q.zone === z.id); if (r) txt = r.markedAt ? (r.missing ? '⚠ ' + r.evac + '/' + r.expected : '✅ ' + r.evac + '/' + r.expected) : '⏳ ' + r.expected; }
      if (st === 'f1' || st === 'f2') txt = '🔥 ' + Engine.lvl(st) + (txt ? ' · ' + txt : '');
      l.querySelector('span').textContent = txt;
    });
  }

  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    if (fly) {
      const k = Math.min(1, (performance.now() - fly.t0) / fly.d), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      ['tx', 'tz', 'r', 'th', 'ph'].forEach((p) => { cam[p] = fly.from[p] + (fly.to[p] - fly.from[p]) * e; });
      if (k >= 1) fly = null;
    }
    camera.position.set(cam.tx + cam.r * Math.sin(cam.ph) * Math.sin(cam.th), cam.r * Math.cos(cam.ph), cam.tz + cam.r * Math.sin(cam.ph) * Math.cos(cam.th));
    camera.lookAt(cam.tx, 0, cam.tz);
    update(window.App ? App.sel : null);
    renderer.render(scene, camera);
  }
  function start() { if (!ok || running) return; running = true; resize(); frame(); }
  function stop() { running = false; }

  function rebind(state) { S = state; routeKey = '-'; flagKey = '-'; }

  return { mount, start, stop, flyTo, overview, rebind, isOk: () => ok };
})();
