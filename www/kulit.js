/* ============================================================
   KULIT.JS — opening (logo dirakit) + partikel bg3d.
   Berdiri sendiri. Tidak memanggil / mengubah app.js atau db.js.
   ============================================================ */
(function(){
  'use strict';
  document.body.classList.add('k-opening');   // sembunyikan app selama opening

  /* ---------- partikel background (dioptimalkan utk hp lemah) ----------
     - glow pakai sprite radial yang di-cache (bukan shadowBlur per-partikel;
       shadowBlur tiap frame itu biang lag di hp).
     - jumlah partikel & DPR dibatasi; frame di-cap ~40fps biar mulus. */
  var cv=document.getElementById('k-partikel');
  if(cv){
    var g=cv.getContext('2d'),P=[];
    var mMotion=matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches;
    var lemah=(navigator.deviceMemory&&navigator.deviceMemory<=4)||(navigator.hardwareConcurrency&&navigator.hardwareConcurrency<=4)||innerWidth<520;
    function accRGB(){
      var h=(getComputedStyle(document.documentElement).getPropertyValue('--h').trim())||'150';
      g.fillStyle='hsl('+h+' 72% 46%)'; var hex=g.fillStyle; // browser resolve -> #rrggbb / rgb()
      if(hex[0]==='#'){var n=parseInt(hex.slice(1),16);return (n>>16&255)+','+(n>>8&255)+','+(n&255);}
      var m=hex.match(/\d+/g); return m?m.slice(0,3).join(','):'24,184,119';
    }
    /* sprite glow di-cache sekali per warna, digambar via drawImage (murah) */
    var sprC=document.createElement('canvas'),sprG=sprC.getContext('2d'),sprRGB='';
    function buatSprite(rgb){sprRGB=rgb;var s=24;sprC.width=sprC.height=s;sprG.clearRect(0,0,s,s);
      var gr=sprG.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
      gr.addColorStop(0,'rgba('+rgb+',1)');gr.addColorStop(.35,'rgba('+rgb+',.55)');gr.addColorStop(1,'rgba('+rgb+',0)');
      sprG.fillStyle=gr;sprG.beginPath();sprG.arc(s/2,s/2,s/2,0,6.28);sprG.fill();}
    function nP(){return{x:Math.random()*cv.width,y:Math.random()*cv.height,r:Math.random()*1.6+.5,s:Math.random()*.4+.08,o:Math.random()*.5+.12,tw:Math.random()*6.28,a:Math.random()<.5};}
    function ukur(){var dpr=Math.min(devicePixelRatio||1,lemah?1:1.5);
      cv.width=innerWidth*dpr;cv.height=innerHeight*dpr;cv.style.width=innerWidth+'px';cv.style.height=innerHeight+'px';
      g.setTransform(dpr,0,0,dpr,0,0);
      P=[];var cap=lemah?36:60,n=Math.min(cap,innerWidth/(lemah?26:18)|0);
      for(var i=0;i<n;i++)P.push(nP());}
    var W=function(){return cv.width/(Math.min(devicePixelRatio||1,lemah?1:1.5));},
        H=function(){return cv.height/(Math.min(devicePixelRatio||1,lemah?1:1.5));};
    var last=0,minDt=lemah?1000/30:1000/48;
    function draw(t){requestAnimationFrame(draw);
      if(t-last<minDt)return; last=t;
      var w=W(),h=H();g.clearRect(0,0,w,h);
      var rgb=accRGB();if(rgb!==sprRGB)buatSprite(rgb);
      g.globalCompositeOperation='lighter';
      for(var i=0;i<P.length;i++){var p=P[i];p.y-=p.s;if(p.y<-6){p.y=h+6;p.x=Math.random()*w;}p.tw+=.02;
        var a=p.o*(.6+.4*Math.sin(p.tw));var d=p.r*4;
        g.globalAlpha=a;
        if(p.a){g.drawImage(sprC,p.x-d/2,p.y-d/2,d,d);}
        else{g.globalCompositeOperation='source-over';g.fillStyle='rgba(200,220,230,'+a+')';g.beginPath();g.arc(p.x,p.y,p.r,0,6.28);g.fill();g.globalCompositeOperation='lighter';}}
      g.globalAlpha=1;g.globalCompositeOperation='source-over';}
    ukur();
    if(!mMotion)requestAnimationFrame(draw);
    var rz;addEventListener('resize',function(){clearTimeout(rz);rz=setTimeout(ukur,180);});
  }

  /* ---------- opening video: main sekali -> freeze frame terakhir ---------- */
  var panggung=document.getElementById('panggung');
  var vid=document.getElementById('v-pembuka');
  var gk=document.getElementById('g-ketuk');
  var loader=document.getElementById('kloader');

  function tampilkanKetuk(){ if(gk)gk.classList.add('tampil'); }
  /* akhir: video digantikan hero logo HIDUP (ngambang + swivel 3D + kilau) */
  function keAkhir(){ if(!panggung||panggung.classList.contains('akhir'))return;
    try{ if(vid)vid.pause(); }catch(e){}
    panggung.classList.add('akhir'); tampilkanKetuk(); }

  if(vid){
    /* autoplay ter-mute (paling aman di WebView). Kalau ketolak, poster
       (frame terakhir) tetap tampil -> user ketuk buat mainkan lalu masuk. */
    vid.muted=true;
    var pr=vid.play();
    if(pr&&pr.catch)pr.catch(function(){ tampilkanKetuk(); });
    /* video TIDAK loop -> saat kelar, serah-terima ke hero logo hidup */
    vid.addEventListener('ended',keAkhir);
    vid.addEventListener('error',keAkhir);
    /* jaring pengaman: kalau 'ended' tak pernah datang, tetap ke hero <8s */
    setTimeout(keAkhir,8000);
  } else {
    keAkhir();
  }

  /* ---------- ketuk: kalau autoplay keblok, tap pertama MAINKAN video dulu;
       selebihnya tap = masuk app ---------- */
  var sudah=false;
  function masuk(){
    if(sudah||!panggung)return; sudah=true;
    try{ if(vid)vid.pause(); }catch(e){}
    panggung.classList.add('keluar');
    if(loader)setTimeout(function(){loader.classList.add('on');},900);
    setTimeout(function(){panggung.classList.add('pergi');},1300);
    setTimeout(function(){if(loader)loader.classList.remove('on');if(panggung)panggung.style.display='none';document.body.classList.remove('k-opening');},2200);
  }
  function onKetuk(){
    /* sebelum hero: kalau video belum mulai (autoplay diblokir) -> putar dulu */
    if(vid && panggung && !panggung.classList.contains('akhir') &&
       vid.paused && !vid.ended && vid.currentTime===0){
      try{ vid.muted=true; var pr=vid.play(); if(pr&&pr.catch)pr.catch(function(){masuk();}); return; }
      catch(e){ masuk(); return; }
    }
    masuk();
  }
  if(panggung)panggung.addEventListener('click',onKetuk);

  /* ---------- nav 00Kubi: garis muter + huruf per label ---------- */
  var navs=document.querySelectorAll('#nav .nv');
  Array.prototype.forEach.call(navs,function(nv){
    if(!nv.querySelector('.outline')){var o=document.createElement('span');o.className='outline';nv.insertBefore(o,nv.firstChild);}
    var lb=nv.querySelector('.lb');
    if(lb&&!lb.querySelector('span')){var t=lb.textContent;lb.textContent='';for(var i=0;i<t.length;i++){var sp=document.createElement('span');sp.textContent=t[i];sp.style.setProperty('--i',i);lb.appendChild(sp);}}
  });

  /* ---------- BB8 toggle gelap/terang (nyetir #btn-tema) ---------- */
  var bilah=document.getElementById('bilah'), bt=document.getElementById('btn-tema');
  if(bilah&&bt&&!document.querySelector('#bilah .bb8-toggle')){
    bt.style.display='none';
    var lab=document.createElement('label');lab.className='bb8-toggle';lab.title='Gelap / terang';
    lab.innerHTML='<input class="bb8-toggle__checkbox" type="checkbox"><div class="bb8-toggle__container"><div class="bb8-toggle__scenery"><div class="bb8-toggle__star"></div><div class="bb8-toggle__star"></div><div class="bb8-toggle__star"></div><div class="bb8-toggle__star"></div><div class="bb8-toggle__star"></div><div class="bb8-toggle__star"></div><div class="bb8-toggle__star"></div><div class="tatto-1"></div><div class="tatto-2"></div><div class="gomrassen"></div><div class="hermes"></div><div class="chenini"></div><div class="bb8-toggle__cloud"></div><div class="bb8-toggle__cloud"></div><div class="bb8-toggle__cloud"></div></div><div class="bb8"><div class="bb8__head-container"><div class="bb8__antenna"></div><div class="bb8__antenna"></div><div class="bb8__head"></div></div><div class="bb8__body"></div></div><div class="artificial__hidden"><div class="bb8__shadow"></div></div></div>';
    bilah.appendChild(lab);
    var cb=lab.querySelector('input');
    cb.checked=!document.body.classList.contains('terang');   // checked = gelap (malam)
    cb.addEventListener('change',function(){ bt.click(); });
  }
})();
