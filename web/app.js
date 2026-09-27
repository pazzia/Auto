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
  ["AutoHubCar","AutoHubServices","AutoHubCart","AutoHubParts","AutoHubScreens","AutoHubTO","AutoHubIcons","AutoHubParking","AutoHubMechanic","AutoHubAuth"].forEach(function(m){
    try{ if(window[m]) window[m].init(); }catch(err){ if(window.console) console.error(m,err); }
  });
  show();
})();
