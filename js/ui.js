/* ӨртБақылау — веб-панель оператора: каркас, мониторинг, карточка инцидента, симулятор. */
'use strict';

window.App = {
  sel: null, view: 'monitor', mode: '3d', selInc: null, phonePid: 'p_serik', muted: false,
  phoneUi: {}, server: { mode: false, ok: true, lastOk: Date.now(), info: null }, simDev: 'd201a', planBg: null
};

window.UI = (function () {
  const { $, $$, esc, L, hms, hm, dur, mmss } = U;
  const S = () => Engine.state();

  function patch(el, html) {
    if (!el) return;
    if (el._h === html) return;
    const a = document.activeElement;
    if (a && el.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
    el.innerHTML = html; el._h = html;
  }

  const LV_CLASS = { f1: 'lv-f1', f2: 'lv-f2', warn: 'lv-warn', fault: 'lv-fault', ok: 'lv-ok', test: 'lv-test' };
  const STATUS = { new: 'Новый — ждёт принятия', accepted: 'Принят оператором', confirmed: 'Пожар подтверждён', closed: 'Закрыт' };
  const DSTAT = { ok: 'Норма', warn: 'Внимание', alarm: 'Тревога', fault: 'Неисправность', offline: 'Нет связи', test: 'Тест', maint: 'На обслуживании' };

  // ------------------------------------------------------------ header
  function renderHeader() {
    const s = S();
    const gw = s.gateway;
    $('#clock').textContent = hms(s.sim);
    $('#clockDate').textContent = U.dmy(s.sim) + ' · ' + L(Engine.shiftName(Engine.shift())) + (s.speed !== 1 ? ' · ×' + s.speed : '');
    $$('[data-act="speed"]').forEach((b) => b.classList.toggle('on', +b.dataset.v === s.speed));
    const gwTxt = gw.status === 'offline' ? '<span class="dot off"></span>' + L('Шлюз') + ': ' + L('Нет связи') : (!gw.internet ? '<span class="dot warn"></span>' + L('Шлюз') + ': ' + L('буферизует') + ' (' + gw.buffer.length + ')' : '<span class="dot on"></span>' + L('Шлюз') + ' gw1: ' + L('на связи'));
    patch($('#gwStatus'), gwTxt);
    let srv;
    if (!App.server.mode) srv = '<span class="dot idle"></span>' + L('Автономный режим');
    else if (App.server.ok) srv = '<span class="dot on"></span>' + L('Сервер на связи');
    else srv = '<span class="dot off"></span>' + L('Нет связи с сервером');
    patch($('#srvStatus'), srv);
    $('#srvBanner').hidden = !(App.server.mode && !App.server.ok);
    const open = Engine.openIncidents().filter((i) => i.kind === 'alarm');
    patch($('#tabBadgeInc'), open.length ? String(open.length) : '');
    const rc = Engine.activeRollcall();
    patch($('#tabBadgeEvac'), rc ? '●' : '');
    const overdue = s.tasks.filter((t) => t.status === 'open' && s.sim > t.due).length;
    const openT = s.tasks.filter((t) => t.status === 'open').length;
    patch($('#tabBadgeTo'), openT ? (overdue ? '⚠' : '') + openT : '');
    $$('#langSw button').forEach((b) => b.classList.toggle('on', b.dataset.v === U.getLang()));
  }

  function renderBanner() {
    const s = S();
    const pend = s.incidents.filter((i) => i.kind === 'alarm' && i.status !== 'closed' && !i.times.accepted);
    const el = $('#banner');
    if (!pend.length) { el.hidden = true; el._h = ''; return; }
    const inc = pend[0];
    el.hidden = false;
    el.className = 'banner ' + (inc.test ? 'lv-test' : LV_CLASS[inc.level]);
    patch(el, '<span class="bn-pulse"></span><b>' + (inc.test ? 'ТЕСТ · ' : '') + Engine.lvl(inc.level) + '</b> · ' + esc(inc.zones.map((z) => Engine.zname(z)).join(', ')) +
      ' · №' + inc.num + (inc.count > 1 ? ' · ×' + inc.count : '') + ' · ' + mmss((s.sim - inc.times.signal) / 1000) + ' ' + (U.getLang() === 'kk' ? 'бұрын' : 'назад') +
      (pend.length > 1 ? ' · +' + (pend.length - 1) : '') +
      '<span class="sp"></span><button class="btn white" data-act="accept" data-id="' + inc.id + '">' + L('Принять') + ' (Enter)</button>' +
      '<button class="btn ghost-w" data-act="mute">' + (App.muted ? '🔇' : '🔊') + '</button>');
  }

  // ------------------------------------------------------------ monitor: incidents list
  function incCard(inc) {
    const s = S();
    const lv = inc.test ? 'lv-test' : LV_CLASS[inc.level];
    const ack = inc.times.ack ? '✓ ' + esc(Engine.pname(inc.ackBy)) : (inc.assignee ? '⏳ ' + esc(Engine.pname(inc.assignee)) + ' · ' + mmss(Math.max(0, (inc.ackDeadline - s.sim) / 1000)) : '');
    return '<div class="icard ' + lv + (App.selInc === inc.id ? ' sel' : '') + (inc.times.accepted ? '' : ' blink') + '" data-act="selInc" data-id="' + inc.id + '">' +
      '<div class="ic-top"><span class="lvl">' + (inc.drill ? 'Учения' : Engine.lvl(inc.level)) + '</span>' + (inc.test && !inc.drill ? '<span class="tag">ТЕСТ</span>' : '') +
      (inc.count > 1 ? '<span class="tag">×' + inc.count + '</span>' : '') + (inc.reopened ? '<span class="tag">переоткрыт</span>' : '') +
      '<span class="sp"></span><span class="muted">№' + inc.num + ' · ' + hm(inc.times.signal) + '</span></div>' +
      '<div class="ic-zone">' + esc(inc.zones.map((z) => Engine.zname(z)).join(' + ')) + '</div>' +
      '<div class="ic-meta">' + (inc.drill ? '' : '<span class="conf"><i style="width:' + inc.confidence + '%"></i></span><b>' + inc.confidence + '%</b>') +
      '<span class="sp"></span><span class="muted">' + ack + '</span></div></div>';
  }

  function renderIncList() {
    const s = S();
    const open = s.incidents.filter((i) => i.status !== 'closed').sort((a, b) => (a.priority - b.priority) || (b.times.signal - a.times.signal));
    const recent = s.incidents.filter((i) => i.status === 'closed').slice(0, 3);
    let h = '<div class="ph"><h3>' + L('Активные инциденты') + '</h3><span class="muted">' + open.length + '</span></div>';
    if (!open.length) h += '<div class="empty small">✓ ' + L('Нет активных тревог') + '</div>';
    h += open.map(incCard).join('');
    if (recent.length) h += '<div class="ph sub"><span class="muted">Недавно закрытые</span></div>' + recent.map((i) =>
      '<div class="icard closed" data-act="selInc" data-id="' + i.id + '"><div class="ic-top"><span class="lvl">' + (i.drill ? 'Учения' : Engine.lvl(i.level)) + '</span><span class="tag">' + esc(Engine.RESULTS[i.result] || '') + '</span><span class="sp"></span><span class="muted">№' + i.num + '</span></div><div class="ic-zone">' + esc(i.zones.map((z) => Engine.zname(z)).join(' + ')) + '</div></div>').join('');
    patch($('#incList'), h);
  }

  // ------------------------------------------------------------ incident detail
  function chainHtml(inc) {
    const s = S();
    if (!inc.chain.length) return '';
    return '<div class="chain">' + inc.chain.map((pid, i) => {
      const p = s.people[pid];
      const n = inc.notified.filter((x) => x.pid === pid).length;
      const sms = (s.messages[pid] || []).some((m) => m.ch === 'sms' && m.meta.inc === inc.id);
      let cls = 'wait', st = '';
      if (inc.ackBy === pid) { cls = 'ack'; st = '✓ подтвердил'; }
      else if (inc.assignee === pid && !inc.times.ack) { cls = 'cur'; st = '⏳ ' + mmss(Math.max(0, (inc.ackDeadline - s.sim) / 1000)); }
      else if (n) { cls = 'miss'; st = 'нет ответа' + (sms ? ' · SMS' : ''); }
      return '<div class="ch ' + cls + '"><span class="ch-n">' + (i + 1) + '</span><div><b>' + esc(p.name) + '</b><small>' + esc(p.roleName) + (st ? ' · ' + st : '') + '</small></div></div>';
    }).join('<span class="ch-ar">→</span>') + '</div>';
  }

  function timeline(inc) {
    const t = inc.times, s = S();
    const row = (label, v, goal) => {
      const sec = v ? (v - t.signal) / 1000 : null;
      const bad = goal && sec != null && sec > goal;
      return '<div class="tl ' + (v ? 'done' : '') + (bad ? ' bad' : '') + '"><span>' + label + '</span><b>' + (v ? hms(v) : '—') + '</b><small>' + (sec != null ? '+' + dur(sec) : (goal && !t.closed ? 'цель ≤ ' + dur(goal) : '')) + '</small></div>';
    };
    return '<div class="tls">' + row('Сигнал (датчик)', t.signal) + row('На панели', t.received, 3) + row('Принят оператором', t.accepted, 30) +
      row('Подтверждение ответственного', t.ack, 60) + row('На месте', t.onsite, 180) + row('Закрыт', t.closed) + '</div>' +
      (!t.closed ? '<div class="muted small">Прошло с сигнала: <b>' + mmss((s.sim - t.signal) / 1000) + '</b></div>' : '');
  }

  function renderIncDetail(inc) {
    const s = S();
    const lv = inc.test ? 'lv-test' : LV_CLASS[inc.level];
    const closed = inc.status === 'closed';
    const lang = U.getLang();
    let h = '<div class="dhead ' + lv + '"><div><span class="lvl big">' + (inc.drill ? 'Учения' : Engine.lvl(inc.level)) + '</span>' +
      (inc.test && !inc.drill ? '<span class="tag">ТЕСТ</span>' : '') + (inc.count > 1 ? '<span class="tag">×' + inc.count + ' сигналов</span>' : '') +
      (inc.reopened ? '<span class="tag">переоткрыт</span>' : '') + (inc.repair ? '<span class="tag">зона в ремонте</span>' : '') + '</div>' +
      '<div class="dtitle">№' + inc.num + ' · ' + esc(inc.zones.map((z) => Engine.zname(z)).join(' + ')) + '</div>' +
      '<div class="muted small">' + esc(STATUS[inc.status]) + (closed ? ' · ' + esc(Engine.RESULTS[inc.result]) + (inc.cause ? ' (' + esc(inc.cause) + ')' : '') : '') + '</div></div>';

    // actions
    h += '<div class="actions">';
    if (!inc.times.accepted) h += '<button class="btn primary" data-act="accept" data-id="' + inc.id + '">✓ ' + L('Принять') + '</button>';
    if (!closed && inc.kind === 'alarm' && inc.status !== 'confirmed') h += '<button class="btn danger" data-act="confirm" data-id="' + inc.id + '">🔥 Подтвердить пожар</button>';
    if (inc.cardToken) h += '<button class="btn" data-act="card" data-id="' + inc.id + '">🚒 ' + L('Карточка для пожарных') + '</button>';
    else if (!closed && inc.kind === 'alarm') h += '<button class="btn" data-act="mkcard" data-id="' + inc.id + '">🚒 Создать карточку</button>';
    if (!closed && !s.rollcalls.some((r) => r.incidentId === inc.id) && inc.kind === 'alarm') h += '<button class="btn" data-act="evac" data-id="' + inc.id + '">🚸 Начать эвакуацию</button>';
    if (!closed) h += '<button class="btn" data-act="closeForm" data-id="' + inc.id + '">' + L('Закрыть') + '…</button>';
    h += '</div>';

    if (!inc.drill) {
      h += '<div class="sec"><div class="sh">' + L('Достоверность') + ' <b class="confnum">' + inc.confidence + '%</b></div>' +
        '<div class="confbar"><i style="width:' + inc.confidence + '%"></i></div>' +
        '<ul class="reasons">' + inc.reasons.map((r) => '<li><span class="' + (r.d >= 0 ? 'pos' : 'neg') + '">' + (r.d >= 0 ? '+' : '') + r.d + '</span>' + esc(r.t) + '</li>').join('') + '</ul>' +
        '<div class="note">Оценка помогает расставить приоритеты, но не скрывает и не отменяет тревогу — проверка человеком обязательна.</div></div>';
    }

    if (inc.chain.length) h += '<div class="sec"><div class="sh">' + L('Ответственный') + ' · цепочка эскалации (' + esc(Engine.shiftName(inc.shift)) + ')</div>' + chainHtml(inc) +
      (!closed ? '<div class="row"><select id="reassign">' + s.peopleList.filter((p) => ['responsible', 'director'].includes(p.role)).map((p) => '<option value="' + p.id + '"' + (p.id === inc.assignee ? ' selected' : '') + '>' + esc(p.name + ' — ' + p.roleName) + '</option>').join('') +
        '</select><button class="btn sm" data-act="reassign" data-id="' + inc.id + '">' + L('Назначить') + '</button></div>' : '') + '</div>';

    h += '<div class="sec"><div class="sh">' + L('Таймеры') + '</div>' + timeline(inc) + '</div>';

    // rollcall mini
    const rc = s.rollcalls.find((r) => r.incidentId === inc.id);
    if (rc) {
      const ex = rc.rooms.reduce((a, r) => a + r.expected, 0), out = rc.rooms.reduce((a, r) => a + (r.evac || 0), 0);
      const un = rc.rooms.filter((r) => !r.markedAt);
      h += '<div class="sec"><div class="sh">' + L('Перекличка') + (rc.active ? '' : ' (завершена)') + '</div><div class="bigstat"><b>' + out + '</b> ' + L('из') + ' ' + ex + ' <span class="muted">' + L('вышло') + '</span></div>' +
        '<div class="prog"><i style="width:' + (ex ? out / ex * 100 : 0) + '%"></i></div>' +
        (un.length ? '<div class="small">' + L('Не отметились') + ': ' + un.map((r) => '<span class="chip ' + (r.flagged ? 'red' : 'amber') + '">' + esc(r.group + ' · ' + Engine.zname(r.zone)) + '</span>').join(' ') + '</div>' : '<div class="small ok">✓ Все классы отметились</div>') +
        '<button class="btn sm link" data-act="view" data-v="evac">Открыть перекличку →</button></div>';
    }

    // proposals & photos
    if (inc.proposals.length || inc.photos.length) {
      const map = { fire: '🔥 Пожар подтверждён', steam: 'Ложная: пар', dust: 'Ложная: пыль', fault: 'Неисправность датчика' };
      h += '<div class="sec"><div class="sh">С места</div>' + inc.proposals.map((p) => '<div class="small">' + hms(p.at) + ' · ' + esc(Engine.pname(p.by)) + ': <b>' + map[p.r] + '</b></div>').join('') +
        '<div class="photos">' + inc.photos.map((p) => '<img src="' + p.src + '" alt="Фото с места">').join('') + '</div></div>';
    }

    // devices
    if (inc.devices.length) h += '<div class="sec"><div class="sh">' + L('Датчики') + '</div>' + inc.devices.map((id) => {
      const d = s.devices[id];
      return '<div class="drow" data-act="pick" data-type="device" data-id="' + id + '"><span class="dd ds-' + Engine.devStatus(d) + '"></span><b>' + id.toUpperCase() + '</b> <span class="muted">' + Engine.kindName(d.kind) + ' · ' + esc(Engine.zname(d.zone)) + '</span><span class="sp"></span>' +
        (d.kind === 'manual' ? 'нажат' : (d.kind !== 'heat' ? 'дым ' + d.smoke.toFixed(0) : '') + (d.kind !== 'smoke' ? ' · ' + d.temp.toFixed(1) + ' °C' + (d.ror > 2 ? ' (+' + d.ror.toFixed(0) + '/мин)' : '') : '')) + '</div>';
    }).join('') + '</div>';

    // hazards
    const hz = inc.zones.map((z) => s.zones[z]).filter((z) => z.hazards || z.ext);
    if (hz.length) h += '<div class="sec haz"><div class="sh">⚠ ' + L('Опасности зоны') + '</div>' + hz.map((z) =>
      '<div><b>' + esc(Engine.zname(z.id)) + ':</b> ' + esc((z.hazards || []).map((x) => x[lang] || x.ru).join('; ')) + (z.ext ? '<div class="ext">🧯 ' + esc(z.ext[lang] || z.ext.ru) + '</div>' : '') + '</div>').join('') + '</div>';

    if (closed) h += '<div class="sec"><div class="sh">' + L('Вывод') + '</div><div>' + esc(inc.conclusion) + '</div></div>';

    // chronology
    const jr = s.journal.filter((j) => j.ref === inc.id).slice(-14).reverse();
    h += '<div class="sec"><div class="sh">' + L('Хронология') + '</div><div class="chrono">' + jr.map((j) => '<div><span class="muted">' + hms(j.t) + '</span> <b>' + esc(j.author) + '</b> ' + esc(j.action) + '</div>').join('') + '</div></div>';
    return h;
  }

  function closeFormHtml(inc) {
    const d = App.closeDraft && App.closeDraft.id === inc.id ? App.closeDraft : { id: inc.id, result: '', cause: '', text: '' };
    App.closeDraft = d;
    const opt = (v, t, cur) => '<option value="' + v + '"' + (v === cur ? ' selected' : '') + '>' + esc(t) + '</option>';
    return '<div class="closeform"><div class="sh">' + L('Закрыть инцидент') + ' №' + inc.num + '</div>' +
      '<label>Результат (справочник)<select id="cf_result"><option value="">— выберите —</option>' + Object.keys(Engine.RESULTS).map((k) => opt(k, Engine.RESULTS[k], d.result)).join('') + '</select></label>' +
      '<label id="cf_cause_w"' + (d.result === 'false' ? '' : ' hidden') + '>Причина ложной тревоги<select id="cf_cause"><option value="">— выберите —</option>' + Engine.FALSE_CAUSES.map((c) => opt(c, c, d.cause)).join('') + '</select></label>' +
      '<label>Вывод<textarea id="cf_text" rows="3" placeholder="Что обнаружено на месте, что сделано">' + esc(d.text) + '</textarea></label>' +
      '<div class="err" id="cf_err"></div><div class="row"><button class="btn primary" data-act="doClose" data-id="' + inc.id + '">Закрыть с выводом</button><button class="btn" data-act="cancelClose">Отмена</button></div>' +
      '<div class="muted small">Закрыть без результата и вывода нельзя (Ф4.5).</div></div>';
  }

  // ------------------------------------------------------------ zone & device cards
  function zoneCard(zid) {
    const s = S(), z = s.zones[zid], lang = U.getLang();
    const th = s.thresholds[z.type];
    const base = Engine.baseline(zid);
    const occ = Engine.occupancy().find((o) => o.zone === zid);
    const devs = s.devList.filter((d) => d.zone === zid);
    const rep = s.zoneRepair[zid];
    const tname = { class: 'Класс', lab: 'Лаборатория', kitchen: 'Кухня', canteen: 'Столовая', electrical: 'Электрощитовая', corridor: 'Коридор' }[z.type];
    const st = Engine.zoneStatus(zid);
    let h = '<div class="dhead ' + (LV_CLASS[st] || '') + '"><div class="dtitle">' + esc(Engine.zname(zid)) + '</div><div class="muted small">' + tname + ' · ' + L(st === 'f1' ? 'Пожар-1' : st === 'f2' ? 'Пожар-2' : st === 'warn' ? 'Внимание' : st === 'fault' ? 'Неисправность' : st === 'repair' ? 'Ремонт' : st === 'test' ? 'ТЕСТ' : 'Норма') + '</div></div>';
    h += '<div class="sec"><div class="kv"><span>' + L('Ожидается сейчас') + '</span><b>' + (occ ? occ.count + ' чел. · ' + occ.group + ' (' + occ.start + '–' + occ.end + ')' : '—') + '</b></div>' +
      '<div class="kv"><span>Пороги зоны</span><b>дым ' + th.smoke + ' · ' + th.fixed + ' °C · +' + th.ror + ' °C/мин</b></div>' +
      '<div class="kv"><span>Адаптивная норма (14 дн., ' + new Date(s.sim).getHours() + ':00)</span><b>' + base.toFixed(1) + ' °C</b></div>' +
      '<div class="muted small">Норма считается по часам за 14 дней и учитывает сезон (летом в Кызылорде до +45 °C снаружи). Порог тревоги при этом не повышается.</div>';
    if (z.type !== 'corridor') {
      const r = Engine.routeFor(zid, []);
      h += '<div class="kv"><span>Основной выход</span><b>' + esc(s.exits.find((e) => e.id === r.exit)[lang === 'kk' ? 'nameKk' : 'name']) + '</b></div>';
    }
    h += '<div class="kv"><span>Соседние зоны</span><b>' + z.adj.map((a) => esc(Engine.zname(a))).join(', ') + '</b></div></div>';
    if (z.hazards || z.ext) h += '<div class="sec haz"><div class="sh">⚠ ' + L('Опасности зоны') + '</div>' + esc((z.hazards || []).map((x) => x[lang] || x.ru).join('; ')) + (z.ext ? '<div class="ext">🧯 ' + esc(z.ext[lang] || z.ext.ru) + '</div>' : '') + '</div>';
    h += '<div class="sec"><div class="sh">' + L('Датчики') + '</div>' + devs.map((d) => '<div class="drow" data-act="pick" data-type="device" data-id="' + d.id + '"><span class="dd ds-' + Engine.devStatus(d) + '"></span><b>' + d.id.toUpperCase() + '</b> <span class="muted">' + Engine.kindName(d.kind) + '</span><span class="sp"></span>' + DSTAT[Engine.devStatus(d)] + '</div>').join('') + '</div>';
    h += '<div class="sec"><div class="sh">Режим работ (Ф11.4)</div>' + (rep ? '<div class="small">🛠 До ' + U.dt(rep.until) + ' · ' + esc(rep.note) + '. Тревоги не скрываются, а помечаются.</div><button class="btn sm" data-act="repairOff" data-id="' + zid + '">Снять режим</button>'
      : '<div class="row"><input id="repNote" placeholder="Причина (покраска, ремонт…)" value="Ремонт, пыль"><select id="repDays"><option value="1">1 день</option><option value="3" selected>3 дня</option><option value="7">7 дней</option></select><button class="btn sm" data-act="repairOn" data-id="' + zid + '">Включить</button></div><div class="muted small">Срок окончания обязателен.</div>') + '</div>';
    return h;
  }

  function devCard(id) {
    const s = S(), d = s.devices[id];
    const st = Engine.devStatus(d);
    const hl = Engine.health(d);
    const fa = (s.falseHist[id] || []).filter((t) => s.sim - t <= 30 * 864e5).length;
    const tasks = s.tasks.filter((t) => t.dev === id && t.status === 'open');
    let h = '<div class="dhead"><div class="dtitle">' + id.toUpperCase() + ' · ' + esc(d.model) + '</div><div class="muted small"><span class="dd ds-' + st + '"></span> ' + DSTAT[st] + ' · ' + esc(Engine.zname(d.zone)) + '</div></div>';
    h += '<div class="sec two"><div>' +
      '<div class="kv"><span>Тип</span><b>' + Engine.kindName(d.kind) + '</b></div>' +
      '<div class="kv"><span>Серийный №</span><b>' + esc(d.serial) + '</b></div>' +
      '<div class="kv"><span>Подключение</span><b>' + (d.src === 'wl' ? 'беспроводной (дооснащение)' : 'АПС, RS-485 адр. ' + d.addr) + '</b></div>' +
      '<div class="kv"><span>Установлен</span><b>' + esc(d.installed) + ' · срок ' + d.lifeYears + ' лет</b></div>' +
      (d.battery != null ? '<div class="kv"><span>Батарея</span><b>' + d.battery + ' %</b></div>' : '') +
      '<div class="kv"><span>Последняя связь</span><b>' + dur((s.sim - d.lastSeen) / 1000) + ' назад</b></div>' +
      '<div class="kv"><span>Ложных за 30 дн.</span><b>' + fa + '</b></div>' +
      '<div class="kv"><span>Индекс состояния</span><b class="' + (hl.score < 60 ? 'bad' : '') + '">' + hl.score + ' / 100</b></div>' +
      '</div><div class="qrbox">' + U.qrSvg('ORTB:DEV:' + id.toUpperCase() + ':' + d.serial, 3) + '<small>QR на корпусе</small></div></div>';
    if (d.kind !== 'manual') h += '<div class="sec"><div class="sh">Показания</div><div class="kv"><span>Дым</span><b>' + d.smoke.toFixed(1) + '</b></div><div class="kv"><span>Температура</span><b>' + d.temp.toFixed(1) + ' °C (' + (d.ror >= 0 ? '+' : '') + d.ror.toFixed(1) + ' °C/мин)</b></div></div>';
    if (tasks.length) h += '<div class="sec"><div class="sh">Открытые задачи ТО</div>' + tasks.map((t) => '<div class="small">№' + t.num + ' · ' + esc(t.reason) + ' · срок ' + U.dmy(t.due) + '</div>').join('') + '</div>';
    h += '<div class="muted small">' + esc(hl.notes.join(' · ')) + '</div>';
    return h;
  }

  function renderDetail() {
    const s = S();
    const el = $('#detail');
    let inc = App.selInc ? s.incidents.find((i) => i.id === App.selInc) : null;
    if (!inc && !App.sel) inc = s.incidents.find((i) => i.status !== 'closed');
    let h;
    if (inc && (!App.sel || App.selInc)) {
      h = renderIncDetail(inc);
      const showForm = App.closeDraft && App.closeDraft.open && App.closeDraft.id === inc.id && inc.status !== 'closed';
      const cf = $('#closeFormBox');
      if (showForm) { if (cf.dataset.id !== inc.id) { cf.innerHTML = closeFormHtml(inc); cf.dataset.id = inc.id; } cf.hidden = false; }
      else { cf.hidden = true; cf.innerHTML = ''; cf.dataset.id = ''; }
    } else {
      $('#closeFormBox').hidden = true;
      if (App.sel && App.sel.type === 'zone') h = zoneCard(App.sel.id);
      else if (App.sel && App.sel.type === 'device') h = devCard(App.sel.id);
      else h = '<div class="empty"><div class="big">🛡</div>Все зоны в норме.<br><span class="muted small">Нажмите на зону или датчик на плане, чтобы открыть карточку.</span></div>';
    }
    patch(el, h);
  }

  // ------------------------------------------------------------ simulator
  function renderSim() {
    const s = S(), d = s.devices[App.simDev];
    const groups = {};
    s.devList.forEach((x) => { (groups[x.zone] = groups[x.zone] || []).push(x); });
    const sel = '<select id="simDev">' + Object.keys(groups).map((z) => '<optgroup label="' + esc(Engine.zname(z)) + '">' + groups[z].map((x) =>
      '<option value="' + x.id + '"' + (x.id === App.simDev ? ' selected' : '') + '>' + x.id.toUpperCase() + ' — ' + Engine.kindName(x.kind) + '</option>').join('') + '</optgroup>').join('') + '</select>';
    const st = Engine.devStatus(d);
    const th = s.thresholds[s.zones[d.zone].type];
    const read = d.kind === 'manual' ? '<span class="muted">ручной извещатель</span>' :
      (d.kind !== 'heat' ? '<span class="rd"><small>дым</small><b>' + d.smoke.toFixed(1) + '</b><small>/' + th.smoke + '</small></span>' : '') +
      (d.kind !== 'smoke' ? '<span class="rd"><small>t°</small><b>' + d.temp.toFixed(1) + '</b><small>/' + th.fixed + ' °C</small></span><span class="rd"><small>рост</small><b>' + d.ror.toFixed(1) + '</b><small>°C/мин</small></span>' : '');
    const b = (act, label, cls, dis) => '<button class="btn sm ' + (cls || '') + '" data-act="' + act + '"' + (dis ? ' disabled' : '') + '>' + label + '</button>';
    const off = d.disconnected;
    const h = '<div class="simrow"><b class="simtitle">🧪 ' + L('Симулятор датчиков') + '</b>' + sel +
      '<span class="dd ds-' + st + '"></span><span class="small">' + DSTAT[st] + '</span>' + read +
      (d.battery != null ? '<span class="rd"><small>АКБ</small><b>' + d.battery + '%</b></span>' : '') +
      '<span class="muted small">связь ' + dur((s.sim - d.lastSeen) / 1000) + ' назад</span></div>' +
      '<div class="simrow">' +
      (d.kind === 'manual' ? b('simManual', '🔴 Нажать кнопку', 'danger', off) :
        b('simSmoke', '💨 ' + L('Задымление'), '', off) + b('simHeat', '🌡 ' + L('Нагрев'), '', off) + b('simFireZone', '🔥 Очаг в зоне', 'danger', off)) +
      b('simTest', '🧪 ' + L('Тест'), '', off) + b('simRepeat', '🔁 ' + L('Повтор ×5'), '', off) +
      '<select id="simFault"><option value="">Неисправность…</option>' + Object.keys(Engine.FAULTS).map((k) => '<option value="' + k + '">' + Engine.FAULTS[k] + '</option>').join('') + '</select>' +
      b('simDisconnect', off ? '🔌 ' + L('Подключить') : '⛔ ' + L('Отключить'), off ? 'warn' : '') + b('simReset', '↺ ' + L('Сброс')) +
      '<span class="sep"></span>' + b('simSteam', '♨ ' + L('Пар на кухне')) +
      '<label class="tog"><input type="checkbox" id="simNet"' + (s.gateway.internet ? ' checked' : '') + '> ' + L('Интернет шлюза') + (s.gateway.buffer.length ? ' <b>(буфер ' + s.gateway.buffer.length + ')</b>' : '') + '</label>' +
      '</div>';
    patch($('#sim'), h);
  }

  // ------------------------------------------------------------ fire card modal
  function cardUrl(token) {
    if (App.server.mode && App.server.info && App.server.info.ips && App.server.info.ips.length) return 'http://' + App.server.info.ips[0] + ':' + App.server.info.port + '/fire.html#' + token;
    if (App.server.mode) return location.origin + '/fire.html#' + token;
    return location.href.replace(/[^/]*([?#].*)?$/, '') + 'fire.html#' + token;
  }
  function openCard(incId) {
    const s = S();
    const inc = s.incidents.find((i) => i.id === incId); if (!inc) return;
    const c = Engine.createCard(incId); App.cardOpen = c.token;
    const url = cardUrl(c.token);
    $('#modalBody').innerHTML = '<div class="cardmodal"><div class="cm-left"><h3>🚒 ' + L('Карточка для пожарных') + '</h3>' +
      '<div class="qrbig">' + U.qrSvg(url, 5) + '</div><div class="small mono">' + esc(url) + '</div>' +
      '<div class="small">Открывается на телефоне без входа, обновляется в реальном времени. Срок действия ' + s.timers.cardTtlHours + ' ч.</div>' +
      (!App.server.mode ? '<div class="note">Автономный режим: ссылка работает в этом браузере. Для телефона запустите <b>node server.js</b> и откройте панель по http — QR будет вести на адрес в локальной сети.</div>' : '') +
      '<div class="row"><a class="btn" href="' + esc(url) + '" target="_blank" rel="noopener">Открыть в новой вкладке</a><button class="btn" data-act="expireCard" data-v="' + c.token + '">⏩ Демо: прошло 6 ч</button></div>' +
      '<div class="muted small">Передача карточки в профильную службу — только по согласованию с ней (Ф7.4). В демо карточка только показывается, вызовы 101/112 не отправляются.</div></div>' +
      '<div class="cm-right"><div class="phone small"><div class="phone-notch"></div><div class="phone-screen" id="cardPreview"></div></div></div></div>';
    $('#modal').hidden = false;
    renderCardPreview();
  }
  function renderCardPreview() {
    if ($('#modal').hidden || !App.cardOpen) return;
    const el = $('#cardPreview'); if (!el) return;
    const data = Engine.buildCard(App.cardOpen);
    patch(el, FireCard.html(data));
  }

  // ------------------------------------------------------------ select
  function pick(sel) {
    App.sel = sel; App.selInc = null;
    if (sel.type === 'device') App.simDev = sel.id;
    if (sel.type === 'zone') {
      const z = S().zones[sel.id]; const [x, y, w, h] = z.rect;
      if (App.mode === '3d') Plan3D.flyTo(x + w / 2, y + h / 2, 34);
    }
    renderAll();
  }
  function selectInc(id) {
    App.selInc = id; App.sel = null;
    const inc = S().incidents.find((i) => i.id === id);
    if (inc && inc.zones.length) {
      const z = S().zones[inc.zones[0]]; const [x, y, w, h] = z.rect;
      if (App.mode === '3d') Plan3D.flyTo(x + w / 2, y + h / 2, 28);
    }
    renderAll();
  }

  function renderPlan() {
    if (App.mode === '2d') Plan2D.update(App.sel);
  }

  function renderAll() {
    renderHeader(); renderBanner();
    if (App.view === 'monitor') { renderIncList(); renderDetail(); renderSim(); renderPlan(); }
    else if (Views[App.view]) Views[App.view]();
    Phones.render();
    renderCardPreview();
  }

  return { renderAll, renderHeader, renderBanner, renderDetail, renderSim, pick, selectInc, openCard, cardUrl, patch, closeFormHtml, DSTAT, renderPlan };
})();
