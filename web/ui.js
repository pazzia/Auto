/* АвтоХаб: общие элементы интерфейса — нижняя шторка, диалог, всплывающее сообщение.
 * Шторка добавляет в адрес суффикс «/sheet», поэтому системная кнопка «Назад» закрывает её,
 * а не уводит с экрана.
 */
(function () {
  "use strict";

  var open = null, afterClose = null;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function baseHash() { return (location.hash || "#Garage").replace(/\/sheet$/, ""); }

  function remove() {
    if (!open) return;
    var el = open; open = null;
    el.classList.remove("show");
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 180);
    var cb = afterClose; afterClose = null;
    if (cb) setTimeout(cb, 0);
  }

  /** Показать шторку. opts: { title, html, onMount(el) } */
  function sheet(opts) {
    if (open) remove();
    var wrap = document.createElement("div");
    wrap.className = "sheet-wrap";
    wrap.innerHTML = '<div class="sheet-backdrop" data-close="1"></div>' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-label="' + esc(opts.title || "") + '">' +
      '<div class="sheet-grip"></div>' +
      (opts.title ? '<div class="sheet-title">' + esc(opts.title) + "</div>" : "") +
      '<div class="sheet-body">' + (opts.html || "") + "</div></div>";
    document.body.appendChild(wrap);
    open = wrap;
    wrap.addEventListener("click", function (e) { if (e.target.closest("[data-close]")) close(); });
    if (opts.onMount) opts.onMount(wrap.querySelector(".sheet-body"));
    requestAnimationFrame(function () { wrap.classList.add("show"); });
    if (!/\/sheet$/.test(location.hash)) location.hash = baseHash().slice(1) + "/sheet";
    return wrap;
  }

  /** Закрыть шторку; cb выполнится после закрытия (например, переход на другой экран). */
  function close(cb) {
    if (!open) { if (cb) cb(); return; }
    afterClose = cb || null;
    if (/\/sheet$/.test(location.hash)) history.back(); else remove();
  }

  /** Диалог с текстом и кнопкой. */
  function dialog(title, text, button) {
    return sheet({
      title: title,
      html: '<p class="sheet-text">' + esc(text) + '</p><button class="btn-dark" data-close="1" data-action="close">' + esc(button || "Понятно") + "</button>"
    });
  }

  var toastT;
  function toast(msg) {
    var t = document.getElementById("toast"); if (!t) return;
    t.textContent = msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove("show"); }, 1800);
  }

  window.addEventListener("hashchange", function () { if (open && !/\/sheet$/.test(location.hash)) remove(); });
  // Страница открыта сразу с «/sheet» — шторки нет, убираем суффикс
  if (/\/sheet$/.test(location.hash)) history.replaceState(null, "", baseHash());

  window.AutoHubUI = { sheet: sheet, close: close, dialog: dialog, toast: toast, esc: esc };
})();
