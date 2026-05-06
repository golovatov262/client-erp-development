(function () {
  'use strict';

  var API_URL = 'https://functions.poehali.dev/0924bff4-d641-4d72-bf91-6be621dfc8d9';
  var CONTAINER_ID = (window.LOAN_WIDGET_CONTAINER || 'loan-widget');
  var SOURCE = (window.LOAN_WIDGET_SOURCE || (location && location.hostname) || 'website');

  var STYLE = ''
    + '.lw-wrap{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:760px;margin:0 auto;color:#111;}'
    + '.lw-wrap *{box-sizing:border-box}'
    + '.lw-card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,.04)}'
    + '.lw-h{font-size:22px;font-weight:700;margin:0 0 6px}'
    + '.lw-sub{color:#6b7280;font-size:14px;margin:0 0 18px}'
    + '.lw-section{border-top:1px solid #f0f0f0;padding-top:16px;margin-top:16px}'
    + '.lw-section:first-of-type{border-top:0;padding-top:0;margin-top:0}'
    + '.lw-section.lw-hidden{display:none}'
    + '.lw-st{font-weight:600;font-size:15px;margin:0 0 10px;color:#111}'
    + '.lw-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}'
    + '.lw-row-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}'
    + '@media(max-width:640px){.lw-row,.lw-row-3{grid-template-columns:1fr}}'
    + '.lw-field{margin-bottom:12px}'
    + '.lw-label{display:block;font-size:13px;color:#374151;margin-bottom:4px;font-weight:500}'
    + '.lw-req{color:#dc2626}'
    + '.lw-input,.lw-select,.lw-textarea{width:100%;padding:10px 12px;border:1px solid #d1d5db;border-radius:8px;font-size:14px;font-family:inherit;background:#fff;outline:none;transition:border .15s}'
    + '.lw-input:focus,.lw-select:focus,.lw-textarea:focus{border-color:#2563eb;box-shadow:0 0 0 3px rgba(37,99,235,.1)}'
    + '.lw-textarea{min-height:70px;resize:vertical}'
    + '.lw-checkbox{display:flex;align-items:flex-start;gap:8px;font-size:14px;color:#374151;cursor:pointer;line-height:1.4}'
    + '.lw-checkbox input{margin-top:3px;width:16px;height:16px;flex-shrink:0;cursor:pointer}'
    + '.lw-btn{background:#2563eb;color:#fff;border:0;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;width:100%;transition:background .15s}'
    + '.lw-btn:hover{background:#1d4ed8}'
    + '.lw-btn:disabled{background:#9ca3af;cursor:not-allowed}'
    + '.lw-captcha{display:flex;align-items:center;gap:10px;background:#f9fafb;padding:10px 12px;border-radius:8px;border:1px solid #e5e7eb}'
    + '.lw-captcha-q{font-weight:600;font-size:16px;color:#111;min-width:80px}'
    + '.lw-captcha .lw-input{max-width:100px}'
    + '.lw-captcha-reload{background:none;border:0;color:#2563eb;cursor:pointer;font-size:13px;padding:4px 8px;text-decoration:underline}'
    + '.lw-msg{padding:12px 14px;border-radius:8px;margin:14px 0;font-size:14px;line-height:1.5}'
    + '.lw-msg.err{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}'
    + '.lw-msg.ok{background:#f0fdf4;color:#166534;border:1px solid #bbf7d0}'
    + '.lw-toggle{display:flex;gap:8px;margin-bottom:14px}'
    + '.lw-toggle button{flex:1;padding:8px 14px;border:1px solid #d1d5db;background:#fff;border-radius:8px;cursor:pointer;font-size:14px;color:#374151;transition:all .15s}'
    + '.lw-toggle button.active{background:#2563eb;color:#fff;border-color:#2563eb}'
    + '.lw-foot{font-size:12px;color:#6b7280;margin-top:14px;line-height:1.5}'
    + '.lw-foot a{color:#2563eb}'
    + '.lw-dd-wrap{position:relative}'
    + '.lw-dd{position:absolute;left:0;right:0;top:calc(100% + 2px);background:#fff;border:1px solid #d1d5db;border-radius:8px;box-shadow:0 6px 16px rgba(0,0,0,.08);max-height:280px;overflow-y:auto;z-index:9999}'
    + '.lw-dd-item{padding:8px 12px;cursor:pointer;font-size:13px;line-height:1.4;border-bottom:1px solid #f3f4f6}'
    + '.lw-dd-item:last-child{border-bottom:0}'
    + '.lw-dd-item:hover,.lw-dd-item.active{background:#eff6ff}'
    + '.lw-dd-meta{font-size:11px;color:#6b7280;margin-top:2px}'
    + '.lw-dd-empty{padding:8px 12px;font-size:12px;color:#9ca3af}'
    ;

  function $(id) { return document.getElementById(id); }

  function injectStyle() {
    if (document.getElementById('lw-style')) return;
    var s = document.createElement('style');
    s.id = 'lw-style';
    s.appendChild(document.createTextNode(STYLE));
    document.head.appendChild(s);
  }

  function field(label, name, type, opts) {
    opts = opts || {};
    var req = opts.required ? ' <span class="lw-req">*</span>' : '';
    var dd = opts.dadata ? ' data-dadata="' + opts.dadata + '"' : '';
    var input;
    if (type === 'textarea') {
      input = '<textarea class="lw-textarea" name="' + name + '"' + (opts.placeholder ? ' placeholder="' + opts.placeholder + '"' : '') + (opts.required ? ' required' : '') + dd + '></textarea>';
    } else if (type === 'select') {
      var opt = '<option value="">— выберите —</option>';
      (opts.options || []).forEach(function (o) { opt += '<option value="' + o + '">' + o + '</option>'; });
      input = '<select class="lw-select" name="' + name + '">' + opt + '</select>';
    } else {
      input = '<input class="lw-input" type="' + type + '" name="' + name + '"' + (opts.placeholder ? ' placeholder="' + opts.placeholder + '"' : '') + (opts.required ? ' required' : '') + dd + ' autocomplete="off" />';
    }
    var wrap = opts.dadata ? '<div class="lw-dd-wrap">' + input + '</div>' : input;
    return '<div class="lw-field"><label class="lw-label">' + label + req + '</label>' + wrap + '</div>';
  }

  function section(extraCls, content) {
    return '<div class="lw-section ' + (extraCls || '') + '">' + content + '</div>';
  }

  function buildHtml() {
    return ''
      + '<div class="lw-card">'
      + '<h2 class="lw-h">Заявка на займ</h2>'
      + '<p class="lw-sub">Заполните форму, и наш специалист свяжется с вами для уточнения деталей.</p>'
      + '<div id="lw-msg"></div>'
      + '<form id="lw-form" autocomplete="on">'

      // Тип заёмщика
      + section('', ''
        + '<div class="lw-st">Тип заёмщика</div>'
        + '<div class="lw-toggle">'
        + '<button type="button" data-bt="fl" class="active">Физ. лицо</button>'
        + '<button type="button" data-bt="ul">Юр. лицо / ИП</button>'
        + '</div>'
        + '<input type="hidden" name="borrower_type" value="fl" />'
      )

      // Условия займа (общие)
      + section('', ''
        + '<div class="lw-st">Условия займа</div>'
        + '<div class="lw-row">'
        + field('Сумма, ₽', 'amount', 'number')
        + field('Срок, мес.', 'term_months', 'number')
        + '</div>'
        + field('Вид предполагаемого залога', 'collateral_types', 'text', { placeholder: 'Без залога, авто, недвижимость и т.д.' })
      )

      // ─── Блок ФЛ ─────────────────────────────────────────────
      + section('lw-fl', ''
        + '<div class="lw-st">Контактные данные</div>'
        + field('ФИО', 'full_name', 'text', { required: true, placeholder: 'Иванов Иван Иванович' })
        + '<div class="lw-row">'
        + field('Телефон', 'mobile_phone', 'tel', { required: true, placeholder: '+7 (___) ___-__-__' })
        + field('Email', 'email', 'email', { required: true, placeholder: 'name@example.com' })
        + '</div>'
      )

      + section('lw-fl', ''
        + '<div class="lw-st">Паспортные данные</div>'
        + '<div class="lw-row">'
        + field('Дата рождения', 'birth_date', 'date')
        + field('Место рождения', 'birth_place', 'text')
        + '</div>'
        + '<div class="lw-row-3">'
        + field('Серия и номер', 'passport_series_number', 'text', { placeholder: '0000 000000' })
        + field('Дата выдачи', 'passport_issue_date', 'date')
        + field('Код подразделения', 'passport_division_code', 'text', { placeholder: '000-000' })
        + '</div>'
        + field('Кем выдан', 'passport_issued_by', 'text', { dadata: 'fms_unit', placeholder: 'Начните вводить название подразделения...' })
        + field('Адрес регистрации', 'registration_address', 'text', { dadata: 'address', placeholder: 'Начните вводить адрес...' })
        + field('ИНН', 'inn', 'text')
      )

      + section('lw-fl', ''
        + '<div class="lw-st">Доход и работа</div>'
        + '<div class="lw-row">'
        + field('Официальный доход, ₽', 'official_income', 'number')
        + field('Подтверждение дохода', 'income_confirmation', 'text', { placeholder: '2-НДФЛ, справка по форме банка...' })
        + '</div>'
        + '<div class="lw-row">'
        + field('ИНН работодателя', 'employer_inn', 'text', { dadata: 'party', placeholder: 'Введите ИНН или название работодателя...' })
        + field('Работодатель', 'employer_name', 'text')
        + '</div>'
        + field('Должность', 'position', 'text')
        + '<div class="lw-row-3">'
        + field('Доп. доход (тип)', 'additional_income_type', 'text')
        + field('Доп. доход, ₽', 'additional_income', 'number')
        + field('Иное', 'additional_income_other', 'text')
        + '</div>'
        + '<div class="lw-row">'
        + field('Платежи по тек. займам, ₽', 'current_loans_payments', 'number')
        + field('Обязательные расходы, ₽', 'mandatory_expenses', 'number')
        + '</div>'
        + field('Действующие займы', 'has_active_loans', 'select', { options: ['Нет', 'Да'] })
      )

      + section('lw-fl', ''
        + '<div class="lw-st">Семья</div>'
        + '<div class="lw-row">'
        + field('Семейное положение', 'marital_status', 'select', { options: ['Холост / не замужем', 'Женат / замужем', 'Разведён / разведена', 'Вдовец / вдова'] })
        + field('Несовершеннолетние дети', 'has_minor_children', 'select', { options: ['Нет', 'Да'] })
        + '</div>'
        + '<div class="lw-row">'
        + field('Количество детей', 'children_count', 'number')
        + '</div>'
        + '<div class="lw-row-3">'
        + field('ФИО супруга(и)', 'spouse_name', 'text')
        + field('Телефон супруга(и)', 'spouse_phone', 'tel')
        + field('Доход супруга(и), ₽', 'spouse_income', 'number')
        + '</div>'
      )

      // ─── Блок ЮЛ / ИП ────────────────────────────────────────
      + section('lw-ul lw-hidden', ''
        + '<div class="lw-st">Данные организации / ИП</div>'
        + field('Наименование организации / ИП', 'full_name', 'text', { required: true, dadata: 'party', placeholder: 'Введите название или ИНН...' })
        + '<div class="lw-row">'
        + field('ИНН', 'inn', 'text')
        + field('ФИО руководителя / ИП', 'employer_name', 'text')
        + '</div>'
        + field('Юридический / фактический адрес', 'registration_address', 'text', { dadata: 'address', placeholder: 'Начните вводить адрес...' })
        + '<div class="lw-row">'
        + field('Телефон', 'mobile_phone', 'tel', { required: true, placeholder: '+7 (___) ___-__-__' })
        + field('Email', 'email', 'email', { required: true, placeholder: 'name@example.com' })
        + '</div>'
      )

      // ─── Залог (общий блок) ──────────────────────────────────
      + section('', ''
        + '<div class="lw-st">Залог: недвижимость</div>'
        + field('Тип недвижимости', 'real_estate_type', 'text', { placeholder: 'Квартира, дом, земля...' })
        + '<div class="lw-row">'
        + field('Кадастровый номер', 'cadastral_number', 'text')
        + field('Адрес объекта', 'property_address', 'text')
        + '</div>'
        + '<div class="lw-row">'
        + field('Кадастровый номер участка', 'land_cadastral_number', 'text')
        + field('Адрес участка', 'land_address', 'text')
        + '</div>'
      )

      + section('', ''
        + '<div class="lw-st">Залог: автомобиль</div>'
        + '<div class="lw-row-3">'
        + field('Марка', 'car_brand', 'text')
        + field('Модель', 'car_model', 'text')
        + field('Год', 'car_year', 'number')
        + '</div>'
        + field('Рыночная стоимость, ₽', 'car_market_value', 'number')
        + field('Иное обеспечение', 'other_collateral_description', 'textarea')
      )

      + section('', ''
        + '<div class="lw-st">Контактное лицо (на случай связи)</div>'
        + '<div class="lw-row">'
        + field('ФИО', 'contact_full_name', 'text')
        + field('Телефон', 'contact_phone', 'tel')
        + '</div>'
      )

      + section('', ''
        + '<div class="lw-st">Проверка</div>'
        + '<div class="lw-field">'
        + '<label class="lw-label">Сколько будет: <span id="lw-cap-q" class="lw-captcha-q">…</span> <span class="lw-req">*</span></label>'
        + '<div class="lw-captcha">'
        + '<span class="lw-captcha-q" id="lw-cap-q2">…</span>'
        + '<input class="lw-input" type="number" id="lw-cap-a" name="captcha_answer" required />'
        + '<button type="button" class="lw-captcha-reload" id="lw-cap-r">обновить</button>'
        + '</div>'
        + '</div>'
        + '<label class="lw-checkbox"><input type="checkbox" id="lw-consent" required /><span>Я даю согласие на обработку персональных данных в соответствии с Политикой конфиденциальности <span class="lw-req">*</span></span></label>'
      )

      + section('', ''
        + '<button type="submit" class="lw-btn" id="lw-submit">Отправить заявку</button>'
        + '<p class="lw-foot">Отправляя форму, вы подтверждаете согласие на обработку персональных данных.</p>'
      )

      + '</form>'
      + '</div>';
  }

  var captchaToken = '';

  function loadCaptcha() {
    var cb = $('lw-cap-q'), cb2 = $('lw-cap-q2');
    if (cb) cb.textContent = '…';
    if (cb2) cb2.textContent = '…';
    fetch(API_URL + '?action=captcha').then(function (r) { return r.json(); }).then(function (j) {
      captchaToken = j.token || '';
      if (cb) cb.textContent = j.question || '?';
      if (cb2) cb2.textContent = j.question || '?';
    }).catch(function () {
      if (cb) cb.textContent = 'ошибка';
      if (cb2) cb2.textContent = 'ошибка';
    });
  }

  function showMsg(kind, text) {
    var box = $('lw-msg');
    if (!box) return;
    if (!kind) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="lw-msg ' + kind + '">' + text + '</div>';
    if (kind === 'ok') box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function applyBorrowerType(c, type) {
    var flBlocks = c.querySelectorAll('.lw-section.lw-fl');
    var ulBlocks = c.querySelectorAll('.lw-section.lw-ul');
    if (type === 'fl') {
      flBlocks.forEach(function (b) { b.classList.remove('lw-hidden'); });
      ulBlocks.forEach(function (b) { b.classList.add('lw-hidden'); });
    } else {
      flBlocks.forEach(function (b) { b.classList.add('lw-hidden'); });
      ulBlocks.forEach(function (b) { b.classList.remove('lw-hidden'); });
    }
    // Для скрытых обязательных полей убираем required, чтобы браузер не блокировал отправку
    c.querySelectorAll('input[required], textarea[required]').forEach(function (inp) {
      var sec = inp.closest('.lw-section');
      if (sec && sec.classList.contains('lw-hidden')) {
        inp.dataset.lwReq = '1';
        inp.required = false;
      }
    });
    c.querySelectorAll('input[data-lw-req="1"], textarea[data-lw-req="1"]').forEach(function (inp) {
      var sec = inp.closest('.lw-section');
      if (sec && !sec.classList.contains('lw-hidden')) {
        inp.required = true;
      }
    });
  }

  function fetchDadata(type, query) {
    return fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dadata', type: type, query: query }),
    }).then(function (r) { return r.json(); }).catch(function () { return { suggestions: [] }; });
  }

  function setVal(c, name, value) {
    var el = c.querySelector('[name="' + name + '"]');
    if (!el) return;
    if (!el.value || el.dataset.lwAuto !== '0') {
      el.value = value;
    }
  }

  function renderSuggestion(type, item) {
    if (type === 'address') return item.value || '';
    if (type === 'fms_unit') {
      var code = item.data && item.data.code ? '<div class="lw-dd-meta">' + item.data.code + '</div>' : '';
      return (item.value || '') + code;
    }
    if (type === 'party') {
      var name = (item.data && item.data.name && (item.data.name.short_with_opf || item.data.name.full_with_opf)) || item.value || '';
      var meta = '';
      var inn = item.data && item.data.inn ? 'ИНН: ' + item.data.inn : '';
      var addr = item.data && item.data.address && item.data.address.value ? ' • ' + item.data.address.value : '';
      if (inn || addr) meta = '<div class="lw-dd-meta">' + inn + addr + '</div>';
      return name + meta;
    }
    return item.value || '';
  }

  function applySelection(c, input, type, item) {
    if (type === 'address') {
      input.value = (item.unrestricted_value || item.value || '');
    } else if (type === 'fms_unit') {
      input.value = item.value || '';
      if (item.data && item.data.code) setVal(c, 'passport_division_code', item.data.code);
    } else if (type === 'party') {
      var name = item.data && item.data.name;
      var fullName = (name && (name.full_with_opf || name.short_with_opf)) || item.value || '';
      var inn = (item.data && item.data.inn) || '';
      var addr = (item.data && item.data.address && item.data.address.unrestricted_value) || '';
      var fieldName = input.getAttribute('name');
      if (fieldName === 'employer_inn') {
        input.value = inn;
        if (name && name.short_with_opf) setVal(c, 'employer_name', name.short_with_opf);
      } else {
        input.value = fullName;
        if (inn) setVal(c, 'inn', inn);
        if (addr) setVal(c, 'registration_address', addr);
        var mgmt = item.data && item.data.management;
        if (mgmt && mgmt.name) setVal(c, 'employer_name', mgmt.name);
      }
    }
  }

  function attachDadata(c, input) {
    var type = input.getAttribute('data-dadata');
    if (!type) return;
    var wrap = input.parentNode;
    var dd = null;
    var items = [];
    var activeIdx = -1;
    var timer = null;

    function close() {
      if (dd) { dd.remove(); dd = null; items = []; activeIdx = -1; }
    }

    function open(suggestions) {
      close();
      if (!suggestions || !suggestions.length) return;
      items = suggestions;
      dd = document.createElement('div');
      dd.className = 'lw-dd';
      suggestions.forEach(function (s, i) {
        var it = document.createElement('div');
        it.className = 'lw-dd-item';
        it.innerHTML = renderSuggestion(type, s);
        it.addEventListener('mousedown', function (ev) {
          ev.preventDefault();
          applySelection(c, input, type, s);
          close();
        });
        dd.appendChild(it);
      });
      wrap.appendChild(dd);
    }

    function query() {
      var q = input.value.trim();
      var minChars = type === 'address' ? 3 : 2;
      if (q.length < minChars) { close(); return; }
      fetchDadata(type, q).then(function (res) {
        if (document.activeElement !== input) return;
        open(res.suggestions || []);
      });
    }

    input.addEventListener('input', function () {
      if (timer) clearTimeout(timer);
      timer = setTimeout(query, 300);
    });
    input.addEventListener('focus', function () {
      if (input.value.trim().length >= (type === 'address' ? 3 : 2)) query();
    });
    input.addEventListener('blur', function () {
      setTimeout(close, 150);
    });
    input.addEventListener('keydown', function (ev) {
      if (!dd) return;
      var nodes = dd.querySelectorAll('.lw-dd-item');
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        activeIdx = Math.min(activeIdx + 1, nodes.length - 1);
        nodes.forEach(function (n, i) { n.classList.toggle('active', i === activeIdx); });
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        activeIdx = Math.max(activeIdx - 1, 0);
        nodes.forEach(function (n, i) { n.classList.toggle('active', i === activeIdx); });
      } else if (ev.key === 'Enter' && activeIdx >= 0 && items[activeIdx]) {
        ev.preventDefault();
        applySelection(c, input, type, items[activeIdx]);
        close();
      } else if (ev.key === 'Escape') {
        close();
      }
    });
  }

  function init() {
    injectStyle();
    var c = document.getElementById(CONTAINER_ID);
    if (!c) {
      console.warn('[loan-widget] контейнер #' + CONTAINER_ID + ' не найден');
      return;
    }
    c.className = (c.className || '') + ' lw-wrap';
    c.innerHTML = buildHtml();

    var btns = c.querySelectorAll('.lw-toggle button');
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        btns.forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        var type = b.getAttribute('data-bt');
        c.querySelector('input[name=borrower_type]').value = type;
        applyBorrowerType(c, type);
      });
    });
    applyBorrowerType(c, 'fl');

    c.querySelectorAll('[data-dadata]').forEach(function (inp) {
      attachDadata(c, inp);
    });

    $('lw-cap-r').addEventListener('click', loadCaptcha);
    loadCaptcha();

    $('lw-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var consent = $('lw-consent').checked;
      if (!consent) {
        showMsg('err', 'Необходимо согласие на обработку персональных данных.');
        return;
      }
      var data = { source: SOURCE, consent_pd: true, captcha_token: captchaToken };
      // Собираем только поля из видимых секций
      c.querySelectorAll('input[name], select[name], textarea[name]').forEach(function (inp) {
        var sec = inp.closest('.lw-section');
        if (sec && sec.classList.contains('lw-hidden')) return;
        var name = inp.getAttribute('name');
        var val = inp.value;
        if (val !== '' && val != null) data[name] = val;
      });

      var btn = $('lw-submit');
      btn.disabled = true;
      btn.textContent = 'Отправка...';
      showMsg('', '');

      fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (res.ok && res.j && res.j.success) {
            showMsg('ok', '<b>Заявка успешно отправлена!</b><br/>Номер вашей заявки: <b>' + res.j.application_no + '</b>. Наш специалист свяжется с вами в ближайшее время.');
            $('lw-form').reset();
            c.querySelector('input[name=borrower_type]').value = 'fl';
            btns.forEach(function (x) { x.classList.remove('active'); });
            btns[0].classList.add('active');
            applyBorrowerType(c, 'fl');
            loadCaptcha();
          } else {
            showMsg('err', (res.j && res.j.error) || 'Не удалось отправить заявку. Попробуйте ещё раз.');
            loadCaptcha();
          }
        })
        .catch(function () {
          showMsg('err', 'Ошибка сети. Проверьте интернет-соединение и попробуйте снова.');
          loadCaptcha();
        })
        .then(function () {
          btn.disabled = false;
          btn.textContent = 'Отправить заявку';
        });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();