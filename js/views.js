/* Вкладки: инциденты, эвакуация, ТО, журнал, отчёты, настройки. */
'use strict';

window.Views = (function () {
  const { $, esc, L, hms, hm, dur, mmss, median, dmy, dt } = U;
  const S = () => Engine.state();
  const P = (h) => UI.patch($('#view-' + App.view), h);

  // ------------------------------------------------------------ incidents (all)
  function incidents() {
    const s = S();
    const rows = s.incidents.concat(s.history.map((h) => Object.assign({ hist: true, status: 'closed' }, h)));
    const h = '<div class="vhead"><h2>' + L('Инциденты') + '</h2><span class="muted">текущая сессия и история за 30 дней</span></div>' +
      '<div class="tablewrap"><table class="tbl"><thead><tr><th>№</th><th>Время сигнала</th><th>Зона</th><th>Уровень</th><th>Достов.</th><th>Принят через</th><th>На месте через</th><th>Статус / результат</th><th>Вывод</th></tr></thead><tbody>' +
      rows.map((i) => {
        const t = i.times;
        return '<tr' + (i.hist ? ' class="hist"' : ' data-act="gotoInc" data-id="' + i.id + '"') + '><td>' + i.num + (i.test ? ' <span class="tag">ТЕСТ</span>' : '') + '</td><td>' + dt(t.signal) + '</td><td>' + esc(i.zones.map((z) => Engine.zname(z)).join(' + ')) + (i.count > 1 ? ' ×' + i.count : '') + '</td>' +
          '<td><span class="lvchip lv-' + i.level + '">' + Engine.lvl(i.level) + '</span></td><td>' + (i.confidence != null ? i.confidence + '%' : '—') + '</td>' +
          '<td>' + (t.accepted ? dur((t.accepted - t.signal) / 1000) : '—') + '</td><td>' + (t.onsite ? dur((t.onsite - t.signal) / 1000) : '—') + '</td>' +
          '<td>' + (i.status === 'closed' ? esc(Engine.RESULTS[i.result] || '') + (i.cause ? ' · ' + esc(i.cause) : '') : '<b>' + esc({ new: 'новый', accepted: 'принят', confirmed: 'подтверждён' }[i.status]) + '</b>') + '</td><td class="wrap">' + esc(i.conclusion || '') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    P(h);
  }

  // ------------------------------------------------------------ evacuation (М6)
  function evac() {
    const s = S();
    const rc = Engine.activeRollcall() || s.rollcalls[0];
    let h = '<div class="vhead"><h2>' + L('Эвакуация') + ' и ' + L('Перекличка').toLowerCase() + '</h2><span class="sp"></span>' +
      '<button class="btn" data-act="drill">🧪 ' + L('Учебная эвакуация') + '</button></div>';
    if (rc) {
      const ex = rc.rooms.reduce((a, r) => a + r.expected, 0), out = rc.rooms.reduce((a, r) => a + (r.evac || 0), 0);
      const marked = rc.rooms.filter((r) => r.markedAt).length;
      const el = ((rc.active ? s.sim : rc.endedAt) - rc.startedAt) / 1000;
      const pp = Engine.possiblePeople(rc);
      h += '<div class="evacgrid"><div class="panel"><div class="ph"><h3>' + (rc.drill ? 'Учения · ' : '') + 'Инцидент №' + rc.num + (rc.active ? '' : ' · завершена') + '</h3><span class="muted">' + mmss(el) + ' с начала</span></div>' +
        '<div class="hero"><b>' + out + '</b><span> ' + L('из') + ' ' + ex + '</span><div class="muted">' + L('вышло') + ' · отметились ' + marked + ' из ' + rc.rooms.length + ' классов</div></div>' +
        '<div class="prog big"><i style="width:' + (ex ? out / ex * 100 : 0) + '%"></i></div>' +
        '<div class="muted small">Напоминание учителю — через ' + s.timers.rollcallRemind / 60 + ' мин без отметки, через ' + s.timers.rollcallFlag / 60 + ' мин помещение уходит в список «возможно есть люди» для пожарных.</div>' +
        (rc.active ? '<div class="row"><button class="btn" data-act="endRc" data-v="' + rc.id + '">Завершить перекличку</button>' + (s.incidents.find((i) => i.id === rc.incidentId && i.cardToken) ? '<button class="btn" data-act="card" data-id="' + rc.incidentId + '">🚒 Карточка для пожарных</button>' : '') + '</div>' : '') +
        '</div><div class="panel ' + (pp.length ? 'alarmp' : '') + '"><div class="ph"><h3>🚨 ' + L('Возможно есть люди') + '</h3></div>' +
        (pp.length ? pp.map((p) => '<div class="pprow"><b>' + esc(p.name) + '</b> · ' + esc(p.group) + '<span class="sp"></span><span>' + p.count + ' чел. · ' + esc(p.why) + '</span></div>').join('') : '<div class="empty small">Нет — список пополняется через 5 мин без отметки или при «не хватает K»</div>') + '</div></div>';
      h += '<div class="tablewrap"><table class="tbl"><thead><tr><th>Класс</th><th>Помещение</th><th>Учитель</th><th>Ожидалось</th><th>Вывел</th><th>Отметка</th><th>Маршрут</th><th>Статус</th></tr></thead><tbody>' +
        rc.rooms.map((r) => {
          const ex2 = s.exits.find((e) => e.id === r.route.exit);
          const st = r.markedAt ? (r.missing ? '<span class="chip red">не хватает ' + r.missing + '</span>' : '<span class="chip green">✓ все</span>') : (r.flagged ? '<span class="chip red">возможно есть люди</span>' : r.reminded ? '<span class="chip amber">напомнили</span>' : '<span class="chip amber">ждём</span>');
          return '<tr><td><b>' + esc(r.group) + '</b></td><td>' + esc(Engine.zname(r.zone)) + '</td><td>' + esc(Engine.pname(r.teacher)) + '</td><td>' + r.expected + '</td><td>' + (r.evac != null ? r.evac : '—') + '</td><td>' + (r.markedAt ? hms(r.markedAt) + ' (+' + dur((r.markedAt - rc.startedAt) / 1000) + ')' : '—') + '</td>' +
            '<td>' + (r.route.stay ? '<span class="chip red">оставаться, ждать помощи</span>' : esc(ex2.name) + (r.route.alt ? ' <span class="chip amber">запасной: основной через зону тревоги</span>' : '')) + '</td><td>' + st + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    const occ = Engine.occupancy();
    const tot = occ.reduce((a, o) => a + o.count, 0);
    h += '<div class="evacgrid"><div class="panel"><div class="ph"><h3>' + L('Ожидается сейчас') + ' по расписанию</h3><span class="muted">' + hm(s.sim) + ' · ' + tot + ' чел.</span></div>' +
      (occ.length ? '<table class="tbl"><thead><tr><th>Помещение</th><th>Класс</th><th>Учитель</th><th>Время</th><th>Учеников</th></tr></thead><tbody>' + occ.map((o) => '<tr><td>' + esc(Engine.zname(o.zone)) + '</td><td>' + esc(o.group) + '</td><td>' + esc(Engine.pname(o.teacher)) + '</td><td>' + o.start + '–' + o.end + '</td><td>' + o.count + '</td></tr>').join('') + '</tbody></table>' : '<div class="empty small">Сейчас по расписанию в здании никого нет</div>') +
      '<div class="muted small">Хранится только число учеников, без списков детей.</div></div>' +
      '<div class="panel"><div class="ph"><h3>Расписание (импорт из Excel)</h3></div><div class="small">Колонки: день недели (1–6), начало, конец, помещение (id или название), класс, учитель (ФИО), учеников.</div>' +
      '<div class="row"><label class="btn"><input type="file" id="schedFile" accept=".xlsx,.xls,.csv" hidden>📥 Загрузить .xlsx</label><button class="btn" data-act="schedTpl">📄 Скачать шаблон (текущее)</button></div>' +
      '<div class="muted small">Записей в расписании: ' + s.schedule.length + '</div>' + (App.schedMsg ? '<div class="note">' + esc(App.schedMsg) + '</div>' : '') + '</div></div>';
    P(h);
  }

  // ------------------------------------------------------------ maintenance (М8)
  function to() {
    const s = S();
    const tasks = s.tasks.slice().sort((a, b) => (a.status === 'done') - (b.status === 'done') || a.due - b.due);
    let h = '<div class="vhead"><h2>' + L('Задачи ТО') + '</h2><span class="muted">исполнитель — ' + esc(Engine.pname('p_tech')) + ', мобильная страница техника справа</span></div>';
    h += '<div class="tablewrap"><table class="tbl"><thead><tr><th>№</th><th>Тип</th><th>Причина</th><th>Устройство</th><th>Срок</th><th>QR</th><th>Тест-сигнал</th><th>Статус</th><th></th></tr></thead><tbody>' +
      tasks.map((t) => {
        const over = t.status === 'open' && s.sim > t.due;
        const d = s.devices[t.dev];
        return '<tr class="' + (over ? 'over' : '') + (t.status === 'done' ? ' hist' : '') + '"><td>' + t.num + '</td><td>' + (t.kind === 'planned' ? 'плановая' : 'ремонт') + '</td><td class="wrap">' + esc(t.reason) + '</td>' +
          '<td data-act="pick" data-type="device" data-id="' + t.dev + '" class="lnk">' + t.dev.toUpperCase() + ' · ' + esc(Engine.zname(d.zone)) + '</td><td>' + dmy(t.due) + (over ? ' <span class="chip red">просрочено' + (t.escalated ? ', эскалация директору' : '') + '</span>' : '') + '</td>' +
          '<td>' + (t.rec.qrAt ? '✓ ' + hm(t.rec.qrAt) : '—') + '</td><td>' + (t.rec.testRecvAt ? '✓ ' + hms(t.rec.testRecvAt) : t.rec.testReqAt ? '⏳ не дошёл' : '—') + '</td>' +
          '<td>' + (t.status === 'done' ? '<span class="chip green">выполнено</span>' : '<span class="chip amber">открыта</span>') + '</td>' +
          '<td>' + (t.status === 'done' ? '<button class="btn sm" data-act="act" data-v="' + t.id + '">Акт PDF</button>' : '<button class="btn sm" data-act="techOpen" data-v="' + t.id + '">Открыть у техника</button>') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    const hl = s.devList.map((d) => ({ d, h: Engine.health(d) })).sort((a, b) => a.h.score - b.h.score);
    h += '<div class="evacgrid"><div class="panel"><div class="ph"><h3>Индекс состояния устройств</h3><span class="muted">сбои связи, ложные, заряд, возраст</span></div>' +
      hl.slice(0, 10).map(({ d, h: x }) => '<div class="hbar" data-act="pick" data-type="device" data-id="' + d.id + '" title="' + esc(x.notes.join(' · ')) + '"><span class="hn">' + d.id.toUpperCase() + '</span><span class="track"><i class="' + (x.score < 60 ? 'bad' : x.score < 80 ? 'mid' : '') + '" style="width:' + x.score + '%"></i></span><b>' + x.score + '</b>' + (x.score < 60 ? '<span class="chip red">заменить в ближайший месяц</span>' : '') + '</div>').join('') + '</div>' +
      '<div class="panel"><div class="ph"><h3>График ТО по типам</h3></div><table class="tbl"><thead><tr><th>Тип устройства</th><th>Интервал, дней</th><th>Устройств</th></tr></thead><tbody>' +
      Object.keys(s.toIntervals).map((k) => '<tr><td>' + Engine.kindName(k) + '</td><td><input class="num" type="number" min="7" max="365" data-chg="toIv" data-k="' + k + '" value="' + s.toIntervals[k] + '"></td><td>' + s.devList.filter((d) => d.kind === k).length + '</td></tr>').join('') + '</tbody></table>' +
      '<div class="muted small">Задачи создаются автоматически за 7 дней до срока. Просрочка — эскалация директору и обслуживающей организации. Закрыть проверку можно только после сканирования QR и получения тестового сигнала на сервере.</div></div></div>';
    P(h);
  }

  // ------------------------------------------------------------ journal (М9)
  function journal() {
    const s = S();
    const q = (App.jq || '').toLowerCase();
    const rows = s.journal.slice().reverse().filter((j) => !q || (j.author + ' ' + j.action + ' ' + j.ref).toLowerCase().includes(q)).slice(0, 400);
    const v = App.jverify;
    const h = '<div class="vhead"><h2>' + L('Журнал') + '</h2><span class="muted">' + s.journal.length + ' записей · только дополняется</span><span class="sp"></span>' +
      '<input id="jq" placeholder="Поиск…" value="' + esc(App.jq || '') + '">' +
      '<button class="btn" data-act="verify">🔗 ' + L('Проверить целостность') + '</button><button class="btn ghost sm" data-act="tamper" title="Демонстрация: запись меняют в обход системы">Демо: подделать запись</button></div>' +
      (v ? '<div class="note ' + (v.ok ? 'okn' : 'badn') + '">' + (v.ok ? '✓ Цепочка хэшей SHA-256 цела: ' + v.n + ' записей' : '✗ Нарушена целостность журнала на записи №' + v.at + ' — запись изменена после создания') + '</div>' : '') +
      '<div class="tablewrap"><table class="tbl jt"><thead><tr><th>#</th><th>' + L('Время') + '</th><th>' + L('Автор') + '</th><th>' + L('Действие') + '</th><th>Хэш</th></tr></thead><tbody>' +
      rows.map((j) => '<tr><td>' + j.i + '</td><td class="nw">' + dt(j.t) + '</td><td class="nw">' + esc(j.author) + '</td><td class="wrap">' + esc(j.action) + '</td><td class="mono small" title="prev ' + j.prev + '">' + j.hash.slice(0, 12) + '…</td></tr>').join('') +
      '</tbody></table></div><div class="muted small">Изменить или удалить запись нельзя ни одной роли: интерфейса для этого нет, а каждая запись содержит хэш предыдущей.</div>';
    P(h);
  }

  // ------------------------------------------------------------ reports (М9)
  function reportData() {
    const s = S();
    const all = s.history.concat(s.incidents.filter((i) => i.status === 'closed' && !i.drill));
    const alarms = all.filter((i) => !i.drill && i.result !== 'drill');
    const acc = alarms.filter((i) => i.times.accepted).map((i) => (i.times.accepted - i.times.signal) / 1000);
    const ons = alarms.filter((i) => i.times.onsite).map((i) => (i.times.onsite - i.times.signal) / 1000);
    const noConc = all.filter((i) => !i.conclusion || !i.result).length;
    const falses = all.filter((i) => i.result === 'false');
    const byZone = {}; const byDev = {};
    falses.forEach((i) => { i.zones.forEach((z) => { byZone[z] = (byZone[z] || 0) + 1; }); i.devices.forEach((d) => { byDev[d] = (byDev[d] || 0) + 1; }); });
    const tasks = s.tasks;
    const done = tasks.filter((t) => t.status === 'done'); const late = done.filter((t) => t.rec.closedAt > t.due).length;
    const overdueOpen = tasks.filter((t) => t.status === 'open' && s.sim > t.due).length;
    const drills = s.history.filter((h) => h.drill).map((h) => ({ date: dmy(h.times.signal), expected: h.drill.expected, marked: h.drill.marked, minutes: h.drill.minutes }));
    s.rollcalls.slice().reverse().filter((rc) => !rc.active).forEach((rc) => { const ex = rc.rooms.reduce((a, r) => a + r.expected, 0); drills.push({ date: dmy(rc.startedAt) + (rc.drill ? ' (учения)' : ' (реальная)'), expected: ex, marked: rc.rooms.reduce((a, r) => a + (r.evac || 0), 0), minutes: +(((rc.endedAt || s.sim) - rc.startedAt) / 60000).toFixed(1), classes: rc.rooms.filter((r) => r.markedAt).length + '/' + rc.rooms.length }); });
    const devSt = { ok: 0, fault: 0, offline: 0, other: 0 };
    s.devList.forEach((d) => { const st = Engine.devStatus(d); if (st === 'ok') devSt.ok++; else if (st === 'fault') devSt.fault++; else if (st === 'offline') devSt.offline++; else devSt.other++; });
    return { all, alarms, acc, ons, noConc, falses, byZone, byDev, done, late, overdueOpen, tasks, drills, devSt };
  }

  function bars(obj, nameFn) {
    const ks = Object.keys(obj).sort((a, b) => obj[b] - obj[a]);
    const max = Math.max(1, ...ks.map((k) => obj[k]));
    if (!ks.length) return '<div class="empty small">Нет данных</div>';
    return ks.map((k) => '<div class="hbar" title="' + esc(nameFn(k)) + ': ' + obj[k] + '"><span class="hn">' + esc(nameFn(k)) + '</span><span class="track"><i class="seq" style="width:' + (obj[k] / max * 100) + '%"></i></span><b>' + obj[k] + '</b></div>').join('');
  }

  function reports() {
    const r = reportData();
    const ma = median(r.acc), mo = median(r.ons);
    const tile = (label, val, goal, good) => '<div class="tile"><small>' + label + '</small><b>' + val + '</b><span class="' + (good == null ? 'muted' : good ? 'ok' : 'bad') + '">' + (good == null ? '' : good ? '✓ ' : '✗ ') + goal + '</span></div>';
    const fd = r.drills.length ? r.drills[r.drills.length - 1] : null;
    const h = '<div class="vhead"><h2>' + L('Отчёты') + '</h2><span class="muted">за 30 дней · пилот</span><span class="sp"></span><button class="btn" data-act="xls">📊 ' + L('Экспорт Excel') + '</button><button class="btn" data-act="pdf">🖨 ' + L('Экспорт PDF') + '</button></div>' +
      '<div class="tiles">' +
      tile('Медиана принятия тревоги', ma != null ? dur(ma) : '—', 'цель ≤ 30 с', ma != null ? ma <= 30 : null) +
      tile('Медиана до «На месте»', mo != null ? dur(mo) : '—', 'цель ≤ 3 мин', mo != null ? mo <= 180 : null) +
      tile('Инциденты без вывода', r.noConc + ' из ' + r.all.length, 'цель 0 %', r.noConc === 0) +
      tile('Ложные тревоги', String(r.falses.length), 'цель — снизить вдвое', null) +
      tile('ТО закрыто с просрочкой', r.done.length ? Math.round(r.late / r.done.length * 100) + ' %' : '—', 'цель ≤ 5 %', r.done.length ? r.late / r.done.length <= 0.05 : null) +
      tile('Полнота переклички', fd ? Math.round(fd.marked / fd.expected * 100) + ' %' : '—', 'цель ≥ 95 %', fd ? fd.marked / fd.expected >= 0.95 : null) +
      '</div><div class="evacgrid"><div class="panel"><div class="ph"><h3>Ложные тревоги по зонам</h3></div>' + bars(r.byZone, (k) => Engine.zname(k)) +
      '<div class="ph sub"><h3>по датчикам</h3></div>' + bars(r.byDev, (k) => k.toUpperCase()) + '</div>' +
      '<div class="panel"><div class="ph"><h3>Состояние устройств</h3></div><div class="tiles mini">' +
      '<div class="tile"><small>Норма</small><b>' + r.devSt.ok + '</b></div><div class="tile"><small>🟣 Неисправность</small><b>' + r.devSt.fault + '</b></div><div class="tile"><small>⚫ Нет связи</small><b>' + r.devSt.offline + '</b></div><div class="tile"><small>Тревога / ТО</small><b>' + r.devSt.other + '</b></div></div>' +
      '<div class="ph sub"><h3>Выполнение ТО</h3></div><div class="small">Задач всего: ' + r.tasks.length + ' · выполнено: ' + r.done.length + ' · открыто просроченных: ' + r.overdueOpen + '</div>' +
      '<div class="ph sub"><h3>Итоги эвакуаций</h3></div><table class="tbl"><thead><tr><th>Дата</th><th>Ожидалось</th><th>Вышло</th><th>Время, мин</th></tr></thead><tbody>' + r.drills.map((d) => '<tr><td>' + esc(d.date) + '</td><td>' + d.expected + '</td><td>' + d.marked + '</td><td>' + d.minutes + '</td></tr>').join('') + '</tbody></table></div></div>';
    P(h);
  }

  function exportXls() {
    if (typeof XLSX === 'undefined') { U.toast('Библиотека Excel не загружена'); return; }
    const s = S(); const r = reportData();
    const wb = XLSX.utils.book_new();
    const inc = r.all.map((i) => ({ '№': i.num, 'Сигнал': dt(i.times.signal), 'Зона': i.zones.map((z) => Engine.zname(z, 'ru')).join(' + '), 'Уровень': Engine.lvl(i.level, 'ru'), 'Тест': i.test ? 'да' : '', 'Принят, с': i.times.accepted ? Math.round((i.times.accepted - i.times.signal) / 1000) : '', 'На месте, с': i.times.onsite ? Math.round((i.times.onsite - i.times.signal) / 1000) : '', 'Результат': Engine.RESULTS[i.result] || '', 'Причина': i.cause || '', 'Вывод': i.conclusion || '' }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(inc), 'Инциденты');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(Object.keys(r.byDev).map((k) => ({ 'Датчик': k.toUpperCase(), 'Зона': Engine.zname(s.devices[k].zone, 'ru'), 'Ложных': r.byDev[k] }))), 'Ложные тревоги');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.devList.map((d) => { const h = Engine.health(d); return { 'Устройство': d.id.toUpperCase(), 'Модель': d.model, 'Серийный №': d.serial, 'Зона': Engine.zname(d.zone, 'ru'), 'Статус': UI.DSTAT[Engine.devStatus(d)], 'Индекс': h.score, 'Установлен': d.installed, 'Последнее ТО': dmy(d.lastService) }; })), 'Устройства');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.tasks.map((t) => ({ '№': t.num, 'Тип': t.kind === 'planned' ? 'плановая' : 'ремонт', 'Причина': t.reason, 'Устройство': t.dev.toUpperCase(), 'Срок': dmy(t.due), 'Статус': t.status === 'done' ? 'выполнено' : 'открыта', 'QR': t.rec.qrAt ? dt(t.rec.qrAt) : '', 'Тест-сигнал': t.rec.testRecvAt ? dt(t.rec.testRecvAt) : '', 'Закрыта': t.rec.closedAt ? dt(t.rec.closedAt) : '' }))), 'ТО');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(r.drills.map((d) => ({ 'Дата': d.date, 'Ожидалось': d.expected, 'Вышло': d.marked, 'Время, мин': d.minutes }))), 'Эвакуации');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.journal.map((j) => ({ '#': j.i, 'Время': dt(j.t), 'Автор': j.author, 'Действие': j.action, 'Хэш': j.hash }))), 'Журнал');
    XLSX.writeFile(wb, 'OrtBakylau_otchet_' + dmy(s.sim).replace(/\./g, '-') + '.xlsx');
    Engine.journal('Оператор', 'Экспорт отчёта в Excel', 'report');
  }

  function printHtml(title, body) {
    const el = $('#print');
    el.innerHTML = '<div class="pr"><div class="prh"><b>ӨртБақылау</b> · ' + esc(S().object.name) + ' · ' + esc(S().object.address) + '<span>' + dt(S().sim) + '</span></div><h1>' + esc(title) + '</h1>' + body + '</div>';
    setTimeout(() => window.print(), 50);
  }
  function exportPdf() {
    const r = reportData(); const ma = median(r.acc), mo = median(r.ons);
    const body = '<h2>Ключевые показатели</h2><table><tr><td>Медиана принятия тревоги</td><td>' + (ma != null ? dur(ma) : '—') + ' (цель ≤ 30 с)</td></tr><tr><td>Медиана до «На месте»</td><td>' + (mo != null ? dur(mo) : '—') + ' (цель ≤ 3 мин)</td></tr><tr><td>Инциденты без вывода</td><td>' + r.noConc + ' из ' + r.all.length + '</td></tr><tr><td>Ложные тревоги</td><td>' + r.falses.length + '</td></tr></table>' +
      '<h2>Инциденты</h2><table><tr><th>№</th><th>Сигнал</th><th>Зона</th><th>Уровень</th><th>Результат</th><th>Вывод</th></tr>' + r.all.map((i) => '<tr><td>' + i.num + '</td><td>' + dt(i.times.signal) + '</td><td>' + esc(i.zones.map((z) => Engine.zname(z, 'ru')).join(' + ')) + '</td><td>' + Engine.lvl(i.level, 'ru') + '</td><td>' + esc(Engine.RESULTS[i.result] || '') + (i.cause ? ' (' + esc(i.cause) + ')' : '') + '</td><td>' + esc(i.conclusion || '') + '</td></tr>').join('') + '</table>' +
      '<h2>Ложные тревоги по датчикам</h2><table>' + Object.keys(r.byDev).map((k) => '<tr><td>' + k.toUpperCase() + '</td><td>' + r.byDev[k] + '</td></tr>').join('') + '</table>' +
      '<h2>Техническое обслуживание</h2><p>Задач: ' + r.tasks.length + ', выполнено: ' + r.done.length + ', с просрочкой: ' + r.late + ', открыто просроченных: ' + r.overdueOpen + '</p>' +
      '<h2>Эвакуации</h2><table><tr><th>Дата</th><th>Ожидалось</th><th>Вышло</th><th>Мин</th></tr>' + r.drills.map((d) => '<tr><td>' + esc(d.date) + '</td><td>' + d.expected + '</td><td>' + d.marked + '</td><td>' + d.minutes + '</td></tr>').join('') + '</table>' +
      '<p class="sig">Ответственный за пожарную безопасность: ____________________ &nbsp;&nbsp; Директор: ____________________</p>';
    printHtml('Отчёт по пожарной безопасности', body);
    Engine.journal('Оператор', 'Экспорт отчёта в PDF', 'report');
  }
  function actPdf(taskId) {
    const s = S(); const t = s.tasks.find((x) => x.id === taskId); if (!t) return;
    const d = s.devices[t.dev];
    const body = '<p>Задача ТО №' + t.num + ' (' + (t.kind === 'planned' ? 'плановая проверка' : 'ремонт') + '): ' + esc(t.reason) + '</p>' +
      '<table><tr><td>Устройство</td><td>' + t.dev.toUpperCase() + ' · ' + esc(d.model) + ' · ' + esc(d.serial) + '</td></tr><tr><td>Помещение</td><td>' + esc(Engine.zname(d.zone, 'ru')) + '</td></tr>' +
      '<tr><td>Исполнитель</td><td>' + esc(Engine.pname('p_tech')) + ', ТОО «ОртСервис» (демо)</td></tr><tr><td>QR отсканирован</td><td>' + dt(t.rec.qrAt) + '</td></tr>' +
      '<tr><td>Осмотр</td><td>' + (t.rec.inspect ? 'выполнен' : '—') + '</td></tr><tr><td>Батарея</td><td>' + (t.rec.battery ? 'проверена' + (d.battery != null ? ' (' + d.battery + ' %)' : '') : '—') + '</td></tr>' +
      '<tr><td>Тестовый сигнал получен сервером</td><td>' + dt(t.rec.testRecvAt) + '</td></tr><tr><td>Закрыта</td><td>' + dt(t.rec.closedAt) + (t.rec.closedAt > t.due ? ' (с просрочкой)' : '') + '</td></tr></table>' +
      (t.rec.photo ? '<p><img src="' + t.rec.photo + '" style="width:240px"></p>' : '') +
      '<p class="sig">Исполнитель: ____________________ &nbsp;&nbsp; Принял (объект): ____________________</p>';
    printHtml('Акт выполненных работ', body);
  }

  // ------------------------------------------------------------ settings (М11)
  function settings() {
    const s = S();
    const tn = { class: 'Класс', lab: 'Лаборатория', kitchen: 'Кухня', canteen: 'Столовая', electrical: 'Электрощитовая', corridor: 'Коридор' };
    const tmr = [['heartbeat', 'Контрольный сигнал, с'], ['offlineAfter', '«Нет связи» после, с'], ['ackTimeout', 'Ожидание подтверждения в Telegram, с'], ['onsiteTimeout', 'Прибытие на место, с'], ['rollcallRemind', 'Напоминание учителю, с'], ['rollcallFlag', '«Возможно есть люди», с'], ['cardTtlHours', 'Срок карточки пожарных, ч'], ['reopenWindow', 'Окно переоткрытия, с'], ['falseLimit', 'Ложных за 30 дн. до задачи']];
    let h = '<div class="vhead"><h2>' + L('Настройки') + '</h2><span class="muted">директор / администратор</span></div><div class="setgrid">';
    h += '<div class="panel"><div class="ph"><h3>Пороги по типу зоны (Ф3.3)</h3></div><table class="tbl"><thead><tr><th>Тип зоны</th><th>Дым</th><th>Фикс. t, °C</th><th>Рост, °C/мин</th></tr></thead><tbody>' +
      Object.keys(s.thresholds).map((k) => '<tr><td>' + tn[k] + '</td>' + ['smoke', 'fixed', 'ror'].map((f) => '<td><input class="num" type="number" data-chg="th" data-k="' + k + '" data-f="' + f + '" value="' + s.thresholds[k][f] + '"></td>').join('') + '</tr>').join('') + '</tbody></table></div>';
    h += '<div class="panel"><div class="ph"><h3>Таймеры</h3></div><table class="tbl"><tbody>' + tmr.map(([k, n]) => '<tr><td>' + n + '</td><td><input class="num" type="number" data-chg="tm" data-k="' + k + '" value="' + s.timers[k] + '"></td></tr>').join('') + '</tbody></table></div>';
    h += '<div class="panel"><div class="ph"><h3>Цепочки эскалации (Ф11.2)</h3><span class="muted">сейчас: ' + Engine.shiftName(Engine.shift()) + '</span></div>' +
      Object.keys(s.chains).map((sh) => '<div class="chainset"><b>' + Engine.shiftName(sh) + '</b>' + s.chains[sh].map((pid, i) => '<div class="chrow"><span>' + (i + 1) + '. ' + esc(Engine.pname(pid)) + ' <small class="muted">' + esc(s.people[pid].roleName) + '</small></span><span class="sp"></span>' +
        (i > 0 ? '<button class="btn xs" data-act="chUp" data-sh="' + sh + '" data-i="' + i + '">↑</button>' : '') + '</div>').join('') + '</div>').join('') + '</div>';
    h += '<div class="panel wide"><div class="ph"><h3>Пользователи и роли (Ф11.1)</h3></div><table class="tbl"><thead><tr><th>ФИО</th><th>Роль</th><th>Телефон</th><th>Язык</th><th>Telegram</th></tr></thead><tbody>' +
      s.peopleList.map((p) => '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.roleName) + '</td><td class="nw">' + esc(p.phone) + '</td><td><select data-chg="plang" data-k="' + p.id + '"><option value="ru"' + (p.lang === 'ru' ? ' selected' : '') + '>рус</option><option value="kk"' + (p.lang === 'kk' ? ' selected' : '') + '>қаз</option></select></td>' +
        '<td>' + (s.tgCodes[p.id] ? '<span class="mono">код ' + s.tgCodes[p.id].code + '</span> <span class="muted small">→ отправить боту /start ' + s.tgCodes[p.id].code + '</span>' : (p.tg ? '<span class="chip green">привязан</span> ' : '') + '<button class="btn xs" data-act="tgcode" data-v="' + p.id + '">Одноразовый код</button>') + '</td></tr>').join('') + '</tbody></table>' +
      '<div class="muted small">Каждый видит только свои объекты, кроме оператора и администратора. Двухфакторный вход для оператора и администратора — в пилотной версии.</div></div>';
    h += '<div class="panel"><div class="ph"><h3>План этажа (Ф1.3)</h3></div><div class="small">Загрузите план эвакуации (PNG/JPG) — он ляжет подложкой под разметку в 2D-режиме.</div><label class="btn"><input type="file" id="planFile" accept="image/*" hidden>🗺 Загрузить план</label>' + (App.planBg ? ' <button class="btn sm" data-act="planClear">Убрать</button>' : '') + '</div>';
    h += '<div class="panel"><div class="ph"><h3>Шлюз и интеграции</h3></div><div class="kv"><span>Шлюз</span><b>' + esc(s.gateway.model) + '</b></div><div class="kv"><span>Прошивка</span><b>' + s.gateway.fw + '</b></div><div class="kv"><span>Ключ (уникальный)</span><b class="mono">' + s.gateway.key + '</b></div>' +
      '<div class="kv"><span>Протокол</span><b>MQTT через TLS</b></div><div class="kv"><span>Каналы</span><b>Wi-Fi/Ethernet + GSM-резерв</b></div><div class="kv"><span>Буфер</span><b>до 10 000 событий</b></div><div class="kv"><span>Передано событий</span><b>' + s.gateway.delivered + '</b></div>' +
      '<div class="muted small">Шлюз только читает релейные выходы «Пожар»/«Неисправность» и RS-485 прибора АПС и ничего не передаёт в прибор.</div></div>';
    h += '<div class="panel"><div class="ph"><h3>Шаблоны сообщений (Ф5.4)</h3></div><div class="tpl"><b>рус</b><pre>🔴 Пожар-2\n{объект}\nЗона: {зона}\nДостоверность: {N} %\nОпасности: {опасности}\nТушить: {средство}</pre><b>қаз</b><pre>🔴 Өрт-2\n{объект}\nАймақ: {аймақ}\nСенімділік: {N} %\nҚауіптер: {қауіптер}\nСөндіру: {құрал}</pre></div><div class="muted small">Язык сообщения — по настройке пользователя.</div></div>';
    h += '</div>';
    P(h);
  }

  return { incidents, evac, to, journal, reports, settings, exportXls, exportPdf, actPdf };
})();
