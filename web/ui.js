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

  /* ---------- Подсказки при вводе ----------
   * Свой список вместо <datalist>: встроенный список Android WebView открывается отдельным окном
   * и при повторных нажатиях зависает полупрозрачным поверх экрана.
   * source() → массив строк или { value, aliases: [...] }. Список появляется с opts.min символов (по умолчанию 2).
   */
  function norm(s) {
    return String(s || "").toLowerCase().replace(/ё/g, "е").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  }
  function suggest(input, source, opts) {
    opts = opts || {};
    var min = opts.min == null ? 2 : opts.min, items = [], idx = -1, quiet = 0;
    var box = document.createElement("div");
    box.className = "sugg"; box.id = input.id + "Sugg"; box.setAttribute("role", "listbox"); box.hidden = true;
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", box.id);
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("list");
    input.parentNode.classList.add("has-sugg");
    input.parentNode.appendChild(box);

    function hide() { box.hidden = true; box.innerHTML = ""; items = []; idx = -1; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); }
    function mark(label, q) {
      var i = norm(label).indexOf(norm(q));
      if (i < 0 || label.length !== norm(label).length) return esc(label);
      return esc(label.slice(0, i)) + "<b>" + esc(label.slice(i, i + q.length)) + "</b>" + esc(label.slice(i + q.length));
    }
    function update(e) {
      // после выбора фокус возвращается в поле — не открываем список заново; ввод текста открывает всегда
      if (e && e.type === "focus" && Date.now() < quiet) return;
      var q = input.value.trim(), nq = norm(q);
      if (q.length < min) { hide(); return; }
      var starts = [], contains = [];
      (source() || []).forEach(function (o) {
        var label = typeof o === "string" ? o : o.value;
        var keys = [label].concat((o && o.aliases) || []).map(norm);
        if (keys.some(function (k) { return k.indexOf(nq) === 0; })) starts.push(label);
        else if (keys.some(function (k) { return k.indexOf(nq) > 0; })) contains.push(label);
      });
      items = starts.concat(contains).slice(0, opts.max || 8);
      if (!items.length || (items.length === 1 && norm(items[0]) === nq)) { hide(); return; }
      idx = -1;
      box.innerHTML = items.map(function (v, i) {
        return '<div role="option" class="sugg-item" id="' + box.id + i + '" data-i="' + i + '" aria-selected="false"><span>' + mark(v, q) + "</span></div>";
      }).join("");
      box.hidden = false; input.setAttribute("aria-expanded", "true");
    }
    function highlight(i) {
      idx = (i + items.length) % items.length;
      box.querySelectorAll(".sugg-item").forEach(function (el, j) {
        el.classList.toggle("on", j === idx); el.setAttribute("aria-selected", j === idx ? "true" : "false");
      });
      input.setAttribute("aria-activedescendant", box.id + idx);
    }
    function pick(v) {
      input.value = v; hide(); quiet = Date.now() + 400;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      if (opts.onPick) opts.onPick(v);
    }
    // pointerdown, а не click: поле не теряет фокус, клавиатура не прыгает
    box.addEventListener("pointerdown", function (e) {
      e.preventDefault(); e.stopPropagation();
      var it = e.target.closest(".sugg-item"); if (it) pick(items[+it.dataset.i]);
    });
    box.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); });
    input.addEventListener("input", update);
    input.addEventListener("focus", update);
    input.addEventListener("blur", function () { setTimeout(hide, 0); });
    input.addEventListener("keydown", function (e) {
      if (box.hidden) return;
      if (e.key === "ArrowDown") { e.preventDefault(); highlight(idx + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); highlight(idx - 1); }
      else if (e.key === "Enter" && idx >= 0) { e.preventDefault(); pick(items[idx]); }
      else if (e.key === "Escape") hide();
    });
    return { refresh: update, hide: hide };
  }

  window.AutoHubUI = { sheet: sheet, close: close, dialog: dialog, toast: toast, esc: esc, suggest: suggest, norm: norm };
})();
