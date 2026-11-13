/* 2D-план этажа (Ф10.2): лёгкий SVG-режим для слабых компьютеров и телефонов. */
'use strict';

window.Plan2D = (function () {
  const NS = 'http://www.w3.org/2000/svg';
  let svg, root, S, onPick, bgImg;
  const el = (n, a, p) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };

  function mount(container, state, pick) {
    S = state; onPick = pick;
    container.innerHTML = '';
    svg = el('svg', { viewBox: '-2 -3 64 30', class: 'plan2d', preserveAspectRatio: 'xMidYMid meet' }, container);
    root = el('g', {}, svg);
    bgImg = el('image', { x: 0, y: 0, width: S.floor.w, height: S.floor.h, opacity: 0.35, preserveAspectRatio: 'none', style: 'display:none' }, root);
    const gz = el('g', { class: 'zones' }, root);
    S.zoneList.forEach((z) => {
      const [x, y, w, h] = z.rect;
      const g = el('g', { class: 'zone', 'data-zone': z.id }, gz);
      el('rect', { x, y, width: w, height: h, class: 'zrect' }, g);
      const t = el('text', { x: x + 0.6, y: y + 1.5, class: 'zlabel' }, g); t.textContent = z.name;
      el('text', { x: x + 0.6, y: y + h - 0.7, class: 'zpeople' }, g);
      g.addEventListener('click', () => onPick({ type: 'zone', id: z.id }));
    });
    el('g', { class: 'routes' }, root);
    const ge = el('g', { class: 'exits' }, root);
    S.exits.forEach((e) => {
      const g = el('g', { class: 'exit' }, ge);
      el('rect', { x: e.x - (e.x === 0 ? 1.4 : 0), y: e.y - 1.6, width: 1.4, height: 3.2, rx: 0.2 }, g);
      const t = el('text', { x: e.x === 0 ? -0.7 : e.x + 0.7, y: e.y - 2.1, 'text-anchor': 'middle', class: 'exlabel' }, g);
      t.textContent = e.id === 'exA' ? 'A' : 'B';
    });
    const gd = el('g', { class: 'devices' }, root);
    S.devList.forEach((d) => {
      const g = el('g', { class: 'dev', 'data-dev': d.id, transform: 'translate(' + d.x + ',' + d.y + ')' }, gd);
      el('circle', { r: 1.5, class: 'halo' }, g);
      if (d.kind === 'manual') el('rect', { x: -0.55, y: -0.55, width: 1.1, height: 1.1, rx: 0.15, class: 'dot' }, g);
      else el('circle', { r: 0.6, class: 'dot' }, g);
      g.addEventListener('click', (ev) => { ev.stopPropagation(); onPick({ type: 'device', id: d.id }); });
    });
    el('g', { class: 'flags' }, root);
    update();
  }

  function setBackground(url) {
    if (!bgImg) return;
    if (url) { bgImg.setAttribute('href', url); bgImg.style.display = ''; } else bgImg.style.display = 'none';
  }

  function routePoints(room) {
    const z = S.zones[room.zone]; const [x, y, w, h] = z.rect;
    const ex = S.exits.find((e) => e.id === room.route.exit);
    const doorX = Math.min(Math.max(x + w / 2, 1), 59);
    const cy = 11.5 + (y < 9 ? -0.9 : 0.9) * 0.6;
    return [[x + w / 2, y + h / 2], [doorX, y < 9 ? y + h : y], [doorX, cy], [ex.x, cy]];
  }

  function update(sel) {
    if (!svg) return;
    const occ = Engine.occupancy();
    const rc = Engine.activeRollcall();
    S.zoneList.forEach((z) => {
      const g = svg.querySelector('[data-zone="' + z.id + '"]');
      const st = Engine.zoneStatus(z.id);
      g.setAttribute('class', 'zone zs-' + st + (sel && sel.type === 'zone' && sel.id === z.id ? ' sel' : ''));
      const o = occ.find((x) => x.zone === z.id);
      const lab = g.querySelector('.zpeople');
      let txt = o ? '👥 ' + o.count + ' · ' + o.group : '';
      if (rc) {
        const r = rc.rooms.find((x) => x.zone === z.id);
        if (r) txt = r.markedAt ? (r.missing ? '⚠ ' + r.evac + '/' + r.expected : '✅ ' + r.evac + '/' + r.expected) : '⏳ ' + r.expected + ' · ' + r.group;
      }
      lab.textContent = txt;
      g.querySelector('.zlabel').textContent = Engine.zname(z.id);
    });
    S.devList.forEach((d) => {
      const g = svg.querySelector('[data-dev="' + d.id + '"]');
      g.setAttribute('class', 'dev ds-' + Engine.devStatus(d) + (sel && sel.type === 'device' && sel.id === d.id ? ' sel' : ''));
    });
    const gr = svg.querySelector('.routes');
    const key = rc ? rc.id + rc.rooms.map((r) => r.route.exit + (r.markedAt ? 1 : 0)).join('') : '';
    if (gr.dataset.key !== key) {
      gr.dataset.key = key; gr.innerHTML = '';
      if (rc) rc.rooms.forEach((r) => {
        if (r.route.stay) return;
        const pts = routePoints(r).map((p) => p.join(',')).join(' ');
        el('polyline', { points: pts, class: 'route' + (r.route.alt ? ' alt' : '') + (r.markedAt ? ' done' : '') }, gr);
      });
    }
    const gf = svg.querySelector('.flags');
    const pp = rc ? Engine.possiblePeople(rc) : [];
    const fkey = pp.map((p) => p.zone).join();
    if (gf.dataset.key !== fkey) {
      gf.dataset.key = fkey; gf.innerHTML = '';
      pp.forEach((p) => {
        const [x, y, w, h] = S.zones[p.zone].rect;
        const g = el('g', { class: 'pflag', transform: 'translate(' + (x + w - 2.2) + ',' + (y + 2.2) + ')' }, gf);
        el('circle', { r: 1.5 }, g);
        const t = el('text', { y: 0.55, 'text-anchor': 'middle' }, g); t.textContent = '!';
      });
    }
  }

  function rebind(state) { S = state; if (svg) { svg.querySelector('.routes').dataset.key = '-'; svg.querySelector('.flags').dataset.key = '-'; } }

  return { mount, update, setBackground, rebind };
})();
