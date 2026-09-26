(function(){
  function show(){
    var name=(location.hash||"#Garage").slice(1).split("/")[0];
    var el=document.getElementById("s-"+name)||document.getElementById("s-Garage");
    document.querySelectorAll(".screen").forEach(function(s){s.classList.toggle("active",s===el)});
    var sc=el.querySelector('div[style*="flex-grow: 1"]'); if(sc) sc.scrollTop=0;
  }
  // В Android-приложении системные панели не перекрывают страницу — убираем имитацию статус-бара
  if(window.NativeHttp) document.documentElement.classList.add("native");
  function toast(msg){window.AutoHubUI.toast(msg)}
  document.addEventListener("click",function(e){
    var btn=e.target.closest("button");
    if(btn&&!btn.closest("a")&&!btn.dataset.action&&!btn.classList.contains("cartab")){toast("В прототипе это действие пока не подключено")}
  });
  window.addEventListener("hashchange",show);
  if(window.AutoHubCar) window.AutoHubCar.init();
  if(window.AutoHubServices) window.AutoHubServices.init();
  if(window.AutoHubCart) window.AutoHubCart.init();
  show();
})();
