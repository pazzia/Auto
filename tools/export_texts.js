// Выгружает все советы приложения в docs/review-texts.md для проверки механиком (AUTO-26).
// Запуск: node tools/export_texts.js
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
global.window = { addEventListener() {}, AutoHubUI: { esc: (s) => s, norm: (s) => String(s).toLowerCase(), events: () => ({}) } };
global.document = { getElementById: () => null, querySelectorAll: () => [] };
global.location = { search: "", hash: "" };
global.localStorage = { getItem: () => null, setItem() {} };
["api.js", "icons.js", "mechanic.js", "diy.js"].forEach((f) => eval(fs.readFileSync(path.join(root, "web", f), "utf8")));
const W = global.window, out = [];
const C = { red: "красный", amber: "жёлтый", green: "зелёный", blue: "синий" };
const V = { stop: "ОСТАНОВИТЬСЯ", soon: "В СЕРВИС В БЛИЖАЙШЕЕ ВРЕМЯ", info: "ИНФОРМАЦИЯ", ok: "НЕ ОПАСНО" };
out.push("# АвтоХаб — тексты советов для проверки механиком (AUTO-26)\n");
out.push("Для каждого пункта отметьте: ✅ верно · ✏️ поправить (впишите правку) · ❌ убрать. Особое внимание — оценке срочности.\n");
out.push("## 1. Значки на панели (AUTO-1)\n");
W.AutoHubIcons.list().forEach((ic, i) => {
  out.push(`### 1.${i + 1}. ${ic.name} — цвет: ${C[ic.color]}, срочность: ${V[ic.drive]}\n`);
  out.push(`**Что значит:** ${ic.what}\n`);
  if (ic.todo.length) out.push("**Что делать:**\n" + ic.todo.map((t, j) => `${j + 1}. ${t}`).join("\n") + "\n");
  out.push("Проверка: ☐ верно ☐ поправить ☐ убрать · Комментарий: ______\n");
});
out.push("## 2. AI-механик — база знаний (AUTO-3)\n");
const kbSrc = fs.readFileSync(path.join(root, "web", "mechanic.js"), "utf8");
const keys = [...kbSrc.matchAll(/^\s{4}(\w+): \{ (?:verdict|text)/gm)].map((m) => m[1]);
let n = 0;
keys.forEach((k) => {
  const a = W.AutoHubMechanicKB.answer({ node: k });
  if (!a.verdict) return; // уточняющие вопросы без совета не проверяем
  n++;
  out.push(`### 2.${n}. ${a.text} — срочность: ${V[a.verdict]}\n`);
  if (a.causes) out.push("**Вероятные причины:**\n" + a.causes.map((t, j) => `${j + 1}. ${t}`).join("\n") + "\n");
  if (a.todo) out.push("**Что делать:**\n" + a.todo.map((t) => `- ${t}`).join("\n") + "\n");
  out.push("Проверка: ☐ верно ☐ поправить ☐ убрать · Комментарий: ______\n");
});
out.push("## 3. Сделай сам (AUTO-16)\n");
W.AutoHubDIY.guides().forEach((g, i) => {
  out.push(`### 3.${i + 1}. ${g.title} — ${g.level}, ${g.time}\n`);
  out.push(g.steps.map((s, j) => `${j + 1}. ${s[0]}${s[1] ? `\n   _Подсказка:_ ${s[1]}` : ""}`).join("\n") + "\n");
  out.push("Проверка: ☐ верно ☐ поправить ☐ убрать · Комментарий: ______\n");
});
fs.writeFileSync(path.join(root, "docs", "review-texts.md"), out.join("\n"));
console.log("ok: значков", W.AutoHubIcons.list().length, "· советов механика", n, "· инструкций", W.AutoHubDIY.guides().length);
