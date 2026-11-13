/* Запуск, обработчики событий, звук, связь с сервером (карточка пожарных на телефоне). */
'use strict';

(function () {
  const { $, $$ } = U;
  const S = () => Engine.state();

  // ------------------------------------------------------------ sound (Ф5.5)
  let actx = null, lastBeep = 0;
  function beep() {
    if (App.muted) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t = actx.currentTime;
      [0, 0.22].forEach((o, i) => {
        const osc = actx.createOscillator(), g = actx.createGain();
        osc.type = 'square'; osc.frequency.value = i ? 660 : 880;
        g.gain.setValueAtTime(0.0001, t + o); g.gain.exponentialRampToValueAtTime(0.06, t + o + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + o + 0.18);
        osc.connect(g); g.connect(actx.destination); osc.start(t + o); osc.stop(t + o + 0.2);
      });
    } catch (e) { /* звук недоступен */ }
  }

  // ------------------------------------------------------------ views
  App.go = function (v) {
    App.view = v;
    $$('.tab').forEach((t) => t.classList.toggle('on', t.dataset.v === v));
    $$('.view').forEach((el) => { el.hidden = el.id !== 'view-' + v; });
    if (v === 'monitor' && App.mode === '3d') Plan3D.start(); else Plan3D.stop();
    const vEl = $('#view-' + v); if (vEl) vEl._h = '';
    UI.renderAll();
  };
  App.setMode = function (m) {
    if (m === '3d' && !Plan3D.isOk()) m = '2d';
    App.mode = m;
    $('#plan3d').hidden = m !== '3d'; $('#plan2d').hidden = m !== '2d';
    $$('[data-act="mode"]').forEach((b) => b.classList.toggle('on', b.dataset.v === m));
    if (m === '3d' && App.view === 'monitor') Plan3D.start(); else Plan3D.stop();
    UI.renderAll();
  };
  App.closeModal = function () { $('#modal').hidden = true; App.cardOpen = null; };
  App.restart = function (night) {
    Engine.init({ night });
    Plan2D.rebind(S()); Plan3D.rebind(S());
    App.sel = null; App.selInc = null; App.closeDraft = null; App.techTask = null; App.phoneUi = {}; App.jverify = null;
    $$('.view').forEach((el) => { el._h = ''; });
    UI.renderAll();
  };

  // ------------------------------------------------------------ engine events
  Engine.on('incident:new', (inc) => {
    if (inc.kind !== 'alarm') return;
    App.selInc = inc.id; App.sel = null;
    const z = S().zones[inc.zones[0]]; const [x, y, w, h] = z.rect;
    if (App.mode === '3d') Plan3D.flyTo(x + w / 2, y + h / 2, 26);
    U.toast((inc.test ? '🧪 ТЕСТ · ' : '🔥 ') + Engine.lvl(inc.level) + ' · ' + Engine.zname(inc.zones[0]) + ' · ' + U.L('Достоверность') + ' ' + inc.confidence + '%', inc.test ? 'info' : 'alarm');
    lastBeep = 0;
  });
  Engine.on('toast', (t) => U.toast(t.text, t.kind));

  // ------------------------------------------------------------ clicks
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    const a = b.dataset.act, id = b.dataset.id, v = b.dataset.v;
    const s = S();
    switch (a) {
      case 'view': App.go(v); break;
      case 'mode': App.setMode(v); break;
      case 'speed': s.speed = +v; UI.renderHeader(); break;
      case 'pause': s.paused = !s.paused; b.classList.toggle('on', s.paused); b.textContent = s.paused ? '▶' : '⏸'; break;
      case 'night': Engine.setTime(v === '1'); UI.renderAll(); break;
      case 'lang': U.setLang(v); document.documentElement.lang = v === 'kk' ? 'kk' : 'ru'; $$('[data-i18n]').forEach((el) => { el.textContent = U.L(el.dataset.i18n); }); $$('.view').forEach((x) => { x._h = ''; }); UI.renderAll(); break;
      case 'mute': App.muted = !App.muted; UI.renderBanner(); break;
      case 'restart': App.restart(); U.toast('Симуляция перезапущена'); break;
      case 'accept': Engine.op.accept(id); App.selInc = id; App.sel = null; break;
      case 'selInc': UI.selectInc(id); break;
      case 'gotoInc': App.go('monitor'); UI.selectInc(id); break;
      case 'pick': if (App.view !== 'monitor') App.go('monitor'); UI.pick({ type: b.dataset.type, id }); break;
      case 'confirm': Engine.op.confirm(id); break;
      case 'mkcard': Engine.createCard(id); UI.openCard(id); break;
      case 'card': UI.openCard(id); break;
      case 'evac': Engine.startEvacuation(id); break;
      case 'reassign': { const sel = $('#reassign'); if (sel) Engine.op.assign(id, sel.value); break; }
      case 'closeForm': App.closeDraft = { id, open: true, result: '', cause: '', text: '' }; $('#closeFormBox').dataset.id = ''; break;
      case 'cancelClose': App.closeDraft = null; break;
      case 'doClose': {
        const d = App.closeDraft || {};
        const r = Engine.op.close(id, $('#cf_result').value, $('#cf_cause') ? $('#cf_cause').value : '', $('#cf_text').value);
        if (!r.ok) { $('#cf_err').textContent = r.err; } else { App.closeDraft = null; U.toast('Инцидент закрыт с выводом', 'ok'); }
        void d; break;
      }
      case 'repairOn': { const days = +$('#repDays').value; Engine.setRepair(id, s.sim + days * 864e5, $('#repNote').value || 'ремонт'); break; }
      case 'repairOff': Engine.setRepair(id, null); break;
      case 'modalClose': App.closeModal(); break;
      case 'expireCard': Engine.expireCard(v); publishCards(true); U.toast('Ссылка больше не работает: прошло 6 ч', 'info'); break;
      // simulator
      case 'simSmoke': Engine.sim.smoke(App.simDev); break;
      case 'simHeat': Engine.sim.heat(App.simDev); break;
      case 'simFireZone': Engine.sim.fireZone(s.devices[App.simDev].zone); break;
      case 'simManual': Engine.sim.manual(App.simDev); break;
      case 'simTest': Engine.sim.test(App.simDev); break;
      case 'simRepeat': Engine.sim.repeat(App.simDev, 5); break;
      case 'simDisconnect': Engine.sim.disconnect(App.simDev, !s.devices[App.simDev].disconnected); U.toast(s.devices[App.simDev].disconnected ? 'Датчик ' + App.simDev.toUpperCase() + ' отключён. «Нет связи» — через ' + s.timers.offlineAfter + ' с (3 пропуска)' : 'Датчик подключён', 'info'); break;
      case 'simReset': Engine.sim.reset(App.simDev); break;
      case 'simSteam': Engine.sim.steam(); U.toast('♨ Пар от котла на кухне', 'info'); break;
      // phones
      case 'phone': App.phonePid = v; App.phoneUi = {}; break;
      case 'phonesToggle': $('#app').classList.toggle('nophones'); setTimeout(() => window.dispatchEvent(new Event('resize')), 50); break;
      case 'tg': {
        const pid = b.dataset.pid, mid = b.dataset.m, act = b.dataset.a;
        if (act === 'result') { if (App.phoneUi.resultFor === mid && v) { Engine.person(pid, mid, 'result', v); App.phoneUi = {}; } else App.phoneUi = { resultFor: mid }; }
        else if (act === 'photo') { Engine.person(pid, mid, 'photo'); App.phoneUi = {}; }
        else if (act === 'missing') { if (App.phoneUi.missingFor === mid && v) { Engine.person(pid, mid, 'missing', +v); App.phoneUi = {}; } else App.phoneUi = { missingFor: mid, missingVal: 1 }; }
        else { Engine.person(pid, mid, act); App.phoneUi = {}; }
        break;
      }
      case 'stp': App.phoneUi.missingVal = Math.max(1, (App.phoneUi.missingVal || 1) + +b.dataset.d); break;
      case 'techOpen': App.techTask = v || null; App.scanFor = null; App.techErr = ''; if (v) { App.phonePid = 'p_tech'; if ($('#app').classList.contains('nophones')) $('#app').classList.remove('nophones'); } break;
      case 'scanOpen': App.scanFor = v; break;
      case 'scan': { const r = Engine.tech.scan(b.dataset.t, v); App.techErr = r.ok ? '' : r.err; if (r.ok) App.scanFor = null; break; }
      case 'techFix': Engine.tech.fix(v); break;
      case 'techTest': Engine.tech.requestTest(v); break;
      case 'techPhoto': Engine.tech.photo(v); break;
      case 'techClose': { const r = Engine.tech.close(v); App.techErr = r.ok ? '' : r.err; if (r.ok) { U.toast('Задача ТО закрыта', 'ok'); App.techTask = null; } break; }
      case 'act': Views.actPdf(v); break;
      // views
      case 'drill': Engine.op.drill(); break;
      case 'endRc': Engine.op.endRollcall(v); break;
      case 'verify': App.jverify = Engine.verifyJournal(); break;
      case 'tamper': Engine.tamperJournal(); App.jverify = null; U.toast('Запись изменена в обход системы. Нажмите «Проверить целостность»', 'warn'); break;
      case 'xls': Views.exportXls(); break;
      case 'pdf': Views.exportPdf(); break;
      case 'schedTpl': schedTemplate(); break;
      case 'tgcode': Engine.tgCode(v); break;
      case 'chUp': { const arr = s.chains[b.dataset.sh], i = +b.dataset.i; [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; Engine.journal('Директор', 'Изменён порядок цепочки эскалации (' + Engine.shiftName(b.dataset.sh) + ')', 'chain'); break; }
      case 'planClear': App.planBg = null; Plan2D.setBackground(null); break;
      // scenario
      case 'scnStart': Scenario.start(); break;
      case 'scnNext': Scenario.next(); break;
      case 'scnPrev': Scenario.prev(); break;
      case 'scnClose': Scenario.stop(); break;
    }
    UI.renderAll();
  });

  document.addEventListener('change', (e) => {
    const t = e.target, s = S();
    if (t.id === 'simDev') { App.simDev = t.value; App.sel = { type: 'device', id: t.value }; App.selInc = null; }
    else if (t.id === 'simFault' && t.value) { Engine.sim.fault(App.simDev, t.value); t.value = ''; }
    else if (t.id === 'simNet') { Engine.sim.internet(t.checked); U.toast(t.checked ? 'Интернет шлюза восстановлен' : 'Интернет шлюза отключён — события копятся в буфере', 'info'); }
    else if (t.id === 'phonePick') { App.phonePid = t.value; App.phoneUi = {}; }
    else if (t.id === 'cf_result') { App.closeDraft.result = t.value; $('#cf_cause_w').hidden = t.value !== 'false'; }
    else if (t.id === 'cf_cause') { App.closeDraft.cause = t.value; }
    else if (t.dataset.chg === 'th') { s.thresholds[t.dataset.k][t.dataset.f] = +t.value; Engine.journal('Директор', 'Порог изменён: ' + t.dataset.k + '.' + t.dataset.f + ' = ' + t.value, 'settings'); }
    else if (t.dataset.chg === 'tm') { s.timers[t.dataset.k] = +t.value; Engine.journal('Администратор', 'Таймер изменён: ' + t.dataset.k + ' = ' + t.value, 'settings'); }
    else if (t.dataset.chg === 'toIv') { s.toIntervals[t.dataset.k] = +t.value; Engine.journal('Директор', 'Интервал ТО изменён: ' + t.dataset.k + ' = ' + t.value + ' дн.', 'settings'); }
    else if (t.dataset.chg === 'plang') { s.people[t.dataset.k].lang = t.value; }
    else if (t.dataset.chg === 'tk') { Engine.tech.check(t.dataset.t, t.dataset.f, t.checked); }
    else if (t.id === 'schedFile' && t.files[0]) importSchedule(t.files[0]);
    else if (t.id === 'planFile' && t.files[0]) { const r = new FileReader(); r.onload = () => { App.planBg = r.result; Plan2D.setBackground(r.result); App.setMode('2d'); App.go('monitor'); U.toast('План загружен подложкой в 2D', 'ok'); }; r.readAsDataURL(t.files[0]); }
    UI.renderAll();
  });
  document.addEventListener('input', (e) => {
    if (e.target.id === 'cf_text' && App.closeDraft) App.closeDraft.text = e.target.value;
    if (e.target.id === 'jq') { App.jq = e.target.value; const el = $('#view-journal'); el._h = ''; const pos = e.target.selectionStart; Views.journal(); const n = $('#jq'); if (n !== e.target) { n.focus(); n.setSelectionRange(pos, pos); } }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !/INPUT|TEXTAREA|SELECT|BUTTON/.test(document.activeElement.tagName)) {
      const inc = S().incidents.find((i) => i.kind === 'alarm' && i.status !== 'closed' && !i.times.accepted);
      if (inc) { Engine.op.accept(inc.id); App.selInc = inc.id; App.sel = null; UI.renderAll(); }
    }
    if (e.key === 'Escape') { App.closeModal(); }
  });

  // ------------------------------------------------------------ schedule Excel (Ф6.1)
  function schedTemplate() {
    if (typeof XLSX === 'undefined') return;
    const s = S();
    const rows = s.schedule.map((r) => ({ 'День (1-6)': r.day, 'Начало': r.start, 'Конец': r.end, 'Помещение': Engine.zname(r.zone, 'ru'), 'Класс': r.group, 'Учитель': Engine.pname(r.teacher), 'Учеников': r.count }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Расписание');
    XLSX.writeFile(wb, 'raspisanie_shablon.xlsx');
  }
  function importSchedule(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const wb = XLSX.read(r.result, { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: false });
        const s = S(); const out = []; const errs = [];
        const zoneBy = (v) => s.zoneList.find((z) => z.id === v || z.name === v || z.name.startsWith(String(v).trim() + ' '));
        const teacherBy = (v) => s.peopleList.find((p) => p.name === String(v).trim());
        rows.forEach((row, i) => {
          const vals = Object.values(row);
          const [day, start, end, room, group, teacher, count] = vals;
          const z = zoneBy(String(room || '').trim()); const t = teacherBy(teacher || '');
          if (!z || !t || !+count) { errs.push(i + 2); return; }
          out.push({ day: +day, start: String(start).padStart(5, '0'), end: String(end).padStart(5, '0'), zone: z.id, group: String(group), teacher: t.id, count: +count });
        });
        if (out.length) { s.schedule = out; Engine.journal('Директор', 'Импорт расписания из Excel: ' + out.length + ' строк' + (errs.length ? ', пропущено ' + errs.length : ''), 'schedule'); }
        App.schedMsg = 'Загружено строк: ' + out.length + (errs.length ? '. Не распознаны строки: ' + errs.slice(0, 10).join(', ') + ' (помещение, ФИО учителя или число учеников)' : '');
      } catch (e) { App.schedMsg = 'Не удалось прочитать файл: ' + e.message; }
      UI.renderAll();
    };
    r.readAsArrayBuffer(file);
  }

  // ------------------------------------------------------------ server link (карточка на телефоне, контроль связи)
  async function detectServer() {
    if (!location.protocol.startsWith('http')) return;
    try {
      const r = await fetch('/api/info', { cache: 'no-store' });
      if (r.ok) { App.server.mode = true; App.server.info = await r.json(); App.server.lastOk = Date.now(); }
    } catch (e) { /* статический хостинг без API */ }
  }
  async function ping() {
    if (!App.server.mode) return;
    try { const r = await fetch('/api/ping', { cache: 'no-store' }); if (r.ok) App.server.lastOk = Date.now(); } catch (e) { /* нет связи */ }
    App.server.ok = Date.now() - App.server.lastOk < 10000; // Ф: красная плашка после 10 с без связи
  }
  let lastPub = 0;
  function publishCards(force) {
    if (!force && Date.now() - lastPub < 2000) return;
    lastPub = Date.now();
    const s = S();
    Object.keys(s.cards).forEach((token) => {
      const data = Engine.buildCard(token);
      try { localStorage.setItem('ortb_card_' + token, JSON.stringify(data)); } catch (e) { /* хранилище недоступно */ }
      if (App.server.mode) fetch('/api/card', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, expiresAt: s.cards[token].expiresReal, data }) }).catch(() => {});
    });
  }

  // ------------------------------------------------------------ boot
  function boot() {
    Engine.init();
    const pick = (sel) => UI.pick(sel);
    Plan2D.mount($('#plan2d'), S(), pick);
    const ok3d = Plan3D.mount($('#plan3d'), S(), pick);
    App.setMode(ok3d && window.innerWidth > 700 ? '3d' : '2d');
    App.go('monitor');
    detectServer();
    setInterval(() => {
      Engine.tick();
      Scenario.tick();
      const pend = S().incidents.some((i) => i.kind === 'alarm' && i.status !== 'closed' && !i.times.accepted);
      if (pend && Date.now() - lastBeep > 1400) { lastBeep = Date.now(); beep(); }
      publishCards();
    }, 200);
    let lastR = 0;
    Engine.on('tick', () => { const n = performance.now(); if (n - lastR > 400) { lastR = n; UI.renderAll(); } });
    setInterval(ping, 3000);
    window.addEventListener('resize', () => { if (App.mode === '2d') UI.renderPlan(); });
    if (location.hash === '#demo') setTimeout(() => Scenario.start(), 400);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
