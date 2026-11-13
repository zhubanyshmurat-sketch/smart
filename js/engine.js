/* ӨртБақылау — движок: приём сигналов, оценка достоверности, инциденты, эскалация,
   уведомления, перекличка, карточка пожарных, ТО, журнал с цепочкой хэшей.
   В демо всё работает в браузере на симулированном времени (S.sim). */
'use strict';

window.Engine = (function () {
  const { uid, rnd, clamp, sha256, hms, hm, dur } = U;
  const E = {};
  let S = null;
  const listeners = {};
  E.on = (n, f) => { (listeners[n] = listeners[n] || []).push(f); };
  const fire = (n, d) => (listeners[n] || []).forEach((f) => { try { f(d); } catch (e) { console.error(e); } });

  const LVL = { ok: 'Норма', warn: 'Внимание', f1: 'Пожар-1', f2: 'Пожар-2', fault: 'Неисправность', offline: 'Нет связи' };
  const LVL_KK = { ok: 'Қалыпты', warn: 'Назар', f1: 'Өрт-1', f2: 'Өрт-2', fault: 'Ақаулық', offline: 'Байланыс жоқ' };
  E.LVL = LVL;
  E.lvl = (k, lang) => ((lang || U.getLang()) === 'kk' ? LVL_KK[k] : LVL[k]) || k;

  E.RESULTS = {
    real_fire: 'Реальный пожар',
    false: 'Ложная тревога',
    fault: 'Неисправность',
    test: 'Тест',
    drill: 'Учения'
  };
  E.FALSE_CAUSES = ['Пар (кухня, душ)', 'Пыль (ремонт, уборка)', 'Курение', 'Жара / солнце', 'Неисправность датчика', 'Аэрозоль, дезинфекция', 'Другое'];
  E.FAULTS = { battery: 'Слабая батарея', dust: 'Запылённость камеры', tamper: 'Вскрытие корпуса', loop: 'Обрыв шлейфа' };

  // ------------------------------------------------------------------ init
  function startTime(night) {
    const d = new Date();
    if (d.getDay() === 0) d.setDate(d.getDate() + 1); // воскресенье → понедельник
    if (night) d.setHours(2, 15, 0, 0); else d.setHours(10, 42, 0, 0);
    return d.getTime();
  }

  E.init = function (opts) {
    opts = opts || {};
    const sd = JSON.parse(JSON.stringify(SEED));
    const t0 = startTime(opts.night);
    S = {
      sim: t0, t0, speed: 1, paused: false,
      object: sd.object, floor: sd.floor, exits: sd.exits, corridorOrder: sd.corridorOrder,
      zones: {}, zoneList: sd.zones, devices: {}, devList: sd.devices,
      thresholds: sd.thresholds, timers: sd.timers, toIntervals: sd.toIntervals,
      people: {}, peopleList: sd.people, chains: sd.chains, schedule: sd.schedule,
      gateway: { id: 'gw1', model: 'ESP32 + релейные входы + RS-485, АКБ', fw: '1.4.2', key: 'gw1-•••-7f3a', internet: true, gsm: true, battery: 100, lastSeen: t0, buffer: [], seq: 0, status: 'online', delivered: 0 },
      inflight: [], incidents: [], events: [], journal: [], tasks: [], messages: {}, unread: {}, rollcalls: [], cards: {},
      falseHist: {}, offlineHist: {}, history: [], zoneRepair: {}, incSeq: 1040, taskSeq: 310,
      tgCodes: {}, lastPlanCheck: 0, tampered: false
    };
    sd.zones.forEach((z) => { S.zones[z.id] = z; z.adj = []; });
    // соседние зоны — по общим стенам
    sd.zones.forEach((a) => sd.zones.forEach((b) => { if (a !== b && touches(a.rect, b.rect)) a.adj.push(b.id); }));
    sd.people.forEach((p) => { S.people[p.id] = p; S.messages[p.id] = []; S.unread[p.id] = 0; });
    sd.devices.forEach((d) => {
      S.devices[d.id] = d;
      const z = S.zones[d.zone];
      Object.assign(d, {
        smoke: rnd(0.5, 2), temp: baseline(z, new Date(t0).getHours()) + rnd(-0.5, 0.5), samples: [], ror: 0,
        inj: null, latched: false, warn: false, status: 'ok', faults: {}, disconnected: false,
        lastSeen: t0 - rnd(0, 25000), lastHb: t0 - rnd(0, 25000), testFlash: 0
      });
      const iv = S.toIntervals[d.kind] || 90;
      d.lastService = t0 - (rnd(5, iv - 20)) * 864e5;
    });
    // засеянная история для ТО и отчётов
    const day = 864e5;
    S.devices.d203a.lastService = t0 - (S.toIntervals.smoke - 0.2) * day; // плановая проверка сегодня
    S.devices.dc2.lastService = t0 - (S.toIntervals.smoke + 3) * day;    // просрочена на 3 дня
    S.devices.mA.lastService = t0 - (S.toIntervals.manual - 5) * day;
    S.falseHist = { dk2: [t0 - 21 * day, t0 - 6 * day], d205a: [t0 - 12 * day], dcan1: [t0 - 40 * day] };
    S.offlineHist = { d208a: 3, d205a: 2, dk2: 1 };
    seedHistory();
    journal('Система', 'Запуск системы. Объект «' + S.object.name + '», шлюз gw1 на связи', 'obj1');
    // стартовые проверки: срок службы, батарея
    sd.devices.forEach((d) => {
      if (lifeExpired(d)) createTask('repair', 'Истёк срок службы (' + d.lifeYears + ' лет с ' + d.installed + ')', d.id, 14 * day, 'life');
    });
    S.devices.d208a.faults.battery = true;
    S.devices.d208a.status = 'fault';
    createTask('repair', 'Слабая батарея (' + S.devices.d208a.battery + ' %)', 'd208a', day, 'battery');
    planCheck(true);
    fire('reset');
    return S;
  };

  function touches(a, b) {
    const [ax, ay, aw, ah] = a, [bx, by, bw, bh] = b;
    const ov = (a1, a2, b1, b2) => Math.min(a2, b2) - Math.max(a1, b1);
    if (Math.abs(ax + aw - bx) < 0.01 || Math.abs(bx + bw - ax) < 0.01) return ov(ay, ay + ah, by, by + bh) > 0.5;
    if (Math.abs(ay + ah - by) < 0.01 || Math.abs(by + bh - ay) < 0.01) return ov(ax, ax + aw, bx, bx + bw) > 0.5;
    return false;
  }

  function lifeExpired(d) { return (S.sim - new Date(d.installed).getTime()) / (365.25 * 864e5) >= d.lifeYears; }

  // Адаптивная норма зоны: средняя температура по часам за 14 дней (синтетика для демо)
  function baseline(z, hour) {
    let b = 21.5;
    if (z.type === 'kitchen') b += hour >= 8 && hour <= 14 ? 7 : 1;
    if (z.id === 'z205') b += hour >= 8 && hour <= 16 ? 2.5 : 0;
    if (z.type === 'electrical') b += 3;
    if (z.type === 'corridor') b -= 1;
    return b;
  }
  E.baseline = (zid) => baseline(S.zones[zid], new Date(S.sim).getHours());

  function seedHistory() {
    const day = 864e5, t0 = S.t0;
    const H = (daysAgo, zone, devs, level, result, cause, acc, onsite, extra) => {
      const t = t0 - daysAgo * day + rnd(-3, 3) * 3600e3;
      S.history.push(Object.assign({
        id: 'H' + (S.history.length + 1), num: 1000 + S.history.length + 1, zones: [zone], devices: devs, level, result, cause,
        test: result === 'test', times: { signal: t, accepted: acc ? t + acc * 1000 : null, onsite: onsite ? t + onsite * 1000 : null, closed: t + (onsite || 300) * 1000 + 240e3 },
        conclusion: result === 'false' ? 'Причина: ' + cause : (result === 'test' ? 'Плановый тест канала' : 'Учебная эвакуация')
      }, extra || {}));
    };
    H(28, 'zkit', ['dk2'], 'f1', 'false', 'Пар (кухня, душ)', 41, 230);
    H(24, 'z203', ['d203a'], 'f1', 'test', null, 18, 150);
    H(21, 'zkit', ['dk2'], 'f1', 'false', 'Пар (кухня, душ)', 22, 175);
    H(17, 'z205', ['d205a'], 'f1', 'false', 'Пыль (ремонт, уборка)', 35, 210);
    H(14, 'c2', ['mB'], 'f2', 'drill', null, 9, 95, { drill: { expected: 112, marked: 108, minutes: 4.5 } });
    H(12, 'z205', ['d205a'], 'f1', 'false', 'Пыль (ремонт, уборка)', 27, 260);
    H(9, 'z204', ['d204a'], 'f1', 'test', null, 14, 120);
    H(6, 'zkit', ['dk2'], 'f1', 'false', 'Пар (кухня, душ)', 19, 160);
    H(3, 'zcan', ['dcan1'], 'f1', 'test', null, 24, 180);
    H(1, 'z206', ['d206a'], 'f1', 'false', 'Аэрозоль, дезинфекция', 31, 195);
  }

  // ------------------------------------------------------------------ journal (Ф9.1, Ф9.2)
  function journal(author, action, ref) {
    const prev = S.journal.length ? S.journal[S.journal.length - 1].hash : '0'.repeat(64);
    const rec = { i: S.journal.length + 1, t: S.sim, author, action, ref: ref || '', prev };
    rec.hash = sha256(prev + '|' + rec.i + '|' + rec.t + '|' + author + '|' + action + '|' + rec.ref);
    S.journal.push(Object.freeze(rec));
    fire('journal', rec);
    return rec;
  }
  E.journal = journal;
  E.verifyJournal = function () {
    let prev = '0'.repeat(64);
    for (const r of S.journal) {
      const h = sha256(prev + '|' + r.i + '|' + r.t + '|' + r.author + '|' + r.action + '|' + r.ref);
      if (r.prev !== prev || h !== r.hash) return { ok: false, at: r.i };
      prev = r.hash;
    }
    return { ok: true, n: S.journal.length };
  };
  // Демонстрация: попытка «подправить» запись в обход системы обнаруживается проверкой
  E.tamperJournal = function () {
    const idx = Math.max(0, S.journal.length - 3);
    const r = S.journal[idx];
    S.journal[idx] = Object.freeze(Object.assign({}, r, { action: r.action + ' [изменено вручную]' }));
    S.tampered = true;
  };

  // ------------------------------------------------------------------ helpers
  E.state = () => S;
  E.now = () => S.sim;
  const pname = (pid) => (S.people[pid] ? S.people[pid].name : pid);
  E.pname = pname;
  E.zname = (zid, lang) => { const z = S.zones[zid]; if (!z) return zid; return (lang || U.getLang()) === 'kk' ? z.nameKk : z.name; };
  E.devName = (d) => { d = typeof d === 'string' ? S.devices[d] : d; return d.id.toUpperCase() + ' · ' + E.zname(d.zone); };
  E.kindName = (k) => ({ smoke: 'дымовой', heat: 'тепловой', combo: 'дым+тепло', manual: 'ручной' }[k]);

  function shift(t) {
    const d = new Date(t || S.sim), h = d.getHours(), wd = d.getDay();
    if (wd === 0) return 'weekend';
    return h >= 7 && h < 19 ? 'day' : 'night';
  }
  E.shift = shift;
  E.shiftName = (s) => ({ day: 'День', night: 'Ночь', weekend: 'Выходные' }[s]);

  // Кто ожидается в помещениях сейчас (Ф6.2)
  E.occupancy = function (t) {
    const d = new Date(t || S.sim), wd = d.getDay(), mins = d.getHours() * 60 + d.getMinutes();
    const toM = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
    const today = S.schedule.filter((r) => r.day === wd);
    // текущий урок, а на перемене — последний начавшийся (дети ещё в здании)
    const started = today.filter((r) => toM(r.start) <= mins && mins < toM(r.end) + 15);
    const res = {};
    started.forEach((r) => { if (!res[r.zone] || toM(res[r.zone].start) < toM(r.start)) res[r.zone] = r; });
    return Object.values(res);
  };

  // ------------------------------------------------------------------ simulator → devices → gateway
  function emit(dev, type, data) {
    const ev = { id: uid('ev'), dev: dev.id, zone: dev.zone, type, data: data || {}, tDev: S.sim, seq: ++S.gateway.seq };
    S.gateway.buffer.push(ev);
    if (S.gateway.buffer.length > 10000) S.gateway.buffer.shift();
    return ev;
  }

  E.sim = {
    smoke(id, opts) { const d = S.devices[id]; if (!d) return; d.inj = Object.assign({ smokeT: 70, tempT: null, sr: 2.2, tr: 0.25, until: null, t0: S.sim }, opts || {}); },
    heat(id, opts) { const d = S.devices[id]; if (!d) return; d.inj = Object.assign({ smokeT: null, tempT: 78, sr: 0, tr: 0.45, until: null, t0: S.sim }, opts || {}); },
    fireZone(zid) {
      S.devList.filter((d) => d.zone === zid && d.kind !== 'manual').forEach((d, i) => {
        d.inj = { smokeT: 75, tempT: 82, sr: 1.5 + i * 0.3, tr: 0.35 + i * 0.1, until: null, t0: S.sim };
      });
    },
    steam() { // пар на кухне: оптический датчик видит «дым», тепла почти нет
      const d = S.devices.dk2; d.inj = { smokeT: 36, tempT: null, sr: 3.5, tr: 0, until: S.sim + 25000, t0: S.sim };
      const h = S.devices.dk1; h.inj = { smokeT: null, tempT: baseline(S.zones.zkit, new Date(S.sim).getHours()) + 4, sr: 0, tr: 0.15, until: S.sim + 40000, t0: S.sim };
    },
    manual(id) { const d = S.devices[id]; if (!d || d.disconnected) return; emit(d, 'manual', {}); },
    test(id) { const d = S.devices[id]; if (!d || d.disconnected) return; d.testFlash = S.sim + 4000; emit(d, 'test', {}); },
    repeat(id, n) {
      const d = S.devices[id]; if (!d || d.disconnected) return;
      for (let i = 0; i < (n || 5); i++) emit(d, d.kind === 'manual' ? 'manual' : 'fire', { smoke: 30 + i, temp: d.temp, repeat: i + 1 });
    },
    fault(id, kind) {
      const d = S.devices[id]; if (!d || d.disconnected) return;
      if (kind === 'battery') d.battery = d.battery == null ? 12 : Math.min(d.battery, 12);
      d.faults[kind] = true; emit(d, 'fault', { kind });
    },
    disconnect(id, v) { const d = S.devices[id]; if (!d) return; d.disconnected = v; if (v) d.inj = null; },
    reset(id) { const d = S.devices[id]; if (!d) return; d.inj = null; },
    internet(v) {
      S.gateway.internet = v;
      if (v) {
        // шлюз сообщает актуальный список живых устройств
        S.devList.forEach((d) => { if (!d.disconnected) d.lastSeen = S.sim; });
        S.gateway.lastSeen = S.sim;
      }
    }
  };

  function physics(dts) {
    const hour = new Date(S.sim).getHours();
    S.devList.forEach((d) => {
      const z = S.zones[d.zone], base = baseline(z, hour);
      if (d.inj && d.inj.until && S.sim > d.inj.until) d.inj = null;
      const inj = d.inj;
      const sT = inj && inj.smokeT != null ? inj.smokeT : 1.2;
      const tT = inj && inj.tempT != null ? inj.tempT : base;
      const sr = inj && inj.smokeT != null ? inj.sr : 1.4;
      const tr = inj && inj.tempT != null ? inj.tr : 0.2;
      d.smoke += clamp(sT - d.smoke, -sr * dts, sr * dts) + rnd(-0.05, 0.05);
      d.temp += clamp(tT - d.temp, -tr * dts, tr * dts) + rnd(-0.02, 0.02);
      d.smoke = Math.max(0, d.smoke);
      d.samples.push([S.sim, d.temp]);
      while (d.samples.length && S.sim - d.samples[0][0] > 60000) d.samples.shift();
      const old = d.samples.find((s) => S.sim - s[0] <= 30000) || d.samples[0];
      const span = (S.sim - old[0]) / 60000;
      d.ror = span > 0.15 ? (d.temp - old[1]) / span : 0;

      if (d.disconnected || d.kind === 'manual') return;
      const th = S.thresholds[z.type];
      const smokeCap = d.kind === 'smoke' || d.kind === 'combo';
      const heatCap = d.kind === 'heat' || d.kind === 'combo';
      const alarm = (smokeCap && d.smoke >= th.smoke) || (heatCap && (d.temp >= th.fixed || d.ror >= th.ror));
      const warn = (smokeCap && d.smoke >= th.smoke * 0.55) || (heatCap && d.temp >= base + 8);
      if (alarm && !d.latched) {
        d.latched = true;
        emit(d, 'fire', { smoke: +d.smoke.toFixed(1), temp: +d.temp.toFixed(1), ror: +d.ror.toFixed(1) });
      } else if (!alarm && d.latched && d.smoke < th.smoke * 0.4 && (!heatCap || d.temp < th.fixed - 8)) {
        d.latched = false;
      }
      if (warn && !d.warn && !alarm) { d.warn = true; emit(d, 'warn', { smoke: +d.smoke.toFixed(1), temp: +d.temp.toFixed(1), base: +base.toFixed(1) }); }
      else if (!warn && d.warn) d.warn = false;
    });
  }

  function heartbeats() {
    const T = S.timers;
    S.devList.forEach((d) => {
      if (d.disconnected) return;
      if (S.sim - d.lastHb >= T.heartbeat * 1000) {
        d.lastHb = S.sim;
        if (S.gateway.internet) d.lastSeen = S.sim;
      }
    });
    const gw = S.gateway;
    if (gw.internet) gw.lastSeen = S.sim;
    const gwOff = S.sim - gw.lastSeen > T.offlineAfter * 1000;
    if (gwOff && gw.status === 'online') {
      gw.status = 'offline';
      journal('Система', 'Шлюз gw1: нет связи более ' + T.offlineAfter + ' с. Сигнализация на объекте работает автономно; события копятся в буфере шлюза', 'gw1');
      fire('toast', { text: 'Шлюз gw1 — нет связи. АПС на объекте работает, события буферизуются', kind: 'warn' });
    } else if (!gwOff && gw.status === 'offline') {
      gw.status = 'online';
      journal('Система', 'Шлюз gw1: связь восстановлена', 'gw1');
    }
    if (gwOff) return; // пока шлюза нет, отдельные устройства «нет связи» не объявляем
    S.devList.forEach((d) => {
      if (S.sim - d.lastSeen > T.offlineAfter * 1000) {
        if (d.status !== 'offline') {
          d.status = 'offline';
          S.offlineHist[d.id] = (S.offlineHist[d.id] || 0) + 1;
          const ev = { id: uid('ev'), dev: d.id, zone: d.zone, type: 'offline', data: {}, tDev: S.sim, tRecv: S.sim, seq: 0 };
          S.events.unshift(ev);
          journal('Система', 'Устройство ' + d.id.toUpperCase() + ' (' + E.zname(d.zone, 'ru') + '): нет связи — 3 пропуска контрольного сигнала (' + T.offlineAfter + ' с)', d.id);
          createTask('repair', 'Нет связи с устройством', d.id, 864e5, 'offline');
          fire('toast', { text: '⚫ ' + d.id.toUpperCase() + ' — нет связи. Технику создана задача', kind: 'warn' });
        }
      } else if (d.status === 'offline') {
        d.status = Object.keys(d.faults).some((k) => d.faults[k]) ? 'fault' : 'ok';
        journal('Система', 'Устройство ' + d.id.toUpperCase() + ': связь восстановлена', d.id);
      }
    });
  }

  function gatewayDeliver() {
    const gw = S.gateway;
    if (gw.internet && gw.buffer.length) {
      const wasBuffered = gw.status === 'offline' || gw.buffer.length > 3;
      const n = gw.buffer.length;
      gw.buffer.splice(0).forEach((ev) => {
        ev.buffered = S.sim - ev.tDev > 5000;
        S.inflight.push({ ev, at: S.sim + rnd(250, 900) });
      });
      if (wasBuffered && n > 1 && S.inflight.some((x) => x.ev.buffered)) {
        journal('Шлюз gw1', 'Передано из буфера событий: ' + n + ' (с исходным временем и порядковыми номерами)', 'gw1');
        fire('toast', { text: '📦 Шлюз передал из буфера: ' + n + ' событий, без потерь', kind: 'info' });
      }
    }
    const now = S.sim;
    const ready = S.inflight.filter((x) => x.at <= now).sort((a, b) => a.ev.seq - b.ev.seq);
    S.inflight = S.inflight.filter((x) => x.at > now);
    ready.forEach((x) => receive(x.ev));
  }

  // ------------------------------------------------------------------ server: event processing
  function receive(ev) {
    ev.tRecv = S.sim;
    S.gateway.delivered++;
    const d = S.devices[ev.dev];
    if (ev.type !== 'warn') { S.events.unshift(ev); if (S.events.length > 600) S.events.pop(); }
    if (d) d.lastSeen = Math.max(d.lastSeen, S.sim);
    const zn = E.zname(ev.zone, 'ru');
    const tag = ev.buffered ? ' [из буфера, задержка ' + dur((ev.tRecv - ev.tDev) / 1000) + ']' : '';
    switch (ev.type) {
      case 'fire': handleAlarm(ev, { tag }); break;
      case 'manual': handleAlarm(ev, { manual: true, tag }); break;
      case 'test': {
        const task = S.tasks.find((t) => t.status === 'open' && t.dev === ev.dev && t.rec.testReqAt && !t.rec.testRecvAt);
        if (task) {
          task.rec.testRecvAt = S.sim;
          journal('Шлюз gw1', 'Тестовый сигнал ТО получен от ' + ev.dev.toUpperCase() + ' (задача №' + task.num + ')' + tag, task.id);
          fire('toast', { text: '🧪 Тестовый сигнал от ' + ev.dev.toUpperCase() + ' получен сервером', kind: 'ok' });
        } else handleAlarm(ev, { test: true, tag });
        break;
      }
      case 'warn': {
        const r = S.zones[ev.zone];
        journal('Система', 'Внимание: ' + zn + ' — отклонение от нормы зоны (' + (ev.data.temp != null ? ev.data.temp + ' °C при норме ' + ev.data.base + ' °C, ' : '') + 'дым ' + ev.data.smoke + ')' + tag, ev.dev);
        S.events.unshift(ev);
        void r;
        break;
      }
      case 'fault': {
        const label = E.FAULTS[ev.data.kind] || ev.data.kind;
        if (d) d.status = 'fault';
        journal('Шлюз gw1', 'Неисправность ' + ev.dev.toUpperCase() + ' (' + zn + '): ' + label + tag, ev.dev);
        createTask('repair', label, ev.dev, 864e5, ev.data.kind);
        fire('toast', { text: '🟣 ' + ev.dev.toUpperCase() + ': ' + label + ' — задача технику', kind: 'warn' });
        break;
      }
    }
    fire('change');
  }

  function openAlarmFor(zone, test) {
    return S.incidents.find((i) => i.status !== 'closed' && !!i.test === !!test &&
      (i.zones.includes(zone) || i.zones.some((z) => S.zones[z].adj.includes(zone))));
  }

  function handleAlarm(ev, o) {
    const d = S.devices[ev.dev], zone = d.zone, test = !!o.test;
    let inc = openAlarmFor(zone, test);
    if (inc) {
      inc.count++;
      const newDev = !inc.devices.includes(d.id);
      if (newDev) inc.devices.push(d.id);
      if (!inc.zones.includes(zone)) inc.zones.push(zone);
      if (o.manual) inc.manual = true;
      inc.signals.push({ t: ev.tDev, dev: d.id, type: ev.type });
      journal('Шлюз gw1', 'Сигнал ' + d.id.toUpperCase() + ' (' + E.zname(zone, 'ru') + ') присоединён к инциденту №' + inc.num + ' — повтор ×' + inc.count + o.tag, inc.id);
      const prev = inc.level;
      recalc(inc);
      if (prev !== 'f2' && inc.level === 'f2') onFire2(inc, o.manual ? 'ручной извещатель' : 'второй датчик');
      fire('incident', inc);
      return;
    }
    // Ф4.7: повтор в той же зоне в течение 10 мин после закрытия — переоткрыть
    const recent = S.incidents.find((i) => i.status === 'closed' && !!i.test === test && i.zones.includes(zone) && S.sim - i.times.closed <= S.timers.reopenWindow * 1000);
    if (recent) {
      inc = recent;
      inc.status = 'new'; inc.reopened = (inc.reopened || 0) + 1; inc.count++;
      if (!inc.devices.includes(d.id)) inc.devices.push(d.id);
      inc.signals.push({ t: ev.tDev, dev: d.id, type: ev.type });
      inc.times.accepted = null; inc.times.ack = null; inc.times.onsite = null; inc.times.closed = null; inc.result = null; inc.conclusion = '';
      inc.ackDeadline = S.sim + S.timers.ackTimeout * 1000;
      if (o.manual) inc.manual = true;
      recalc(inc);
      journal('Система', 'Инцидент №' + inc.num + ' ПЕРЕОТКРЫТ: повторный сигнал в зоне ' + E.zname(zone, 'ru') + ' через ' + dur((S.sim - recent.closedAtPrev) / 1000) + ' после закрытия' + o.tag, inc.id);
      notifyAlarm(inc, inc.assignee, true);
      if (inc.level === 'f2') onFire2(inc, 'повтор');
      fire('incident:new', inc);
      return;
    }
    inc = {
      id: uid('inc'), num: ++S.incSeq, kind: 'alarm', test, manual: !!o.manual, zones: [zone], devices: [d.id], count: 1,
      signals: [{ t: ev.tDev, dev: d.id, type: ev.type }], status: 'new', level: 'f1', priority: 2,
      times: { signal: ev.tDev, received: S.sim, accepted: null, assigned: null, ack: null, onsite: null, closed: null },
      shift: shift(), chain: S.chains[shift()].slice(), chainIdx: 0, assignee: null, notified: [], photos: [], proposals: [],
      result: null, cause: null, conclusion: '', confidence: 0, reasons: [], repair: !!S.zoneRepair[zone]
    };
    recalc(inc);
    S.incidents.unshift(inc);
    const lvlTxt = inc.level === 'f2' ? 'Пожар-2' : 'Пожар-1';
    journal('Шлюз gw1', (test ? '[ТЕСТ] ' : '') + 'Тревога ' + lvlTxt + ': ' + d.id.toUpperCase() + ' (' + E.zname(zone, 'ru') + '), инцидент №' + inc.num +
      (o.manual ? ' — ручной извещатель' : ', достоверность ' + inc.confidence + ' %') + (inc.repair ? ' [зона в режиме ремонта]' : '') + o.tag, inc.id);
    // Ф4.3: ответственный предлагается автоматически по зоне и смене, сигнал сразу уходит в Telegram
    const resp = inc.chain[0];
    assign(inc, resp, 'Система', true);
    if (inc.level === 'f2') onFire2(inc, o.manual ? 'ручной извещатель' : 'два датчика', true);
    fire('incident:new', inc);
  }

  // Ф3.4 оценка достоверности
  function recalc(inc) {
    const reasons = [];
    const devs = inc.devices.map((id) => S.devices[id]);
    const distinct = devs.filter((d) => d.kind !== 'manual').length;
    if (inc.manual) {
      inc.level = 'f2';
      inc.confidence = 100;
      inc.reasons = [{ d: 100, t: 'Ручной извещатель: человек увидел огонь — уровень Пожар-2 без оценки' }];
      return;
    }
    inc.level = distinct >= 2 ? 'f2' : 'f1';
    if (inc.status === 'confirmed') inc.level = 'f2';
    let c = 35; reasons.push({ d: 35, t: 'Сработал датчик в зоне ' + E.zname(inc.zones[0], 'ru') });
    if (distinct >= 2) { c += 25; reasons.push({ d: 25, t: 'Сработали ' + distinct + ' разных датчика' }); }
    const hour = new Date(S.sim).getHours();
    const zoneDevs = S.devList.filter((d) => inc.zones.includes(d.zone));
    const heat = zoneDevs.filter((d) => (d.kind === 'heat' || d.kind === 'combo')).some((d) => d.temp >= baseline(S.zones[d.zone], hour) + 6);
    const smoke = zoneDevs.filter((d) => (d.kind === 'smoke' || d.kind === 'combo')).some((d) => d.smoke >= S.thresholds[S.zones[d.zone].type].smoke * 0.8);
    if (heat && smoke) { c += 20; reasons.push({ d: 20, t: 'Дым и тепло одновременно' }); }
    else if (smoke && zoneDevs.some((d) => d.kind === 'heat' || d.kind === 'combo')) { c -= 5; reasons.push({ d: -5, t: 'Дым без роста температуры' }); }
    const maxRor = Math.max(0, ...zoneDevs.map((d) => d.ror));
    if (maxRor >= 6) { c += 15; reasons.push({ d: 15, t: 'Быстрый рост температуры: +' + maxRor.toFixed(0) + ' °C/мин' }); }
    if (inc.zones.length > 1) { c += 10; reasons.push({ d: 10, t: 'Сигнал из соседней зоны' }); }
    const zt = S.zones[inc.zones[0]].type;
    if (zt === 'kitchen') { c -= 20; reasons.push({ d: -20, t: 'Тип зоны «кухня»: возможны пар и готовка' }); }
    if (zt === 'lab') { c += 10; reasons.push({ d: 10, t: 'Лаборатория: реактивы и горелки' }); }
    if (zt === 'electrical') { c += 10; reasons.push({ d: 10, t: 'Электрощитовая: риск возгорания проводки' }); }
    const win = S.timers.falseWindowDays * 864e5;
    const falses = inc.devices.reduce((a, id) => a + (S.falseHist[id] || []).filter((t) => S.sim - t <= win).length, 0);
    if (falses) { const p = Math.min(25, falses * 8); c -= p; reasons.push({ d: -p, t: 'История датчика: ' + falses + ' ложн. за ' + S.timers.falseWindowDays + ' дней' }); }
    if (hour >= 22 || hour < 6) { c += 10; reasons.push({ d: 10, t: 'Ночь: людей нет, пар и пыль маловероятны' }); }
    if (inc.repair || inc.zones.some((z) => S.zoneRepair[z])) { c -= 15; reasons.push({ d: -15, t: 'Зона в режиме ремонта: возможна пыль' }); }
    if (inc.count >= 3) { c += 5; reasons.push({ d: 5, t: 'Повторные сигналы ×' + inc.count }); }
    inc.confidence = clamp(Math.round(c), 5, 99);
    inc.reasons = reasons;
  }

  function onFire2(inc, why, fresh) {
    inc.level = 'f2'; inc.priority = 1;
    journal('Система', 'Инцидент №' + inc.num + ': Пожар-2 (' + why + '). Приоритет повышен, запущены перекличка эвакуации и карточка для пожарных', inc.id);
    startEvacuation(inc);
    createCard(inc);
    // обновление ответственному
    if (!fresh && inc.assignee && !inc.times.ack) notifyAlarm(inc, inc.assignee, false, true);
    fire('toast', { text: '🔴 Пожар-2 · ' + E.zname(inc.zones[0]) + ' — учителям отправлены маршруты', kind: 'alarm' });
  }

  // ------------------------------------------------------------------ notifications (М5)
  function send(pid, ch, text, buttons, meta) {
    const p = S.people[pid]; if (!p) return null;
    const m = { id: uid('m'), at: S.sim, ch, text, buttons: buttons || [], meta: meta || {}, done: null };
    S.messages[pid].push(m);
    S.unread[pid] = (S.unread[pid] || 0) + 1;
    fire('message', { pid, m });
    return m;
  }
  E.send = send;

  function hazardsText(inc, lang) {
    const hz = []; const ex = [];
    inc.zones.forEach((z) => { const zz = S.zones[z]; (zz.hazards || []).forEach((h) => hz.push(h[lang] || h.ru)); if (zz.ext) ex.push(zz.ext[lang] || zz.ext.ru); });
    return { hz: hz.length ? hz.join('; ') : (lang === 'kk' ? 'ерекше қауіп жоқ' : 'нет особых'), ex: ex.join('; ') };
  }

  function notifyAlarm(inc, pid, reopened, upgrade) {
    const p = S.people[pid]; if (!p) return;
    const lang = p.lang;
    const h = hazardsText(inc, lang);
    const kk = lang === 'kk';
    const lvl = E.lvl(inc.level, lang);
    const t = (inc.test ? '🧪 ТЕСТ · ' : '') + (inc.level === 'f2' ? '🔴 ' : '🟠 ') + lvl + (upgrade ? (kk ? ' (деңгей көтерілді)' : ' (уровень повышен)') : '') + (reopened ? (kk ? ' · қайта ашылды' : ' · переоткрыт') : '') + '\n' +
      S.object[kk ? 'nameKk' : 'name'] + '\n' +
      (kk ? 'Аймақ: ' : 'Зона: ') + inc.zones.map((z) => E.zname(z, lang)).join(', ') + '\n' +
      (inc.manual ? (kk ? 'Қолмен хабарлағыш басылды' : 'Нажат ручной извещатель') : (kk ? 'Сенімділік: ' : 'Достоверность: ') + inc.confidence + ' %') + '\n' +
      (kk ? 'Қауіптер: ' : 'Опасности: ') + h.hz + (h.ex ? '\n' + (kk ? 'Сөндіру: ' : 'Тушить: ') + h.ex : '') + '\n' +
      (kk ? 'Оқиға №' : 'Инцидент №') + inc.num;
    send(pid, 'tg', t, [
      { a: 'ack', label: U.L('Принял', lang) }, { a: 'onsite', label: U.L('На месте', lang) }, { a: 'result', label: U.L('Результат', lang) }
    ], { inc: inc.id, kind: 'alarm' });
    inc.notified.push({ pid, ch: 'tg', at: S.sim });
    journal('Система', 'Telegram → ' + p.name + ' (' + p.roleName + '): ' + (upgrade ? 'обновление до ' : '') + E.lvl(inc.level, 'ru') + ', инцидент №' + inc.num, inc.id);
  }

  function assign(inc, pid, by, auto) {
    inc.assignee = pid;
    const idx = inc.chain.indexOf(pid);
    if (idx >= 0) inc.chainIdx = idx; else inc.chain.splice(inc.chainIdx + 1, 0, pid), inc.chainIdx = inc.chainIdx + 1;
    inc.times.assigned = inc.times.assigned || S.sim;
    inc.ackDeadline = S.sim + S.timers.ackTimeout * 1000;
    journal(by, (auto ? 'Ответственный назначен автоматически (смена: ' + E.shiftName(inc.shift) + '): ' : 'Ответственный назначен: ') + pname(pid) + ', инцидент №' + inc.num, inc.id);
    if (!inc.times.ack) notifyAlarm(inc, pid);
  }

  function escalation() {
    S.incidents.forEach((inc) => {
      if (inc.status === 'closed') return;
      if (!inc.times.ack && inc.assignee && S.sim >= inc.ackDeadline) {
        const cur = inc.assignee, p = S.people[cur];
        const kk = p.lang === 'kk';
        send(cur, 'sms', (inc.test ? 'ТЕСТ. ' : '') + (kk ? 'ӨртБақылау: ' + E.lvl(inc.level, 'kk') + ', ' + E.zname(inc.zones[0], 'kk') + '. Telegram-да растау жоқ. Растаңыз!' : 'ӨртБақылау: ' + E.lvl(inc.level, 'ru') + ', ' + E.zname(inc.zones[0], 'ru') + '. Нет подтверждения в Telegram. Подтвердите!'), [], { inc: inc.id });
        journal('Система', 'Нет подтверждения от ' + p.name + ' за ' + S.timers.ackTimeout + ' с → SMS-резерв (Mobizon, демо)', inc.id);
        const next = inc.chain[inc.chainIdx + 1];
        if (next) {
          inc.chainIdx++;
          inc.assignee = next;
          inc.escalations = (inc.escalations || 0) + 1;
          inc.ackDeadline = S.sim + S.timers.ackTimeout * 1000;
          journal('Система', 'Автоэскалация инцидента №' + inc.num + ' → ' + pname(next) + ' (' + S.people[next].roleName + ')', inc.id);
          notifyAlarm(inc, next);
          fire('toast', { text: '⏫ Нет ответа 30 с — тревога ушла: ' + pname(next), kind: 'warn' });
        } else {
          inc.ackDeadline = Infinity;
          inc.chainExhausted = true;
          journal('Система', 'Цепочка эскалации исчерпана, инцидент №' + inc.num + ' требует звонка оператора', inc.id);
          fire('toast', { text: '⚠ Цепочка исчерпана — позвоните ответственным', kind: 'alarm' });
        }
        fire('incident', inc);
      }
      if (inc.times.ack && !inc.times.onsite && !inc.onsiteEsc && S.sim - inc.times.ack > S.timers.onsiteTimeout * 1000) {
        inc.onsiteEsc = true;
        send('p_dir', 'tg', 'Инцидент №' + inc.num + ': ' + pname(inc.ackBy) + ' не отметил «На месте» за ' + S.timers.onsiteTimeout / 60 + ' мин. Зона: ' + E.zname(inc.zones[0], 'ru'), [], { inc: inc.id });
        journal('Система', 'Ответственный не прибыл за ' + S.timers.onsiteTimeout / 60 + ' мин — уведомлён директор', inc.id);
      }
    });
  }

  // ------------------------------------------------------------------ operator actions (М4)
  E.op = {
    accept(id) {
      const inc = S.incidents.find((i) => i.id === id); if (!inc || inc.times.accepted) return;
      inc.times.accepted = S.sim; if (inc.status === 'new') inc.status = 'accepted';
      journal(pname('p_op') + ' (оператор)', 'Инцидент №' + inc.num + ' принят. Время реакции ' + dur((S.sim - inc.times.signal) / 1000), inc.id);
      fire('incident', inc); fire('change');
    },
    assign(id, pid) {
      const inc = S.incidents.find((i) => i.id === id); if (!inc) return;
      assign(inc, pid, pname('p_op') + ' (оператор)', false);
      fire('incident', inc); fire('change');
    },
    confirm(id) {
      const inc = S.incidents.find((i) => i.id === id); if (!inc || inc.status === 'closed') return;
      inc.status = 'confirmed';
      journal(pname('p_op') + ' (оператор)', 'Пожар подтверждён оператором, инцидент №' + inc.num, inc.id);
      if (inc.level !== 'f2') onFire2(inc, 'подтверждён'); else { startEvacuation(inc); createCard(inc); }
      recalc(inc); fire('incident', inc); fire('change');
    },
    close(id, result, cause, text) {
      const inc = S.incidents.find((i) => i.id === id); if (!inc) return { ok: false, err: 'нет инцидента' };
      if (!result) return { ok: false, err: 'Выберите результат из справочника' };
      if (result === 'false' && !cause) return { ok: false, err: 'Укажите причину ложной тревоги' };
      if (!text || text.trim().length < 5) return { ok: false, err: 'Напишите вывод (не менее 5 символов)' };
      inc.result = result; inc.cause = cause || null; inc.conclusion = text.trim();
      inc.status = 'closed'; inc.times.closed = S.sim; inc.closedAtPrev = S.sim;
      if (!inc.times.accepted) inc.times.accepted = S.sim;
      journal(pname('p_op') + ' (оператор)', 'Инцидент №' + inc.num + ' закрыт: ' + E.RESULTS[result] + (cause ? ' (' + cause + ')' : '') + '. Вывод: «' + inc.conclusion + '»', inc.id);
      inc.devices.forEach((did) => { const d = S.devices[did]; d.inj = null; });
      if (result === 'false' && !inc.test) {
        const win = S.timers.falseWindowDays * 864e5;
        inc.devices.forEach((did) => {
          (S.falseHist[did] = S.falseHist[did] || []).push(S.sim);
          const n = S.falseHist[did].filter((t) => S.sim - t <= win).length;
          if (n >= S.timers.falseLimit) createTask('repair', n + '-я ложная тревога за ' + S.timers.falseWindowDays + ' дней: очистить камеру или заменить датчик', did, 3 * 864e5, 'false');
        });
      }
      if (result === 'real_fire') {
        S.devList.filter((d) => inc.zones.includes(d.zone)).forEach((d) => createTask('repair', 'Проверка после реального пожара', d.id, 864e5, 'afterfire'));
      }
      S.rollcalls.filter((r) => r.incidentId === inc.id && r.active && result !== 'real_fire').forEach((r) => endRollcall(r.id, 'инцидент закрыт'));
      fire('incident', inc); fire('change');
      return { ok: true };
    },
    endRollcall(rid) { endRollcall(rid, 'завершена оператором'); fire('change'); },
    drill() {
      const inc = {
        id: uid('inc'), num: ++S.incSeq, kind: 'drill', test: true, drill: true, manual: false, zones: ['c2'], devices: [], count: 1, signals: [],
        status: 'accepted', level: 'f2', priority: 3, times: { signal: S.sim, received: S.sim, accepted: S.sim, assigned: null, ack: null, onsite: null, closed: null },
        shift: shift(), chain: [], chainIdx: 0, assignee: null, notified: [], photos: [], proposals: [], result: null, conclusion: '', confidence: 100,
        reasons: [{ d: 100, t: 'Учебная эвакуация, запущена оператором' }]
      };
      S.incidents.unshift(inc);
      journal(pname('p_op') + ' (оператор)', 'Запущена учебная эвакуация, инцидент №' + inc.num, inc.id);
      startEvacuation(inc, true);
      fire('incident:new', inc); fire('change');
    }
  };

  // ------------------------------------------------------------------ people actions (Telegram / страницы)
  E.person = function (pid, msgId, action, payload) {
    const p = S.people[pid]; const m = S.messages[pid].find((x) => x.id === msgId);
    if (!p || !m) return;
    const who = p.name + ' (Telegram)';
    if (m.meta.kind === 'alarm') {
      const inc = S.incidents.find((i) => i.id === m.meta.inc); if (!inc) return;
      if (inc.status === 'closed' && action !== 'photo') { U.toast('Инцидент уже закрыт'); return; }
      if (action === 'ack') {
        if (!inc.times.ack) {
          inc.times.ack = S.sim; inc.ackBy = pid; inc.assignee = pid; inc.ackDeadline = Infinity;
          journal(who, 'Подтвердил получение тревоги №' + inc.num + ' через ' + dur((S.sim - inc.times.signal) / 1000) + ' после сигнала', inc.id);
        }
        m.done = (m.done || '') + '✓ ' + U.L('Принял', p.lang) + ' ';
      } else if (action === 'onsite') {
        if (!inc.times.ack) { inc.times.ack = S.sim; inc.ackBy = pid; inc.assignee = pid; inc.ackDeadline = Infinity; }
        if (!inc.times.onsite) { inc.times.onsite = S.sim; journal(who, 'На месте: ' + E.zname(inc.zones[0], 'ru') + ', через ' + dur((S.sim - inc.times.signal) / 1000) + ' после сигнала', inc.id); }
        m.done = (m.done || '') + '✓ ' + U.L('На месте', p.lang) + ' ';
      } else if (action === 'result') {
        const r = payload; // fire | steam | dust | fault
        const map = { fire: 'Пожар подтверждён', steam: 'Ложная: пар', dust: 'Ложная: пыль', fault: 'Неисправность датчика' };
        inc.proposals.push({ by: pid, at: S.sim, r });
        if (!inc.times.onsite) inc.times.onsite = S.sim;
        if (!inc.times.ack) { inc.times.ack = S.sim; inc.ackBy = pid; inc.ackDeadline = Infinity; }
        journal(who, 'Результат проверки по инциденту №' + inc.num + ': ' + map[r], inc.id);
        m.done = (m.done || '') + '✓ ' + map[r] + ' ';
        if (r === 'fire') {
          inc.status = 'confirmed';
          if (inc.level !== 'f2') onFire2(inc, 'подтверждён на месте'); else { startEvacuation(inc); createCard(inc); }
          recalc(inc);
        }
      } else if (action === 'photo') {
        const src = photoStub(E.zname(inc.zones[0], 'ru'), hms(S.sim), p.name);
        inc.photos.push({ by: pid, at: S.sim, src });
        journal(who, 'Фото с места прикреплено к инциденту №' + inc.num, inc.id);
        m.done = (m.done || '') + '📷 ';
      }
      fire('incident', inc); fire('change');
    } else if (m.meta.kind === 'route') {
      const rc = S.rollcalls.find((r) => r.id === m.meta.rc); if (!rc) return;
      const room = rc.rooms.find((x) => x.zone === m.meta.zone); if (!room) return;
      if (!rc.active) { U.toast('Перекличка уже завершена'); return; }
      const missing = action === 'all' ? 0 : Math.max(0, Math.min(room.expected, +payload || 0));
      room.missing = missing; room.evac = room.expected - missing; room.markedAt = S.sim; room.flagged = missing > 0;
      journal(who, 'Перекличка: ' + room.group + ' (' + E.zname(room.zone, 'ru') + ') — вывел ' + room.evac + ' из ' + room.expected + (missing ? ', не хватает ' + missing : ''), rc.incidentId);
      m.done = (p.lang === 'kk' ? '✓ Шығардым ' : '✓ Вывел ') + room.evac + '/' + room.expected + (missing ? (p.lang === 'kk' ? ' · жетіспейді ' : ' · не хватает ') + missing : '');
      if (missing) fire('toast', { text: '⚠ ' + room.group + ': не хватает ' + missing + ' чел. — передано в карточку пожарных', kind: 'alarm' });
      fire('change');
    }
    S.unread[pid] = 0;
  };

  function photoStub(zone, time, who) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b5f66"/><stop offset="1" stop-color="#2b2d31"/></linearGradient></defs>' +
      '<rect width="320" height="200" fill="url(#g)"/><rect x="20" y="40" width="120" height="110" fill="#3d4047"/><rect x="170" y="70" width="130" height="80" fill="#4a3a33"/>' +
      '<circle cx="230" cy="70" r="40" fill="#9aa0a6" opacity=".35"/><circle cx="260" cy="50" r="30" fill="#c0c4c9" opacity=".25"/>' +
      '<text x="12" y="188" font-family="sans-serif" font-size="12" fill="#fff">📷 ' + zone + ' · ' + time + ' · ' + who + '</text></svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  // ------------------------------------------------------------------ evacuation / roll call (М6)
  function blockedSegs(alarmZones) {
    const b = new Set();
    alarmZones.forEach((z) => {
      const zz = S.zones[z];
      if (zz.type === 'corridor') b.add(z);
      zz.adj.forEach((a) => { if (S.zones[a].type === 'corridor') b.add(a); });
    });
    return b;
  }
  function routeFor(zid, alarmZones) {
    const z = S.zones[zid], ord = S.corridorOrder, i = ord.indexOf(z.seg);
    const blocked = blockedSegs(alarmZones);
    const mk = (exId) => {
      const ex = S.exits.find((e) => e.id === exId), j = ord.indexOf(ex.seg);
      const segs = [];
      if (j >= i) for (let k = i; k <= j; k++) segs.push(ord[k]); else for (let k = i; k >= j; k--) segs.push(ord[k]);
      const bad = segs.slice(1).some((s) => blocked.has(s)) || (alarmZones.includes(zid) ? false : false);
      return { exit: exId, segs, bad };
    };
    const primary = mk(i < 2 ? 'exB' : 'exA');
    const alt = mk(i < 2 ? 'exA' : 'exB');
    if (!primary.bad) return Object.assign(primary, { alt: false, note: '' });
    if (!alt.bad) return Object.assign(alt, { alt: true, note: 'Основной выход идёт через зону тревоги — используйте запасной' });
    return Object.assign(primary, { alt: false, stay: true, note: 'Оба пути через зону тревоги: закрыть дверь, ждать у окна, сообщить оператору' });
  }
  E.routeFor = routeFor;

  function routeText(r, lang) {
    const kk = lang === 'kk';
    const segs = r.segs.map((s) => E.zname(s, lang)).join(' → ');
    const ex = S.exits.find((e) => e.id === r.exit);
    return segs + ' → ' + (kk ? ex.nameKk : ex.name);
  }

  function startEvacuation(inc, drill) {
    if (S.rollcalls.find((r) => r.active && r.incidentId === inc.id)) return;
    const occ = E.occupancy();
    const alarmZones = drill || inc.drill ? [] : inc.zones.slice(); // на учениях зон тревоги нет — обычные маршруты
    const rc = { id: uid('rc'), incidentId: inc.id, num: inc.num, drill: !!drill || !!inc.test, active: true, startedAt: S.sim, endedAt: null, rooms: [] };
    occ.forEach((o) => {
      const route = routeFor(o.zone, alarmZones);
      rc.rooms.push({ zone: o.zone, group: o.group, teacher: o.teacher, expected: o.count, evac: null, missing: null, markedAt: null, reminded: false, flagged: false, route });
    });
    S.rollcalls.unshift(rc);
    const total = rc.rooms.reduce((a, r) => a + r.expected, 0);
    journal('Система', (rc.drill ? '[УЧЕНИЯ] ' : '') + 'Эвакуация: маршруты отправлены ' + rc.rooms.length + ' учителям, ожидается ' + total + ' чел. по расписанию', inc.id);
    rc.rooms.forEach((room) => {
      const p = S.people[room.teacher]; const kk = p.lang === 'kk';
      const r = room.route;
      const txt = (rc.drill ? (kk ? '🧪 ОҚУ ЭВАКУАЦИЯСЫ\n' : '🧪 УЧЕБНАЯ ЭВАКУАЦИЯ\n') : (kk ? '🔴 ЭВАКУАЦИЯ — ' : '🔴 ЭВАКУАЦИЯ — ') + E.zname(alarmZones[0], p.lang) + '\n') +
        (kk ? 'Сынып ' : 'Класс ') + room.group + ', ' + E.zname(room.zone, p.lang) + ' · ' + room.expected + (kk ? ' оқушы' : ' уч.') + '\n' +
        (r.stay ? (kk ? '⚠ Екі жол да дабыл аймағы арқылы: есікті жабыңыз, терезе жанында күтіңіз, операторға хабарлаңыз' : '⚠ ' + r.note)
          : (kk ? 'Бағыт: ' : 'Маршрут: ') + routeText(r, p.lang) + (r.alt ? (kk ? '\n⚠ Негізгі шығыс дабыл аймағы арқылы өтеді — қосалқы шығысты пайдаланыңыз' : '\n⚠ ' + r.note) : '')) + '\n' +
        (kk ? 'Шыққан соң белгі қойыңыз:' : 'После выхода отметьтесь:');
      send(room.teacher, 'tg', txt, [
        { a: 'all', label: (kk ? '✅ Шығардым ' : '✅ Вывел ') + room.expected + (kk ? ' / ' : ' из ') + room.expected },
        { a: 'missing', label: kk ? '⚠ Жетіспейді…' : '⚠ Не хватает…', input: true }
      ], { kind: 'route', rc: rc.id, zone: room.zone });
    });
    fire('rollcall', rc);
  }
  E.startEvacuation = (incId) => { const inc = S.incidents.find((i) => i.id === incId); if (inc) startEvacuation(inc); };

  function endRollcall(rid, why) {
    const rc = S.rollcalls.find((r) => r.id === rid); if (!rc || !rc.active) return;
    rc.active = false; rc.endedAt = S.sim;
    const ex = rc.rooms.reduce((a, r) => a + r.expected, 0), ev = rc.rooms.reduce((a, r) => a + (r.evac || 0), 0);
    const marked = rc.rooms.filter((r) => r.markedAt).length;
    journal('Система', 'Перекличка завершена (' + why + '): вышло ' + ev + ' из ' + ex + ', отметились ' + marked + ' из ' + rc.rooms.length + ' классов', rc.incidentId);
  }

  function rollcallTick() {
    S.rollcalls.forEach((rc) => {
      if (!rc.active) return;
      rc.rooms.forEach((room) => {
        if (room.markedAt) return;
        const el = (S.sim - rc.startedAt) / 1000;
        if (el >= S.timers.rollcallRemind && !room.reminded) {
          room.reminded = true;
          const p = S.people[room.teacher];
          send(room.teacher, 'tg', p.lang === 'kk' ? '⏰ Еске салу: ' + room.group + ' сыныбы бойынша белгі жоқ. Түгендеу нәтижесін жіберіңіз.' : '⏰ Напоминание: нет отметки по классу ' + room.group + '. Отправьте результат переклички.', [], { kind: 'remind' });
          journal('Система', 'Напоминание учителю ' + p.name + ' (' + room.group + '): нет отметки 3 мин', rc.incidentId);
        }
        if (el >= S.timers.rollcallFlag && !room.flagged) {
          room.flagged = true;
          journal('Система', E.zname(room.zone, 'ru') + ' (' + room.group + ') — 5 мин без отметки: в список «возможно есть люди» для пожарных', rc.incidentId);
          fire('toast', { text: '🚨 ' + E.zname(room.zone) + ' (' + room.group + ') — возможно есть люди', kind: 'alarm' });
        }
      });
    });
  }

  // ------------------------------------------------------------------ fire card (М7)
  function createCard(inc) {
    if (inc.cardToken && S.cards[inc.cardToken]) return S.cards[inc.cardToken];
    const token = Math.random().toString(36).slice(2, 8) + Math.random().toString(36).slice(2, 8);
    const c = { token, incId: inc.id, createdAt: S.sim, expiresAt: S.sim + S.timers.cardTtlHours * 3600e3, createdReal: Date.now(), expiresReal: Date.now() + S.timers.cardTtlHours * 3600e3 };
    S.cards[token] = c; inc.cardToken = token;
    journal('Система', 'Создана карточка для пожарного подразделения (ссылка и QR), срок действия ' + S.timers.cardTtlHours + ' ч, инцидент №' + inc.num, inc.id);
    fire('card', c);
    return c;
  }
  E.createCard = (incId) => { const inc = S.incidents.find((i) => i.id === incId); return inc ? createCard(inc) : null; };
  E.expireCard = (token) => { const c = S.cards[token]; if (!c) return; c.expiresAt = S.sim - 1; c.expiresReal = Date.now() - 1; journal('Система', 'Срок действия карточки пожарных истёк (демо: перемотка 6 ч)', c.incId); fire('change'); };

  E.possiblePeople = function (rc) {
    if (!rc) return [];
    return rc.rooms.filter((r) => (r.flagged && !r.markedAt) || (r.missing > 0)).map((r) => ({
      zone: r.zone, name: E.zname(r.zone, 'ru'), group: r.group, count: r.markedAt ? r.missing : r.expected, why: r.markedAt ? 'не хватает ' + r.missing : 'нет отметки 5 мин'
    }));
  };

  E.buildCard = function (token) {
    const c = S.cards[token]; if (!c) return null;
    const inc = S.incidents.find((i) => i.id === c.incId);
    const rc = S.rollcalls.find((r) => r.incidentId === inc.id);
    const o = S.object;
    const zones = S.zoneList.map((z) => ({ id: z.id, name: z.name, rect: z.rect, type: z.type, fire: inc.zones.includes(z.id) && inc.status !== 'closed' }));
    const hz = [];
    S.zoneList.forEach((z) => { if (z.hazards) hz.push({ zone: z.name, fire: inc.zones.includes(z.id), items: z.hazards.map((h) => h.ru), ext: z.ext ? z.ext.ru : '' }); });
    hz.sort((a, b) => b.fire - a.fire);
    const resp = S.people[inc.ackBy || inc.assignee || S.chains[inc.shift || 'day'][0]];
    const pp = E.possiblePeople(rc);
    const unmarked = rc ? rc.rooms.filter((r) => !r.markedAt && !r.flagged).map((r) => ({ name: E.zname(r.zone, 'ru'), group: r.group, count: r.expected })) : [];
    return {
      token, expired: S.sim > c.expiresAt, expiresAt: c.expiresReal, updated: Date.now(), simTime: hms(S.sim),
      incident: { num: inc.num, level: E.lvl(inc.level, 'ru'), status: inc.status, closed: inc.status === 'closed', result: inc.result ? E.RESULTS[inc.result] : null, test: !!inc.test, since: hms(inc.times.signal), zones: inc.zones.map((z) => E.zname(z, 'ru')) },
      object: { name: o.name, address: o.address, coords: o.coords, entry: o.fire.entry, gate: o.fire.gateCode, hydrants: o.fire.hydrants, breaker: o.fire.breaker, exits: o.fire.exits, floors: o.floors },
      plan: { w: S.floor.w, h: S.floor.h, zones, exits: S.exits.map((e) => ({ name: e.name, x: e.x, y: e.y })) },
      possiblePeople: pp, unmarked,
      rollcall: rc ? { expected: rc.rooms.reduce((a, r) => a + r.expected, 0), out: rc.rooms.reduce((a, r) => a + (r.evac || 0), 0), rooms: rc.rooms.length, marked: rc.rooms.filter((r) => r.markedAt).length } : null,
      hazards: hz,
      responsible: resp ? { name: resp.name, role: resp.roleName, phone: resp.phone } : null,
      operator: { name: S.people.p_op.name, phone: '+7 7242 00 01 01 (пульт, демо)' }
    };
  };

  // ------------------------------------------------------------------ maintenance (М8)
  function createTask(kind, reason, devId, dueIn, key) {
    const dup = S.tasks.find((t) => t.status === 'open' && t.dev === devId && t.key === (key || reason));
    if (dup) return dup;
    const t = {
      id: uid('task'), num: ++S.taskSeq, kind, reason, dev: devId, key: key || reason, createdAt: S.sim, due: S.sim + dueIn,
      status: 'open', escalated: false, assignee: 'p_tech',
      rec: { qrAt: null, inspect: false, battery: false, testReqAt: null, testRecvAt: null, photo: null, fixed: kind === 'planned' || key === 'false' || key === 'afterfire', closedAt: null }
    };
    S.tasks.unshift(t);
    journal('Система', 'Задача ТО №' + t.num + ' (' + (kind === 'planned' ? 'плановая' : 'ремонт') + '): ' + reason + ' — ' + devId.toUpperCase() + ', срок ' + U.dmy(t.due), t.id);
    fire('task', t);
    return t;
  }
  E.createTask = createTask;

  function planCheck(force) {
    if (!force && S.sim - S.lastPlanCheck < 60000) return;
    S.lastPlanCheck = S.sim;
    S.devList.forEach((d) => {
      const iv = (S.toIntervals[d.kind] || 90) * 864e5;
      const due = d.lastService + iv;
      if (due - S.sim < 7 * 864e5 && !S.tasks.find((t) => t.status === 'open' && t.dev === d.id && t.kind === 'planned')) {
        const t = createTask('planned', 'Плановая проверка (интервал ' + S.toIntervals[d.kind] + ' дн.)', d.id, 0, 'plan');
        t.due = due;
      }
    });
    S.tasks.forEach((t) => {
      if (t.status === 'open' && S.sim > t.due && !t.escalated) {
        t.escalated = true;
        send('p_dir', 'tg', '⚠ Просрочена задача ТО №' + t.num + ': ' + t.reason + ' (' + t.dev.toUpperCase() + ', ' + E.zname(S.devices[t.dev].zone, 'ru') + '). Срок был ' + U.dmy(t.due) + '. Обслуживающая организация уведомлена.', [], { kind: 'info' });
        journal('Система', 'Просрочка задачи ТО №' + t.num + ' — эскалация директору и обслуживающей организации', t.id);
      }
    });
  }

  E.tech = {
    scan(taskId, devId) {
      const t = S.tasks.find((x) => x.id === taskId); if (!t) return { ok: false };
      if (t.dev !== devId) { journal(pname('p_tech') + ' (техник)', 'QR не совпал: отсканировано ' + devId.toUpperCase() + ' вместо ' + t.dev.toUpperCase(), t.id); return { ok: false, err: 'Это другое устройство: ' + devId.toUpperCase() }; }
      t.rec.qrAt = S.sim;
      journal(pname('p_tech') + ' (техник)', 'QR-код ' + devId.toUpperCase() + ' отсканирован на месте (задача №' + t.num + ')', t.id);
      fire('change'); return { ok: true };
    },
    check(taskId, field, v) { const t = S.tasks.find((x) => x.id === taskId); if (!t || !t.rec.qrAt) return; t.rec[field] = v; fire('change'); },
    fix(taskId) {
      const t = S.tasks.find((x) => x.id === taskId); if (!t || !t.rec.qrAt) return;
      const d = S.devices[t.dev];
      if (t.key === 'offline') { d.disconnected = false; d.lastHb = S.sim - 31000; }
      if (t.key === 'battery') { d.battery = 100; d.faults.battery = false; }
      if (t.key === 'life') { d.installed = new Date(S.sim).toISOString().slice(0, 10); d.serial = 'SN-' + Math.random().toString(36).slice(2, 8).toUpperCase(); }
      if (t.key === 'false') { d.faults.dust = false; }
      Object.keys(d.faults).forEach((k) => { if (t.key === k) d.faults[k] = false; });
      if (!Object.keys(d.faults).some((k) => d.faults[k]) && d.status === 'fault') d.status = 'ok';
      t.rec.fixed = true;
      journal(pname('p_tech') + ' (техник)', 'Ремонт выполнен: ' + t.reason + ' — ' + t.dev.toUpperCase(), t.id);
      fire('change');
    },
    requestTest(taskId) {
      const t = S.tasks.find((x) => x.id === taskId); if (!t || !t.rec.qrAt) return;
      t.rec.testReqAt = S.sim;
      const d = S.devices[t.dev];
      journal(pname('p_tech') + ' (техник)', 'Тестовый аэрозоль / кнопка на ' + t.dev.toUpperCase() + ' — ожидаем тестовый сигнал на сервере', t.id);
      if (!d.disconnected) { d.testFlash = S.sim + 4000; emit(d, 'test', { to: t.id }); }
      fire('change');
    },
    photo(taskId) { const t = S.tasks.find((x) => x.id === taskId); if (!t || !t.rec.qrAt) return; t.rec.photo = photoStub(t.dev.toUpperCase() + ' ТО', hms(S.sim), pname('p_tech')); fire('change'); },
    close(taskId) {
      const t = S.tasks.find((x) => x.id === taskId); if (!t) return { ok: false };
      const r = t.rec;
      if (!r.qrAt) return { ok: false, err: 'Сначала отсканируйте QR на устройстве' };
      if (!r.testRecvAt) return { ok: false, err: 'Тестовый сигнал не дошёл до сервера — устройство не считается проверенным' };
      if (!r.fixed) return { ok: false, err: 'Отметьте выполненный ремонт' };
      if (!r.inspect) return { ok: false, err: 'Отметьте пункт «Осмотр»' };
      t.status = 'done'; r.closedAt = S.sim;
      const d = S.devices[t.dev]; d.lastService = S.sim;
      journal(pname('p_tech') + ' (техник)', 'Задача ТО №' + t.num + ' закрыта' + (S.sim > t.due ? ' (с просрочкой)' : '') + '. QR ' + hms(r.qrAt) + ', тест-сигнал ' + hms(r.testRecvAt), t.id);
      fire('change'); return { ok: true };
    }
  };

  E.health = function (d) {
    d = typeof d === 'string' ? S.devices[d] : d;
    const win = S.timers.falseWindowDays * 864e5 * 3;
    const fa = (S.falseHist[d.id] || []).filter((t) => S.sim - t <= win).length;
    const off = S.offlineHist[d.id] || 0;
    const age = (S.sim - new Date(d.installed).getTime()) / (365.25 * 864e5);
    let h = 100 - fa * 12 - off * 7 - (age / d.lifeYears) * 25;
    if (d.battery != null && d.battery < 50) h -= (50 - d.battery) * 0.6;
    if (age >= d.lifeYears) h -= 30;
    const notes = [];
    if (fa) notes.push(fa + ' ложн. за 90 дн.'); if (off) notes.push('сбоев связи: ' + off);
    if (d.battery != null) notes.push('заряд ' + d.battery + ' %'); notes.push('возраст ' + age.toFixed(1) + ' из ' + d.lifeYears + ' лет');
    return { score: clamp(Math.round(h), 0, 100), notes };
  };

  // ------------------------------------------------------------------ status for views
  E.devStatus = function (d) {
    if (d.status === 'offline') return 'offline';
    if (S.tasks.some((t) => t.status === 'open' && t.dev === d.id && t.rec.qrAt)) return d.testFlash > S.sim ? 'test' : 'maint';
    if (d.testFlash > S.sim) return 'test';
    if (S.incidents.some((i) => i.status !== 'closed' && i.devices.includes(d.id))) return 'alarm';
    if (d.latched) return 'alarm';
    if (d.status === 'fault') return 'fault';
    if (d.warn) return 'warn';
    return 'ok';
  };
  E.zoneStatus = function (zid) {
    const inc = S.incidents.find((i) => i.status !== 'closed' && i.zones.includes(zid) && i.kind === 'alarm');
    if (inc) return inc.test ? 'test' : inc.level;
    const devs = S.devList.filter((d) => d.zone === zid);
    const st = devs.map(E.devStatus);
    if (st.includes('warn')) return 'warn';
    if (st.includes('offline') || st.includes('fault')) return 'fault';
    if (S.zoneRepair[zid]) return 'repair';
    return 'ok';
  };
  E.activeRollcall = () => S.rollcalls.find((r) => r.active) || null;
  E.openIncidents = () => S.incidents.filter((i) => i.status !== 'closed');

  E.setRepair = function (zid, untilMs, note) {
    if (untilMs) { S.zoneRepair[zid] = { until: untilMs, note: note || 'ремонт' }; journal(pname('p_dir') + ' (директор)', 'Зона ' + E.zname(zid, 'ru') + ' — режим работ до ' + U.dt(untilMs) + ' (' + (note || 'ремонт') + '). Тревоги не скрываются, а помечаются', zid); }
    else { delete S.zoneRepair[zid]; journal(pname('p_dir') + ' (директор)', 'Зона ' + E.zname(zid, 'ru') + ' — режим работ снят', zid); }
    fire('change');
  };

  E.tgCode = function (pid) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    S.tgCodes[pid] = { code, until: S.sim + 600e3 };
    journal('Администратор', 'Сгенерирован одноразовый код привязки Telegram для ' + pname(pid), pid);
    return code;
  };

  E.setTime = function (night) {
    const d = new Date(S.sim);
    if (night) d.setHours(2, 15, 0, 0); else d.setHours(10, 42, 0, 0);
    const delta = d.getTime() - S.sim;
    S.sim = d.getTime();
    S.devList.forEach((x) => { x.lastSeen += delta; x.lastHb += delta; x.samples = []; });
    S.gateway.lastSeen += delta;
    journal('Система', 'Демо: время симуляции установлено ' + hm(S.sim) + ' (смена: ' + E.shiftName(shift()) + ')', 'sim');
    fire('change');
  };

  // перемотка времени для демо (шаги по 0,5 с, вся логика таймеров отрабатывает честно)
  E.skip = function (sec) {
    const n = Math.ceil(sec / 0.5);
    for (let i = 0; i < n; i++) {
      S.sim += 500; physics(0.5); heartbeats(); gatewayDeliver(); escalation(); rollcallTick(); planCheck();
    }
    S.incidents.forEach((i) => { if (i.status !== 'closed' && i.kind === 'alarm') recalc(i); });
    fire('tick'); fire('change');
  };

  // ------------------------------------------------------------------ main loop
  let lastReal = performance.now();
  E.tick = function () {
    const nowR = performance.now();
    let dtR = Math.min(0.5, (nowR - lastReal) / 1000);
    lastReal = nowR;
    if (S.paused) return;
    const dts = dtR * S.speed;
    // крупный шаг дробим, чтобы физика оставалась стабильной
    const steps = Math.max(1, Math.ceil(dts / 0.5));
    for (let i = 0; i < steps; i++) {
      S.sim += (dts / steps) * 1000;
      physics(dts / steps);
      heartbeats();
      gatewayDeliver();
      escalation();
      rollcallTick();
      planCheck();
    }
    S.incidents.forEach((i) => { if (i.status !== 'closed' && i.kind === 'alarm') recalc(i); });
    fire('tick');
  };

  return E;
})();
