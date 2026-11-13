/* Демо-сценарий для жюри (≈4 мин, раздел 10 ТЗ). Ведущий нажимает «Далее», каждый шаг сам выполняет действия. */
'use strict';

window.Scenario = (function () {
  const { $, esc } = U;
  let idx = -1, timers = [], active = false;
  const S = () => Engine.state();

  function after(sec, fn) { timers.push({ at: S().sim + sec * 1000, fn }); }
  function tick() {
    if (!active || !timers.length) return;
    const now = S().sim;
    const due = timers.filter((t) => t.at <= now);
    timers = timers.filter((t) => t.at > now);
    due.forEach((t) => { try { t.fn(); } catch (e) { console.error(e); } });
  }
  const chemInc = () => S().incidents.find((i) => i.zones.includes('z201') && !i.test);
  const lastMsg = (pid, kind) => S().messages[pid].slice().reverse().find((m) => m.meta.kind === kind);
  function phone(pid) { App.phonePid = pid; App.phoneUi = {}; }
  function view(v) { App.go(v); }

  const steps = [
    {
      t: 'Кабинет химии: срабатывает один датчик',
      d: 'Дым в 201-м кабинете. Пожар-1, достоверность растёт вместе с температурой, камера летит к очагу. Сигнал сразу ушёл в Telegram завхозу.',
      run() {
        App.restart();
        view('monitor'); App.setMode('3d'); phone('p_serik');
        Engine.sim.smoke('d201a', { smokeT: 60, sr: 1.4 });
        const b = Engine.baseline('z201');
        Engine.sim.heat('d201b', { tempT: b + 14, tr: 0.08 }); // ~5 °C/мин: ниже порога скорости, достоверность растёт
      }
    },
    {
      t: 'Оператор принимает тревогу, ответственный молчит',
      d: 'Оператор принимает тревогу одной кнопкой — время реакции записано. Серік не отвечает: через 30 с ему уходит SMS, а тревога — следующему по цепочке.',
      run() {
        const inc = chemInc(); if (!inc) return;
        Engine.op.accept(inc.id); UI.selectInc(inc.id); phone('p_serik');
        // если ведущий задержался и эскалация уже прошла — отвечает тот, у кого тревога сейчас
        const wait = inc.escalations ? 0 : Math.max(1, (inc.ackDeadline - S().sim) / 1000);
        const who = () => inc.assignee;
        after(wait + 1.5, () => phone(who()));
        after(wait + 7, () => { const p = who(), m = lastMsg(p, 'alarm'); if (m && !inc.times.ack) Engine.person(p, m.id, 'ack'); });
        after(wait + 15, () => { const p = inc.ackBy || who(), m = lastMsg(p, 'alarm'); if (m) Engine.person(p, m.id, 'onsite'); });
      }
    },
    {
      t: 'Второй датчик: Пожар-2, эвакуация и перекличка',
      d: 'Сработала лаборантская 202 — уровень Пожар-2. Учителя получили маршруты; классам 203 и 207 система дала запасной выход A, потому что основной идёт мимо очага. Учителя отмечаются одним нажатием.',
      run() {
        const inc = chemInc();
        if (inc && !inc.times.ack && inc.assignee) { const m = lastMsg(inc.assignee, 'alarm'); if (m) Engine.person(inc.assignee, m.id, 'ack'); }
        Engine.sim.smoke('d202a', { smokeT: 55, sr: 2.2 });
        Plan3D.overview();
        after(7, () => phone('t_7b'));
        [['t_9a', 10], ['t_7b', 13], ['t_5a', 16]].forEach(([pid, s]) => after(s, () => { const m = lastMsg(pid, 'route'); if (m) Engine.person(pid, m.id, 'all'); }));
      }
    },
    {
      t: 'Карточка для пожарного подразделения',
      d: 'Прошло 5 минут: классы 10Б и 8В не отметились — система внесла их в список «возможно есть люди». Карточка открывается на телефоне без входа: очаг, «реактивы — водой не тушить», код ворот, гидрант.',
      run() {
        Engine.skip(300);
        const inc = chemInc(); if (inc) UI.openCard(inc.id);
      }
    },
    {
      t: 'Закрытие с выводом',
      d: 'Инцидент закрывается только с результатом из справочника и текстом вывода. Технику автоматически созданы задачи «проверить датчики после пожара».',
      run() {
        App.closeModal();
        const inc = chemInc(); if (!inc) return;
        UI.selectInc(inc.id);
        App.closeDraft = { id: inc.id, open: true, result: 'real_fire', cause: '', text: 'Возгорание реактивов в кабинете 201, ликвидировано порошковым огнетушителем до прибытия расчёта. Пострадавших нет, 2 класса вышли с опозданием (не отметились).' };
        UI.renderAll();
        after(4, () => { Engine.op.close(inc.id, 'real_fire', '', App.closeDraft.text); App.closeDraft = null; const rc = S().rollcalls.find((r) => r.incidentId === inc.id && r.active); if (rc) Engine.op.endRollcall(rc.id); UI.renderAll(); });
      }
    },
    {
      t: 'Пар на кухне и отключённый датчик',
      d: 'Пар на кухне даёт низкую достоверность — тревога не скрыта, но причины видны. Закрываем как ложную: это 3-я за 30 дней, технику уходит задача. Датчик в 204 отключили — через 90 с он серый, создана задача.',
      run() {
        App.closeModal(); view('monitor'); App.setMode('2d');
        Engine.sim.steam();
        Engine.sim.disconnect('d204a', true);
        after(9, () => { const inc = S().incidents.find((i) => i.zones.includes('zkit') && i.status !== 'closed'); if (inc) { Engine.op.accept(inc.id); UI.selectInc(inc.id); } });
        after(18, () => { const inc = S().incidents.find((i) => i.zones.includes('zkit') && i.status !== 'closed'); if (inc) Engine.op.close(inc.id, 'false', 'Пар (кухня, душ)', 'Пар от пищеварочного котла, задымления нет. Рекомендована вытяжка над котлом.'); });
        after(24, () => { Engine.skip(95); phone('p_tech'); });
        after(27, () => view('to'));
      }
    }
  ];

  function render() {
    const el = $('#scn');
    if (!active) { el.hidden = true; return; }
    el.hidden = false;
    const st = steps[idx];
    el.innerHTML = '<div class="scn-top"><span class="scn-n">' + (idx + 1) + ' / ' + steps.length + '</span><b>' + esc(st.t) + '</b><span class="sp"></span><button class="btn xs ghost" data-act="scnClose">✕</button></div>' +
      '<div class="scn-d">' + esc(st.d) + '</div><div class="scn-bar">' + steps.map((_, i) => '<i class="' + (i <= idx ? 'on' : '') + '"></i>').join('') + '</div>' +
      '<div class="row"><button class="btn sm" data-act="scnPrev"' + (idx === 0 ? ' disabled' : '') + '>◀</button>' +
      (idx < steps.length - 1 ? '<button class="btn sm primary" data-act="scnNext">' + U.L('Следующий шаг') + ' ▶</button>' : '<span class="muted small">' + U.L('Сценарий завершён') + '</span>') + '</div>';
  }

  function go(i) {
    if (i < 0 || i >= steps.length) return;
    // ход назад = перезапуск с начала до нужного шага, чтобы состояние было честным
    if (i < idx) { timers = []; idx = -1; for (let k = 0; k <= i; k++) { idx = k; steps[k].run(); flush(); } }
    else { idx = i; steps[i].run(); }
    render(); UI.renderAll();
  }
  function flush() { // выполнить отложенные действия шага сразу (для перемотки назад)
    let guard = 0;
    while (timers.length && guard++ < 20) {
      const next = Math.min(...timers.map((t) => t.at));
      Engine.skip(Math.max(0.5, (next - S().sim) / 1000));
      tick();
    }
  }

  return {
    start() { active = true; timers = []; idx = -1; go(0); },
    next() { go(idx + 1); },
    prev() { go(idx - 1); },
    stop() { active = false; timers = []; render(); },
    tick, render, isActive: () => active
  };
})();
