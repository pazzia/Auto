(function(){
  // Показ экрана по адресу (#Экран или #Экран/доп). Без входа доступно только приветствие.
  var last=null;
  function show(){
    if(window.AutoHubAuth) window.AutoHubAuth.guard();
    var name=(location.hash||"#Garage").slice(1).split("/")[0];
    // Старые экраны ТО заменены единым сценарием
    if(name==="OneTapTO"||name==="Reminders"){ history.replaceState(null,"","#TO"); name="TO"; }
    var el=document.getElementById("s-"+name)||document.getElementById("s-Garage");
    document.querySelectorAll(".screen").forEach(function(s){s.classList.toggle("active",s===el)});
    if(el!==last){ var sc=el.querySelector('div[style*="flex-grow: 1"]'); if(sc) sc.scrollTop=0; last=el; }
    resetScroll();
  }
  // В Android-приложении системные панели не перекрывают страницу — убираем имитацию статус-бара
  if(window.NativeHttp) document.documentElement.classList.add("native");
  // Страховка: если у кнопки нет обработчика, честно говорим, что это демо
  document.addEventListener("click",function(e){
    var btn=e.target.closest("button");
    // Любой data-атрибут у кнопки означает, что её обрабатывает модуль экрана
    if(btn&&!btn.closest("a")&&!Object.keys(btn.dataset).length&&!btn.id&&!btn.classList.contains("cartab")&&!btn.closest(".sheet")){
      window.AutoHubUI.toast("Демо: здесь будет «"+(btn.getAttribute("aria-label")||btn.textContent.trim()).slice(0,40)+"»");
    }
  });
  // Страница и корни экранов никогда не должны быть прокручены (клавиатура в WebView умеет их сдвигать)
  function resetScroll(){
    window.scrollTo(0,0); document.documentElement.scrollTop=0; document.body.scrollTop=0;
    document.querySelectorAll(".screen, .screen>div").forEach(function(e){ if(e.scrollTop) e.scrollTop=0; });
  }
  window.addEventListener("resize",function(){ setTimeout(resetScroll,50); });
  document.addEventListener("focusout",function(){ setTimeout(resetScroll,300); });
  window.addEventListener("hashchange",show);
  // Даты макета: элемент с data-rel-day="N" показывает «сегодня + N дней» в формате data-date-fmt
  // (d — число, MMMM — «ноября», MMM — «нояб», wd — «пн», yyyy — год); data-date-case="upper" — заглавными.
  // Заполняется один раз при запуске, до модулей экранов: модуль может перезаписать текст своими данными.
  (function fillDates(){
    var WD=["вс","пн","вт","ср","чт","пт","сб"],
      MG=["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"],
      MS=["янв","фев","мар","апр","мая","июн","июл","авг","сент","окт","нояб","дек"], now=new Date();
    document.querySelectorAll("[data-rel-day]").forEach(function(el){
      var d=new Date(now.getFullYear(),now.getMonth(),now.getDate()+(parseInt(el.dataset.relDay,10)||0));
      var t=(el.dataset.dateFmt||"d MMMM").replace(/yyyy|MMMM|MMM|wd|d/g,function(k){
        return k==="yyyy"?d.getFullYear():k==="MMMM"?MG[d.getMonth()]:k==="MMM"?MS[d.getMonth()]:k==="wd"?WD[d.getDay()]:d.getDate();
      });
      el.textContent=el.dataset.dateCase==="upper"?t.toUpperCase():t;
    });
  })();
  ["AutoHubCar","AutoHubServices","AutoHubCart","AutoHubParts","AutoHubScreens","AutoHubTO","AutoHubIcons","AutoHubParking","AutoHubMechanic","AutoHubMoney","AutoHubFuel","AutoHubDocs","AutoHubSeason","AutoHubChecklists","AutoHubDIY","AutoHubBodyPhoto","AutoHubCalc","AutoHubAuth","AutoHubAch","AutoHubHub"].forEach(function(m){
    try{ if(window[m]) window[m].init(); }catch(err){ if(window.console) console.error(m,err); }
  });
  show();
})();
