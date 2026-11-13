/* Карточка для пожарного подразделения (М7). Общий рендер для панели и страницы fire.html. */
'use strict';

window.FireCard = (function () {
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function plan(d) {
    const pp = new Set(d.possiblePeople.map((p) => p.name));
    const un = new Set(d.unmarked.map((p) => p.name));
    let s = '<svg viewBox="-2 -1 64 26" class="fc-plan">';
    d.plan.zones.forEach((z) => {
      const [x, y, w, h] = z.rect;
      const cls = z.fire ? 'fire' : pp.has(z.name) ? 'people' : un.has(z.name) ? 'unk' : z.type === 'corridor' ? 'corr' : '';
      s += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" class="' + cls + '"/>';
      if (z.type !== 'corridor') s += '<text x="' + (x + 0.5) + '" y="' + (y + 1.6) + '">' + esc(z.name.split(' ')[0]) + '</text>';
      if (z.fire) s += '<text x="' + (x + w / 2) + '" y="' + (y + h / 2 + 1.2) + '" class="big" text-anchor="middle">🔥</text>';
      if (pp.has(z.name)) s += '<text x="' + (x + w / 2) + '" y="' + (y + h / 2 + 1.2) + '" class="big" text-anchor="middle">👥</text>';
    });
    d.plan.exits.forEach((e) => { s += '<rect x="' + (e.x === 0 ? -1.4 : e.x) + '" y="' + (e.y - 1.6) + '" width="1.4" height="3.2" class="exit"/>'; });
    return s + '</svg>';
  }

  function html(d) {
    if (!d) return '<div class="fc"><div class="fc-exp">Карточка не найдена</div></div>';
    if (d.expired) return '<div class="fc"><div class="fc-exp">⛔ Срок действия ссылки истёк<br><small>Карточка доступна 6 часов с момента создания. Обратитесь к оператору пульта.</small></div></div>';
    const i = d.incident, o = d.object;
    let h = '<div class="fc">';
    h += '<div class="fc-top ' + (i.closed ? 'closed' : '') + '"><div class="fc-lvl">' + (i.test ? 'ТЕСТ · ' : '') + esc(i.level) + (i.closed ? ' · инцидент закрыт' : '') + '</div><div class="fc-obj">' + esc(o.name) + '</div><div class="fc-addr">' + esc(o.address) + '</div>' +
      '<div class="fc-small">Очаг: <b>' + esc(i.zones.join(', ')) + '</b> · с ' + esc(i.since) + ' · №' + i.num + '</div></div>';
    if (d.possiblePeople.length) h += '<div class="fc-sec fc-people"><h4>👥 Возможно есть люди</h4>' + d.possiblePeople.map((p) => '<div class="fc-row"><b>' + esc(p.name) + '</b><span>' + esc(p.group) + ' · ' + p.count + ' чел. · ' + esc(p.why) + '</span></div>').join('') + '</div>';
    if (d.rollcall) h += '<div class="fc-sec"><h4>Перекличка</h4><div class="fc-big">' + d.rollcall.out + ' <small>из ' + d.rollcall.expected + ' вышли</small></div>' +
      (d.unmarked.length ? '<div class="fc-small">Ещё не отметились: ' + d.unmarked.map((u) => esc(u.name + ' (' + u.group + ', ' + u.count + ')')).join(', ') + '</div>' : '') + '</div>';
    h += '<div class="fc-sec"><h4>План 1 этажа</h4>' + plan(d) + '<div class="fc-legend"><span class="lg fire"></span>очаг <span class="lg people"></span>возможно люди <span class="lg unk"></span>нет отметки <span class="lg exit"></span>выход</div></div>';
    h += '<div class="fc-sec"><h4>⚠ Опасности и тушение</h4>' + d.hazards.map((z) => '<div class="fc-haz' + (z.fire ? ' hot' : '') + '"><b>' + esc(z.zone) + (z.fire ? ' — ОЧАГ' : '') + '</b><div>' + esc(z.items.join('; ')) + '</div>' + (z.ext ? '<div class="fc-ext">🧯 ' + esc(z.ext) + '</div>' : '') + '</div>').join('') + '</div>';
    h += '<div class="fc-sec"><h4>Подъезд</h4><div class="fc-row"><span>Въезд</span><b>' + esc(o.entry) + '</b></div><div class="fc-row"><span>Код ворот</span><b class="fc-code">' + esc(o.gate) + '</b></div>' +
      o.hydrants.map((x) => '<div class="fc-row"><span>Гидрант</span><b>' + esc(x) + '</b></div>').join('') +
      '<div class="fc-row"><span>Рубильник</span><b>' + esc(o.breaker) + '</b></div><div class="fc-row"><span>Выходы</span><b>' + esc(o.exits) + '</b></div><div class="fc-row"><span>Координаты</span><b>' + esc(o.coords) + '</b></div></div>';
    if (d.responsible) h += '<div class="fc-sec"><h4>Ответственный на объекте</h4><div class="fc-row"><span>' + esc(d.responsible.role) + '</span><b>' + esc(d.responsible.name) + '</b></div><a class="fc-call" href="tel:' + esc(d.responsible.phone.replace(/\s/g, '')) + '">📞 ' + esc(d.responsible.phone) + '</a>' +
      '<div class="fc-row"><span>Пульт</span><b>' + esc(d.operator.name) + ', ' + esc(d.operator.phone) + '</b></div></div>';
    h += '<div class="fc-foot">Обновлено ' + esc(d.simTime) + ' · только просмотр · ссылка действует до ' + new Date(d.expiresAt).toLocaleString('ru-RU') + '<br>ӨртБақылау · демо-версия, данные вымышленные</div>';
    return h + '</div>';
  }

  // Самостоятельная страница fire.html
  function boot() {
    const root = document.getElementById('fcroot'); if (!root) return;
    const token = (location.hash || '').slice(1) || new URLSearchParams(location.search).get('t');
    let last = '';
    const show = (d, err) => {
      const h = err ? '<div class="fc"><div class="fc-exp">' + esc(err) + '</div></div>' : html(d);
      if (h !== last) { root.innerHTML = h; last = h; }
    };
    async function poll() {
      if (location.protocol.startsWith('http')) {
        try {
          const r = await fetch('/api/card/' + encodeURIComponent(token), { cache: 'no-store' });
          if (r.status === 410) { show({ expired: true }); return; }
          if (!r.ok) { show(null, 'Карточка не найдена или ещё не опубликована'); }
          else show(await r.json());
        } catch (e) { show(null, 'Нет связи с сервером, повтор…'); }
      } else {
        try { const raw = localStorage.getItem('ortb_card_' + token); show(raw ? JSON.parse(raw) : null, raw ? null : 'Откройте панель оператора в этом браузере'); } catch (e) { show(null, 'Хранилище браузера недоступно'); }
      }
    }
    if (!token) { show(null, 'Нет кода карточки в ссылке'); return; }
    poll(); setInterval(poll, 2000);
  }

  return { html, boot };
})();
