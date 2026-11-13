/* ӨртБақылау — демо-данные пилотного объекта (школа, Кызылорда).
   Все люди и организации вымышленные. Геометрия плана в метрах. */
'use strict';

window.SEED = (function () {
  const object = {
    id: 'obj1',
    name: 'Школа-гимназия № 7',
    nameKk: '№ 7 мектеп-гимназия',
    address: 'г. Кызылорда, ул. Абая, 41 (демо)',
    addressKk: 'Қызылорда қ., Абай к-сі, 41 (демо)',
    coords: '44.8488, 65.4823',
    type: 'Школа',
    floors: 1,
    capacity: 420,
    fire: {
      entry: 'Въезд с ул. Абая, ворота № 2 (восточные), разворот у главного входа',
      entryKk: 'Абай к-сінен кіру, № 2 қақпа (шығыс), бас кіреберісте бұрылу',
      gateCode: '4725#',
      hydrants: ['ПГ-14 — 35 м к востоку от ворот № 2', 'ПГ-17 — угол Абая / Жібек жолы, 120 м'],
      hydrantsKk: ['ПГ-14 — № 2 қақпадан шығысқа қарай 35 м', 'ПГ-17 — Абай / Жібек жолы бұрышы, 120 м'],
      breaker: 'Электрощитовая (1 этаж, у выхода A), ВРУ-1, рубильник слева',
      breakerKk: 'Электр қалқаны бөлмесі (1 қабат, A шығысы жанында), ВРУ-1, сол жақ',
      exits: 'Выход A — главный (восток), выход B — запасной (запад)',
      exitsKk: 'A шығысы — негізгі (шығыс), B шығысы — қосалқы (батыс)'
    }
  };

  const floor = { id: 'f1', num: 1, name: '1 этаж, основной корпус', nameKk: '1 қабат, негізгі ғимарат', w: 60, h: 24, plan: null };

  // type: class | lab | kitchen | canteen | electrical | corridor
  const zones = [
    { id: 'z201', name: '201 Химия', nameKk: '201 Химия', type: 'lab', rect: [0, 0, 12, 9], seg: 'c1',
      hazards: [{ ru: 'Реактивы: кислоты, щелочи, ЛВЖ', kk: 'Реактивтер: қышқыл, сілті, ЖТС' }, { ru: 'Газовые горелки', kk: 'Газ оттықтары' }],
      ext: { ru: 'Порошок, песок. Водой не тушить!', kk: 'Ұнтақ, құм. Сумен сөндіруге болмайды!' } },
    { id: 'z202', name: '202 Лаборантская', nameKk: '202 Зертханашы бөлмесі', type: 'lab', rect: [12, 0, 6, 9], seg: 'c2',
      hazards: [{ ru: 'Склад реактивов (≈40 кг)', kk: 'Реактив қоймасы (≈40 кг)' }],
      ext: { ru: 'Порошок. Водой не тушить!', kk: 'Ұнтақ. Сумен сөндіруге болмайды!' } },
    { id: 'z203', name: '203 Класс', nameKk: '203 Сынып', type: 'class', rect: [18, 0, 12, 9], seg: 'c2' },
    { id: 'z204', name: '204 Класс', nameKk: '204 Сынып', type: 'class', rect: [30, 0, 12, 9], seg: 'c3' },
    { id: 'z205', name: '205 Информатика', nameKk: '205 Информатика', type: 'class', rect: [42, 0, 18, 9], seg: 'c4',
      hazards: [{ ru: 'Электрооборудование под напряжением (16 ПК)', kk: 'Кернеудегі электр жабдығы (16 ДК)' }],
      ext: { ru: 'Углекислотный огнетушитель (CO₂)', kk: 'Көмірқышқыл өрт сөндіргіш (CO₂)' } },
    { id: 'c1', name: 'Коридор, запад', nameKk: 'Дәліз, батыс', type: 'corridor', rect: [0, 9, 15, 5] },
    { id: 'c2', name: 'Коридор, центр-запад', nameKk: 'Дәліз, орталық-батыс', type: 'corridor', rect: [15, 9, 15, 5] },
    { id: 'c3', name: 'Коридор, центр-восток', nameKk: 'Дәліз, орталық-шығыс', type: 'corridor', rect: [30, 9, 15, 5] },
    { id: 'c4', name: 'Коридор, восток', nameKk: 'Дәліз, шығыс', type: 'corridor', rect: [45, 9, 15, 5] },
    { id: 'z206', name: '206 Класс', nameKk: '206 Сынып', type: 'class', rect: [0, 14, 12, 10], seg: 'c1' },
    { id: 'z207', name: '207 Класс', nameKk: '207 Сынып', type: 'class', rect: [12, 14, 12, 10], seg: 'c2' },
    { id: 'zkit', name: 'Пищеблок (кухня)', nameKk: 'Ас блогы (асхана)', type: 'kitchen', rect: [24, 14, 10, 10], seg: 'c2',
      hazards: [{ ru: 'Газовые плиты', kk: 'Газ плиталары' }, { ru: 'Масло во фритюрнице', kk: 'Фритюрдегі май' }],
      ext: { ru: 'Порошок; перекрыть газ (кран у входа)', kk: 'Ұнтақ; газды жабу (кіреберістегі кран)' } },
    { id: 'zcan', name: 'Столовая', nameKk: 'Асхана залы', type: 'canteen', rect: [34, 14, 14, 10], seg: 'c3' },
    { id: 'zel', name: 'Электрощитовая', nameKk: 'Электр қалқаны', type: 'electrical', rect: [48, 14, 4, 10], seg: 'c4',
      hazards: [{ ru: 'ВРУ 0,4 кВ под напряжением', kk: '0,4 кВ кернеудегі ВРУ' }],
      ext: { ru: 'CO₂ / порошок. Сначала обесточить', kk: 'CO₂ / ұнтақ. Алдымен ажырату' } },
    { id: 'z208', name: '208 Класс', nameKk: '208 Сынып', type: 'class', rect: [52, 14, 8, 10], seg: 'c4' }
  ];

  const exits = [
    { id: 'exA', name: 'Выход A (главный, восток)', nameKk: 'A шығысы (негізгі, шығыс)', x: 60, y: 11.5, seg: 'c4' },
    { id: 'exB', name: 'Выход B (запасной, запад)', nameKk: 'B шығысы (қосалқы, батыс)', x: 0, y: 11.5, seg: 'c1' }
  ];
  const corridorOrder = ['c1', 'c2', 'c3', 'c4'];

  // kind: smoke | heat | combo | manual. src: aps (существующая АПС по RS-485) | wl (беспроводной, дооснащение)
  const D = (id, zone, kind, x, y, extra) => Object.assign({
    id, zone, kind, x, y, src: 'aps', model: kind === 'manual' ? 'ИПР-513 (ручной)' : kind === 'heat' ? 'ИП 101-1А (тепловой)' : kind === 'combo' ? 'ИП 212/101 (комбинированный)' : 'ИП 212-45 (дымовой)',
    serial: 'SN-' + id.toUpperCase().replace(/[^A-Z0-9]/g, '') + '-24', installed: '2021-08-20', lifeYears: 10, battery: null
  }, extra || {});

  const devices = [
    D('d201a', 'z201', 'smoke', 4, 4.5, { addr: 11 }),
    D('d201b', 'z201', 'heat', 9, 4.5, { addr: 12 }),
    D('d202a', 'z202', 'smoke', 15, 4.5, { addr: 13 }),
    D('d203a', 'z203', 'smoke', 24, 4.5, { addr: 14 }),
    D('d204a', 'z204', 'smoke', 36, 4.5, { addr: 15 }),
    D('d205a', 'z205', 'smoke', 47, 4.5, { addr: 16, installed: '2014-09-01' }),
    D('d205b', 'z205', 'combo', 55, 4.5, { src: 'wl', battery: 88, installed: '2025-02-10', model: 'FT-W2 (беспроводной, дым+t°)' }),
    D('dc1', 'c1', 'smoke', 7, 11.5, { addr: 21 }),
    D('dc2', 'c2', 'smoke', 22, 11.5, { addr: 22 }),
    D('dc3', 'c3', 'smoke', 37, 11.5, { addr: 23 }),
    D('dc4', 'c4', 'smoke', 52, 11.5, { addr: 24 }),
    D('mB', 'c1', 'manual', 1.2, 10.2, { addr: 31 }),
    D('mA', 'c4', 'manual', 58.8, 10.2, { addr: 32 }),
    D('d206a', 'z206', 'smoke', 6, 19, { addr: 17 }),
    D('d207a', 'z207', 'smoke', 18, 19, { addr: 18 }),
    D('dk1', 'zkit', 'heat', 27, 19, { addr: 19 }),
    D('dk2', 'zkit', 'smoke', 31, 19, { src: 'wl', battery: 64, installed: '2024-10-03', model: 'FT-W1 (беспроводной, дым)' }),
    D('dcan1', 'zcan', 'smoke', 38, 19, { addr: 25 }),
    D('dcan2', 'zcan', 'smoke', 44, 19, { addr: 26 }),
    D('del', 'zel', 'smoke', 50, 19, { addr: 27 }),
    D('d208a', 'z208', 'smoke', 56, 19, { src: 'wl', battery: 23, installed: '2024-10-03', model: 'FT-W1 (беспроводной, дым)' })
  ];

  // Пороги по типу зоны (Ф3.3). smoke — условные % затемнения, fixed — °C, ror — °C/мин.
  const thresholds = {
    class: { smoke: 15, fixed: 57, ror: 8 },
    lab: { smoke: 14, fixed: 57, ror: 8 },
    kitchen: { smoke: 24, fixed: 70, ror: 12 },
    canteen: { smoke: 18, fixed: 57, ror: 10 },
    electrical: { smoke: 12, fixed: 57, ror: 8 },
    corridor: { smoke: 15, fixed: 57, ror: 8 }
  };

  const timers = {
    heartbeat: 30, offlineAfter: 90, ackTimeout: 30, onsiteTimeout: 180,
    rollcallRemind: 180, rollcallFlag: 300, cardTtlHours: 6, reopenWindow: 600, falseWindowDays: 30, falseLimit: 3
  };

  const people = [
    { id: 'p_op', name: 'Алия Мұратова', role: 'operator', roleName: 'Дежурный оператор', phone: '+7 701 000 11 01', lang: 'ru', tg: true },
    { id: 'p_serik', name: 'Серік Ахметов', role: 'responsible', roleName: 'Завхоз', phone: '+7 702 000 22 02', lang: 'kk', tg: true },
    { id: 'p_baur', name: 'Бауыржан Омаров', role: 'responsible', roleName: 'Начальник охраны', phone: '+7 705 000 33 03', lang: 'ru', tg: true },
    { id: 'p_aigul', name: 'Айгүл Жақсыбекова', role: 'responsible', roleName: 'Замдиректора по АХЧ', phone: '+7 707 000 44 04', lang: 'kk', tg: true },
    { id: 'p_askar', name: 'Асқар Бекетов', role: 'responsible', roleName: 'Ночной сторож', phone: '+7 708 000 55 05', lang: 'kk', tg: true },
    { id: 'p_dir', name: 'Нұргүл Сәрсенова', role: 'director', roleName: 'Директор', phone: '+7 701 000 66 06', lang: 'kk', tg: true },
    { id: 'p_tech', name: 'Дмитрий Ли', role: 'tech', roleName: 'Техник (ТОО «ОртСервис», демо)', phone: '+7 777 000 77 07', lang: 'ru', tg: false },
    { id: 't_9a', name: 'Гүлнар Сейітова', role: 'teacher', roleName: 'Учитель, 9А', phone: '+7 700 000 81 01', lang: 'kk', tg: true },
    { id: 't_7b', name: 'Ольга Ким', role: 'teacher', roleName: 'Учитель, 7Б', phone: '+7 700 000 81 02', lang: 'ru', tg: true },
    { id: 't_5a', name: 'Әсел Нұрланқызы', role: 'teacher', roleName: 'Учитель, 5А', phone: '+7 700 000 81 03', lang: 'kk', tg: true },
    { id: 't_10b', name: 'Ержан Тоқтаров', role: 'teacher', roleName: 'Учитель, 10Б', phone: '+7 700 000 81 04', lang: 'kk', tg: true },
    { id: 't_8v', name: 'Марат Исаев', role: 'teacher', roleName: 'Учитель, 8В', phone: '+7 700 000 81 05', lang: 'ru', tg: true }
  ];

  const chains = {
    day: ['p_serik', 'p_baur', 'p_aigul', 'p_dir'],
    night: ['p_askar', 'p_baur', 'p_dir'],
    weekend: ['p_askar', 'p_serik', 'p_dir']
  };

  // Расписание (Ф6.1): только число учеников, без списков детей.
  const lessons = [
    { start: '08:00', end: '08:45' }, { start: '08:55', end: '09:40' }, { start: '09:50', end: '10:35' },
    { start: '10:40', end: '11:25' }, { start: '11:40', end: '12:25' }, { start: '12:35', end: '13:20' }
  ];
  const schedule = [];
  const occ = [
    ['z201', '9А', 't_9a', 24], ['z203', '7Б', 't_7b', 26], ['z204', '5А', 't_5a', 22],
    ['z205', '10Б', 't_10b', 14], ['z207', '8В', 't_8v', 20]
  ];
  for (let day = 1; day <= 6; day++) {
    lessons.forEach((l, li) => {
      occ.forEach(([zone, group, teacher, count], oi) => {
        // небольшая ротация, но на 4-м уроке (10:40) — ровно эти 5 классов = 106 человек
        if (li !== 3 && (li + oi) % 4 === 0) return;
        schedule.push({ day, start: l.start, end: l.end, zone, group, teacher, count });
      });
    });
  }

  const toIntervals = { smoke: 90, heat: 90, combo: 90, manual: 180 };

  return { object, floor, zones, exits, corridorOrder, devices, thresholds, timers, people, chains, schedule, toIntervals };
})();
