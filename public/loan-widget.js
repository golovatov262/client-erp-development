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
    ;

  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, html) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) { if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }
    if (html != null) e.innerHTML = html;
    return e;
  }

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
    var input;
    if (type === 'textarea') {
      input = '<textarea class="lw-textarea" name="' + name + '" ' + (opts.required ? 'required' : '') + '></textarea>';
    } else if (type === 'select') {
      var opt = '<option value="">— выберите —</option>';
      (opts.options || []).forEach(function (o) { opt += '<option value="' + o + '">' + o + '</option>'; });
      input = '<select class="lw-select" name="' + name + '">' + opt + '</select>';
    } else {
      input = '<input class="lw-input" type="' + type + '" name="' + name + '"' + (opts.placeholder ? ' placeholder="' + opts.placeholder + '"' : '') + (opts.required ? ' required' : '') + ' />';
    }
    return '<div class="lw-field"><label class="lw-label">' + label + req + '</label>' + input + '</div>';
  }

  function buildHtml() {
    return ''
      + '<div class="lw-card">'
      + '<h2 class="lw-h">Заявка на займ</h2>'
      + '<p class="lw-sub">Заполните форму, и наш специалист свяжется с вами для уточнения деталей.</p>'
      + '<div id="lw-msg"></div>'
      + '<form id="lw-form" autocomplete="on">'

      + '<div class="lw-section">'
      + '<div class="lw-st">Тип заёмщика</div>'
      + '<div class="lw-toggle">'
      + '<button type="button" data-bt="fl" class="active">Физ. лицо</button>'
      + '<button type="button" data-bt="ip">ИП</button>'
      + '<button type="button" data-bt="ul">Юр. лицо</button>'
      + '</div>'
      + '<input type="hidden" name="borrower_type" value="fl" />'
      + '</div>'

      + '<div class="lw-section">'
      + '<div class="lw-st">Контактные данные</div>'
      + field('ФИО', 'full_name', 'text', { required: true, placeholder: 'Иванов Иван Иванович' })
      + '<div class="lw-row">'
      + field('Телефон', 'mobile_phone', 'tel', { required: true, placeholder: '+7 (___) ___-__-__' })
      + field('Email', 'email', 'email', { required: true, placeholder: 'name@example.com' })
      + '</div>'
      + '</div>'

      + '<div class="lw-section">'
      + '<div class="lw-st">Условия займа</div>'
      + '<div class="lw-row-3">'
      + field('Сумма, ₽', 'amount', 'number')
      + field('Срок, мес.', 'term_months', 'number')
      + field('Программа', 'loan_program', 'text')
      + '</div>'
      + field('Виды залога', 'collateral_types', 'text', { placeholder: 'Авто, недвижимость и т.д.' })
      + '</div>'

      + '<div class="lw-section">'
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
      + field('Кем выдан', 'passport_issued_by', 'textarea')
      + field('Адрес регистрации', 'registration_address', 'textarea')
      + field('ИНН', 'inn', 'text')
      + '</div>'

      + '<div class="lw-section">'
      + '<div class="lw-st">Банковские реквизиты</div>'
      + '<div class="lw-row-3">'
      + field('Расчётный счёт', 'bank_account', 'text')
      + field('БИК', 'bik', 'text')
      + field('Банк', 'bank_name', 'text')
      + '</div>'
      + '</div>'

      + '<div class="lw-section">'
      + '<div class="lw-st">Доход и работа</div>'
      + '<div class="lw-row">'
      + field('Официальный доход, ₽', 'official_income', 'number')
      + field('Подтверждение дохода', 'income_confirmation', 'text', { placeholder: '2-НДФЛ, справка по форме банка...' })
      + '</div>'
      + '<div class="lw-row">'
      + field('ИНН работодателя', 'employer_inn', 'text')
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
      + '</div>'

      + '<div class="lw-section">'
      + '<div class="lw-st">Семья</div>'
      + '<div class="lw-row">'
      + field('Семейное положение', 'marital_status', 'select', { options: ['Холост / не замужем', 'Женат / замужем', 'Разведён / разведена', 'Вдовец / вдова'] })
      + field('Несовершеннолетние дети', 'has_minor_children', 'select', { options: ['Нет', 'Да'] })
      + '</div>'
      + '<div class="lw-row">'
      + field('Количество детей', 'children_count', 'number')
      + field('Маткапитал', 'has_maternal_capital', 'select', { options: ['Нет', 'Да'] })
      + '</div>'
      + '<div class="lw-row-3">'
      + field('ФИО супруга(и)', 'spouse_name', 'text')
      + field('Телефон супруга(и)', 'spouse_phone', 'tel')
      + field('Доход супруга(и), ₽', 'spouse_income', 'number')
      + '</div>'
      + '</div>'

      + '<div class="lw-section">'
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
      + '</div>'

      + '<div class="lw-section">'
      + '<div class="lw-st">Залог: автомобиль</div>'
      + '<div class="lw-row-3">'
      + field('Марка', 'car_brand', 'text')
      + field('Модель', 'car_model', 'text')
      + field('Год', 'car_year', 'number')
      + '</div>'
      + field('Рыночная стоимость, ₽', 'car_market_value', 'number')
      + field('Иное обеспечение', 'other_collateral_description', 'textarea')
      + '</div>'

      + '<div class="lw-section">'
      + '<div class="lw-st">Контактное лицо (на случай связи)</div>'
      + '<div class="lw-row">'
      + field('ФИО', 'contact_full_name', 'text')
      + field('Телефон', 'contact_phone', 'tel')
      + '</div>'
      + '</div>'

      + '<div class="lw-section">'
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
      + '</div>'

      + '<div class="lw-section">'
      + '<button type="submit" class="lw-btn" id="lw-submit">Отправить заявку</button>'
      + '<p class="lw-foot">Отправляя форму, вы подтверждаете согласие на обработку персональных данных.</p>'
      + '</div>'
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
    box.innerHTML = '<div class="lw-msg ' + kind + '">' + text + '</div>';
    if (kind === 'ok') box.scrollIntoView({ behavior: 'smooth', block: 'center' });
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

    // Toggle borrower_type
    var btns = c.querySelectorAll('.lw-toggle button');
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        btns.forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        c.querySelector('input[name=borrower_type]').value = b.getAttribute('data-bt');
      });
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
      var fd = new FormData($('lw-form'));
      fd.forEach(function (v, k) { if (v !== '') data[k] = v; });

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
