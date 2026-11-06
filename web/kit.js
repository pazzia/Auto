/* АвтоХаб: общие элементы оформления — линейные иконки, шторка подтверждения, склонения.
 * Подключается сразу после ui.js (см. JS_FILES в tools/build_prototype.py).
 */
(function () {
  "use strict";

  // Линейные иконки 24×24, stroke — в стиле нижней панели и плиток «Всё для машины»
  var P = {
    star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
    coin: '<circle cx="12" cy="12" r="8"/><path d="M10 8h3a2.5 2.5 0 0 1 0 5h-3V8zM9 16h4"/>',
    history: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/><path d="M12 8v4l3 2"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    passport: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M9 16h6"/>',
    shield: '<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
    parking: '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M10 16V8h3a2.5 2.5 0 0 1 0 5h-3"/>',
    alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.2"/>',
    chat: '<path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 10h8M8 13h5"/>',
    fuel: '<path d="M5 20V5.5A1.5 1.5 0 0 1 6.5 4h6A1.5 1.5 0 0 1 14 5.5V20"/><path d="M4 20h11"/><path d="M7 7h5v4H7z"/><path d="M14 9h1.5l2 2v5.5a1.5 1.5 0 0 0 3 0V8l-2-2"/>',
    pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
    bell: '<path d="M6 17V11a6 6 0 0 1 12 0v6l1.5 2h-15z"/><path d="M10 21h4"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    car: '<path d="M4 16v-4l2-5h12l2 5v4z"/><path d="M4 16v2h3v-2M17 16v2h3v-2"/><path d="M7.5 13h.01M16.5 13h.01"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>'
  };
  /** Иконка: name из P, size (по умолчанию 20), color (по умолчанию currentColor). */
  function icon(name, size, color) {
    size = size || 20;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="' + (color || "currentColor") +
      '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + (P[name] || "") + "</svg>";
  }

  /** Склонение: plural(3, "запись", "записи", "записей") → "записи". */
  function plural(n, one, few, many) {
    n = Math.abs(Math.round(Number(n) || 0)); var m = n % 10, h = n % 100;
    return m === 1 && h !== 11 ? one : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? few : many;
  }
  /** Число со словом: count(3, "запись", "записи", "записей") → "3 записи". */
  function count(n, one, few, many) { return Number(n).toLocaleString("ru-RU") + " " + plural(n, one, few, many); }

  /** Шторка подтверждения вместо window.confirm.
   * opts: { title, text, ok: "Удалить", cancel: "Отмена", danger: true }; onOk вызывается после закрытия шторки. */
  function confirm(opts, onOk) {
    var UI = window.AutoHubUI;
    UI.sheet({
      title: opts.title || "Подтвердите действие",
      html: (opts.text ? '<p class="sheet-text">' + UI.esc(opts.text) + "</p>" : "") +
        '<button class="' + (opts.danger ? "btn-danger" : "btn-dark") + '" data-action="confirm-ok">' + UI.esc(opts.ok || "Да") + "</button>" +
        '<button class="btn-light" data-close="1" data-action="confirm-cancel">' + UI.esc(opts.cancel || "Отмена") + "</button>",
      onMount: function (b) {
        b.querySelector("[data-action=confirm-ok]").addEventListener("click", function () { UI.close(onOk); });
      }
    });
  }

  window.AutoHubKit = { icon: icon, plural: plural, count: count, confirm: confirm };
})();
