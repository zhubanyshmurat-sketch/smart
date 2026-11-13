'use strict';

window.U = (function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const uid = (p) => (p || 'id') + Math.random().toString(36).slice(2, 9);

  function hms(ms) { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); }
  function hm(ms) { const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function dmy(ms) { const d = new Date(ms); return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + '.' + d.getFullYear(); }
  function dt(ms) { return dmy(ms) + ' ' + hms(ms); }
  function dur(sec) {
    sec = Math.max(0, Math.round(sec));
    if (sec < 60) return sec + ' с';
    const m = Math.floor(sec / 60), s = sec % 60;
    if (m < 60) return m + ' мин ' + pad(s) + ' с';
    const h = Math.floor(m / 60);
    return h + ' ч ' + pad(m % 60) + ' мин';
  }
  function mmss(sec) { sec = Math.max(0, Math.round(sec)); return pad(Math.floor(sec / 60)) + ':' + pad(sec % 60); }
  function median(a) { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

  // ---------- SHA-256 (синхронный, для цепочки хэшей журнала) ----------
  const K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
    0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
    0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  function sha256(str) {
    const bytes = new TextEncoder().encode(str);
    const l = bytes.length, nb = ((l + 9 + 63) >> 6) << 6;
    const m = new Uint8Array(nb); m.set(bytes); m[l] = 0x80;
    const bits = l * 8; const dv = new DataView(m.buffer);
    dv.setUint32(nb - 4, bits >>> 0); dv.setUint32(nb - 8, Math.floor(bits / 0x100000000));
    const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
    const W = new Uint32Array(64);
    const r = (x, n) => (x >>> n) | (x << (32 - n));
    for (let o = 0; o < nb; o += 64) {
      for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
      for (let i = 16; i < 64; i++) {
        const s0 = r(W[i - 15], 7) ^ r(W[i - 15], 18) ^ (W[i - 15] >>> 3);
        const s1 = r(W[i - 2], 17) ^ r(W[i - 2], 19) ^ (W[i - 2] >>> 10);
        W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
      }
      let [a, b, c, d, e, f, g, h] = H;
      for (let i = 0; i < 64; i++) {
        const S1 = r(e, 6) ^ r(e, 11) ^ r(e, 25), ch = (e & f) ^ (~e & g);
        const t1 = (h + S1 + ch + K[i] + W[i]) | 0;
        const S0 = r(a, 2) ^ r(a, 13) ^ r(a, 22), mj = (a & b) ^ (a & c) ^ (b & c);
        const t2 = (S0 + mj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
    }
    return Array.from(H, (x) => x.toString(16).padStart(8, '0')).join('');
  }

  // ---------- i18n: ключ — русская строка, перевод — казахский ----------
  const KK = {
    'Мониторинг': 'Мониторинг', 'Инциденты': 'Оқиғалар', 'Эвакуация': 'Эвакуация', 'ТО': 'ТҚ', 'Журнал': 'Журнал', 'Отчёты': 'Есептер', 'Настройки': 'Баптаулар',
    'Норма': 'Қалыпты', 'Внимание': 'Назар', 'Пожар-1': 'Өрт-1', 'Пожар-2': 'Өрт-2', 'Неисправность': 'Ақаулық', 'Нет связи': 'Байланыс жоқ', 'ТЕСТ': 'ТЕСТ', 'Ремонт': 'Жөндеу',
    'Обслуживание': 'Қызмет көрсету', 'Активные инциденты': 'Белсенді оқиғалар', 'Нет активных тревог': 'Белсенді дабыл жоқ',
    'Принять': 'Қабылдау', 'Принято': 'Қабылданды', 'Закрыть': 'Жабу', 'Закрыть инцидент': 'Оқиғаны жабу', 'Назначить': 'Тағайындау',
    'Ответственный': 'Жауапты', 'Достоверность': 'Сенімділік', 'Причины оценки': 'Бағалау себептері', 'Опасности зоны': 'Аймақ қауіптері', 'Средство тушения': 'Сөндіру құралы',
    'Датчики': 'Датчиктер', 'Таймеры': 'Таймерлер', 'Хронология': 'Хронология', 'Результат': 'Нәтиже', 'Вывод': 'Қорытынды',
    'Симулятор датчиков': 'Датчик симуляторы', 'Задымление': 'Түтін', 'Нагрев': 'Қызу', 'Ручной извещатель': 'Қолмен хабарлағыш', 'Тест': 'Тест',
    'Пар на кухне': 'Асханадағы бу', 'Отключить': 'Ажырату', 'Подключить': 'Қосу', 'Повтор ×5': 'Қайталау ×5', 'Сброс': 'Тастау',
    'Интернет шлюза': 'Шлюз интернеті', 'Шлюз': 'Шлюз', 'на связи': 'байланыста', 'буферизует': 'буферлейді',
    'Телефоны на объекте': 'Объектідегі телефондар', 'Демо-сценарий': 'Демо-сценарий', 'Следующий шаг': 'Келесі қадам',
    'Перекличка': 'Түгендеу', 'вышло': 'шықты', 'из': '/', 'Не отметились': 'Белгі қоймағандар', 'Возможно есть люди': 'Адамдар болуы мүмкін',
    'Карточка для пожарных': 'Өрт сөндірушілерге карточка', 'Задачи ТО': 'ТҚ тапсырмалары', 'Устройство': 'Құрылғы', 'Зона': 'Аймақ',
    'Время': 'Уақыт', 'Автор': 'Автор', 'Действие': 'Әрекет', 'Проверить целостность': 'Тұтастықты тексеру',
    'Экспорт Excel': 'Excel экспорты', 'Экспорт PDF': 'PDF экспорты', 'Скорость': 'Жылдамдық', 'Объект': 'Объект',
    'Нет связи с сервером': 'Сервермен байланыс жоқ', 'Автономный режим': 'Автономды режим', 'Сервер на связи': 'Сервер байланыста',
    'Ожидается сейчас': 'Қазір күтілуде', 'Учебная эвакуация': 'Оқу эвакуациясы', 'План этажа': 'Қабат жоспары',
    'Принял': 'Қабылдадым', 'На месте': 'Орнындамын', 'Фото': 'Фото', 'Подтверждаю пожар': 'Өртті растаймын', 'Ложная: пар': 'Жалған: бу', 'Ложная: пыль': 'Жалған: шаң',
    'Неисправность датчика': 'Датчик ақауы', 'Вывел': 'Шығардым', 'Не хватает': 'Жетіспейді', 'Отправить': 'Жіберу',
    'Сценарий завершён': 'Сценарий аяқталды', 'Ночь': 'Түн', 'Утро': 'Таң', 'Пауза': 'Үзіліс'
  };
  let lang = 'ru';
  function setLang(l) { lang = l; }
  function getLang() { return lang; }
  function L(ru, forceLang) { const l = forceLang || lang; return l === 'kk' && KK[ru] ? KK[ru] : ru; }

  function toast(text, kind) {
    const box = $('#toasts'); if (!box) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.innerHTML = text;
    box.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 4200);
  }

  function qrSvg(text, cell) {
    if (typeof qrcode === 'undefined') return '';
    const q = qrcode(0, 'M'); q.addData(text); q.make();
    return q.createSvgTag({ cellSize: cell || 4, margin: 2, scalable: true });
  }

  return { $, $$, esc, pad, clamp, rnd, uid, hms, hm, dmy, dt, dur, mmss, median, sha256, L, setLang, getLang, toast, qrSvg };
})();
