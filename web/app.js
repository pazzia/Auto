(function(){
  function show(){
    var name=(location.hash||"#Garage").slice(1).split("/")[0];
    var el=document.getElementById("s-"+name)||document.getElementById("s-Garage");
    document.querySelectorAll(".screen").forEach(function(s){s.classList.toggle("active",s===el)});
    var sc=el.querySelector('div[style*="flex-grow: 1"]'); if(sc) sc.scrollTop=0;
  }
  var toastT;
  function toast(msg){var t=document.getElementById("toast");t.textContent=msg;t.classList.add("show");clearTimeout(toastT);toastT=setTimeout(function(){t.classList.remove("show")},1600)}
  document.addEventListener("click",function(e){
    var btn=e.target.closest("button");
    if(btn&&!btn.closest("a")&&!btn.dataset.action&&!btn.classList.contains("cartab")){toast("В прототипе это действие пока не подключено")}
  });
  window.addEventListener("hashchange",show);
  if(window.AutoHubCar) window.AutoHubCar.init();
  if(window.AutoHubServices) window.AutoHubServices.init();
  show();
})();
