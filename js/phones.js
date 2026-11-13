/* Телефоны людей на объекте: Telegram-бот (ответственные, учителя, директор) и мобильная страница техника. */
'use strict';

window.Phones = (function () {
  const { $, esc, hms, hm, L } = U;
  const S = () => Engine.state();

  function personOptions() {
    const s = S();
    const g = [['Ответственные', (p) => p.role === 'responsible'], ['Учителя', (p) => p.role === 'teacher'], ['Директор', (p) => p.role === 'director'], ['Техник', (p) => p.role === 'tech']];
    return g.map(([n, f]) => '<optgroup label="' + n + '">' + s.peopleList.filter(f).map((p) => '<option value="' + p.id + '"' + (p.id === App.phonePid ? ' selected' : '') + '>' + esc(p.name) + (s.unread[p.id] ? ' (' + s.unread[p.id] + ')' : '') + '</option>').join('') + '</optgroup>').join('');
  }

  function unreadStrip() {
    const s = S();
    const ids = s.peopleList.filter((p) => s.unread[p.id] && p.id !== App.phonePid);
    return ids.map((p) => '<button class="uchip" data-act="phone" data-v="' + p.id + '">' + esc(p.name.split(' ')[0]) + ' <b>' + s.unread[p.id] + '</b></button>').join('');
  }

  function msgHtml(pid, m) {
    const p = S().people[pid];
    const ui = App.phoneUi;
    let btns = '';
    if (m.buttons.length) {
      if (ui.resultFor === m.id) {
        btns = '<div class="tgbtns col">' + [['fire', '🔥 ' + L('Подтверждаю пожар', p.lang)], ['steam', L('Ложная: пар', p.lang)], ['dust', L('Ложная: пыль', p.lang)], ['fault', L('Неисправность датчика', p.lang)]].map(([v, t]) =>
          '<button data-act="tg" data-pid="' + pid + '" data-m="' + m.id + '" data-a="result" data-v="' + v + '">' + esc(t) + '</button>').join('') +
          '<button data-act="tg" data-pid="' + pid + '" data-m="' + m.id + '" data-a="photo">📷 ' + L('Фото', p.lang) + '</button></div>';
      } else if (ui.missingFor === m.id) {
        btns = '<div class="tgbtns"><span class="stepper"><button data-act="stp" data-d="-1">−</button><b>' + (ui.missingVal || 1) + '</b><button data-act="stp" data-d="1">+</button></span>' +
          '<button data-act="tg" data-pid="' + pid + '" data-m="' + m.id + '" data-a="missing" data-v="' + (ui.missingVal || 1) + '">' + L('Отправить', p.lang) + '</button></div>';
      } else {
        btns = '<div class="tgbtns">' + m.buttons.map((b) => '<button data-act="tg" data-pid="' + pid + '" data-m="' + m.id + '" data-a="' + b.a + '">' + esc(b.label) + '</button>').join('') + '</div>';
      }
    }
    return '<div class="tgmsg ' + m.ch + '">' + (m.ch === 'sms' ? '<div class="smslbl">SMS · ӨртБақылау</div>' : '') +
      '<div class="tgtext">' + esc(m.text).replace(/\n/g, '<br>') + '</div><div class="tgtime">' + hm(m.at) + '</div>' + btns +
      (m.done ? '<div class="tgdone">' + esc(m.done) + '</div>' : '') + '</div>';
  }

  function telegram(pid) {
    const s = S(); const p = s.people[pid];
    const msgs = s.messages[pid];
    return '<div class="tghead"><div class="tgava">🔥</div><div><b>ӨртБақылау бот</b><small>' + (p.lang === 'kk' ? 'бот · қазақша' : 'бот · русский') + '</small></div></div>' +
      '<div class="tgbody" id="tgbody">' + (msgs.length ? msgs.map((m) => msgHtml(pid, m)).join('') : '<div class="tgempty">' + (p.lang === 'kk' ? 'Хабарлама жоқ. Дабыл кезінде осында келеді.' : 'Сообщений нет. При тревоге они придут сюда.') + '</div>') + '</div>';
  }

  // ---------------- мобильная страница техника
  function tech() {
    const s = S();
    const open = s.tasks.filter((t) => t.status === 'open').sort((a, b) => a.due - b.due);
    const t = App.techTask ? s.tasks.find((x) => x.id === App.techTask) : null;
    let h = '<div class="tkhead"><b>ӨртБақылау · Техник</b><small>' + esc(Engine.pname('p_tech')) + '</small></div><div class="tkbody">';
    if (!t) {
      h += '<div class="tksub">Мои задачи · ' + open.length + '</div>' + open.map((x) => {
        const over = s.sim > x.due;
        return '<div class="tkitem' + (over ? ' over' : '') + '" data-act="techOpen" data-v="' + x.id + '"><div><b>№' + x.num + ' · ' + x.dev.toUpperCase() + '</b><small>' + esc(Engine.zname(s.devices[x.dev].zone)) + '</small></div><div class="small">' + esc(x.reason) + '</div><div class="small ' + (over ? 'bad' : 'muted') + '">срок ' + U.dmy(x.due) + (over ? ' · просрочено' : '') + '</div></div>';
      }).join('') + (open.length ? '' : '<div class="tgempty">Задач нет</div>');
    } else {
      const d = s.devices[t.dev], r = t.rec;
      const ok = (v) => (v ? '<span class="ok">✓</span>' : '<span class="muted">○</span>');
      h += '<button class="tkback" data-act="techOpen" data-v="">← Задачи</button><div class="tksub">№' + t.num + ' · ' + esc(t.reason) + '</div>' +
        '<div class="small">' + t.dev.toUpperCase() + ' · ' + esc(d.model) + '<br>' + esc(Engine.zname(d.zone)) + ' · ' + (d.src === 'wl' ? 'беспроводной' : 'адрес ' + d.addr) + '</div>';
      if (t.status === 'done') h += '<div class="tkstep done">✓ Задача закрыта ' + hms(r.closedAt) + '</div><button class="tkbtn" data-act="act" data-v="' + t.id + '">Акт PDF</button>';
      else {
        h += '<div class="tkstep">' + ok(r.qrAt) + ' <b>1. Сканировать QR на устройстве</b>' + (r.qrAt ? '<small>' + hms(r.qrAt) + '</small>' :
          (App.scanFor === t.id ? '<div class="scanner"><div class="scanframe"></div><small>Наведите камеру на QR устройства:</small>' + scanChoices(t).map((id) => '<button class="tkbtn sm" data-act="scan" data-t="' + t.id + '" data-v="' + id + '">' + U.qrSvg('ORTB:DEV:' + id.toUpperCase(), 1) + id.toUpperCase() + '</button>').join('') + '</div>'
            : '<button class="tkbtn" data-act="scanOpen" data-v="' + t.id + '">📷 Открыть камеру</button>')) + '</div>';
        const dis = r.qrAt ? '' : ' disabled';
        h += '<div class="tkstep' + (r.qrAt ? '' : ' locked') + '"><b>2. Чек-лист</b>' +
          '<label><input type="checkbox" data-chg="tk" data-t="' + t.id + '" data-f="inspect"' + (r.inspect ? ' checked' : '') + dis + '> Осмотр корпуса и крепления</label>' +
          '<label><input type="checkbox" data-chg="tk" data-t="' + t.id + '" data-f="battery"' + (r.battery ? ' checked' : '') + dis + '> Батарея' + (d.battery != null ? ' (' + d.battery + ' %)' : ' (питание от шлейфа)') + '</label>' +
          (!r.fixed ? '<button class="tkbtn sm" data-act="techFix" data-v="' + t.id + '"' + dis + '>🔧 Ремонт выполнен (' + esc(fixLabel(t)) + ')</button>' : (t.kind === 'repair' && t.key !== 'false' && t.key !== 'afterfire' ? '<div class="small ok">✓ Ремонт выполнен</div>' : '')) +
          '<button class="tkbtn sm" data-act="techTest" data-v="' + t.id + '"' + dis + '>🧪 Тестовый аэрозоль / кнопка</button>' +
          '<div class="small">' + (r.testRecvAt ? '<span class="ok">✓ Тестовый сигнал получен сервером ' + hms(r.testRecvAt) + '</span>' : r.testReqAt ? '<span class="bad">⏳ Сигнал не дошёл до сервера' + (d.disconnected ? ' — нет связи с устройством' : '') + '</span>' : '<span class="muted">Сигнал должен дойти до сервера, иначе устройство не считается проверенным</span>') + '</div>' +
          '<button class="tkbtn sm" data-act="techPhoto" data-v="' + t.id + '"' + dis + '>📷 Фото</button>' + (r.photo ? '<img class="tkphoto" src="' + r.photo + '">' : '') + '</div>' +
          '<div class="err">' + esc(App.techErr || '') + '</div><button class="tkbtn primary" data-act="techClose" data-v="' + t.id + '">Закрыть задачу</button>';
      }
    }
    return h + '</div>';
  }
  function scanChoices(t) {
    const s = S(); const d = s.devices[t.dev];
    const same = s.devList.filter((x) => x.zone === d.zone || s.zones[d.zone].adj.includes(x.zone)).map((x) => x.id);
    const list = [t.dev].concat(same.filter((x) => x !== t.dev).slice(0, 2));
    return list.sort();
  }
  function fixLabel(t) {
    return { offline: 'восстановить питание/связь', battery: 'заменить батарею', life: 'заменить извещатель', dust: 'очистить камеру', tamper: 'закрыть корпус', loop: 'восстановить шлейф', false: 'очистить камеру', afterfire: 'проверка' }[t.key] || 'ремонт';
  }

  function render() {
    const el = $('#phones'); if (!el || el.hidden) return;
    const s = S(); const p = s.people[App.phonePid];
    UI.patch($('#phoneSel'), '<select id="phonePick">' + personOptions() + '</select>');
    UI.patch($('#phoneUnread'), unreadStrip());
    UI.patch($('#phoneWho'), esc(p.name) + ' · <span class="muted">' + esc(p.roleName) + '</span>');
    const scr = $('#phoneScreen');
    const body = $('#tgbody');
    const atBottom = !body || body.scrollTop + body.clientHeight >= body.scrollHeight - 30;
    UI.patch(scr, p.role === 'tech' ? tech() : telegram(App.phonePid));
    const nb = $('#tgbody');
    if (nb && atBottom) nb.scrollTop = nb.scrollHeight;
    if (s.unread[App.phonePid]) s.unread[App.phonePid] = 0;
  }

  return { render };
})();
