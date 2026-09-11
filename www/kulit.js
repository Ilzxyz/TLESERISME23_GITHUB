/* ============================================================
   KULIT.JS — opening (logo dirakit) + partikel bg3d.
   Berdiri sendiri. Tidak memanggil / mengubah app.js atau db.js.
   ============================================================ */
(function(){
  'use strict';
  document.body.classList.add('k-opening');   // sembunyikan app selama opening

  /* ---------- partikel background ---------- */
  var cv=document.getElementById('k-partikel');
  if(cv){
    var g=cv.getContext('2d'),P=[];
    function accRGB(){
      var h=(getComputedStyle(document.documentElement).getPropertyValue('--h').trim())||'150';
      g.fillStyle='hsl('+h+' 72% 46%)'; var hex=g.fillStyle; // browser resolve -> #rrggbb / rgb()
      if(hex[0]==='#'){var n=parseInt(hex.slice(1),16);return (n>>16&255)+','+(n>>8&255)+','+(n&255);}
      var m=hex.match(/\d+/g); return m?m.slice(0,3).join(','):'24,184,119';
    }
    function nP(){return{x:Math.random()*cv.width,y:Math.random()*cv.height,r:Math.random()*1.6+.3,s:Math.random()*.4+.08,o:Math.random()*.5+.12,tw:Math.random()*6.28,a:Math.random()<.5};}
    function ukur(){cv.width=innerWidth;cv.height=innerHeight;P=[];var n=Math.min(90,innerWidth/14|0);for(var i=0;i<n;i++)P.push(nP());}
    function draw(){g.clearRect(0,0,cv.width,cv.height);var rgb=accRGB();
      for(var i=0;i<P.length;i++){var p=P[i];p.y-=p.s;if(p.y<-6){p.y=cv.height+6;p.x=Math.random()*cv.width;}p.tw+=.02;
        var a=p.o*(.6+.4*Math.sin(p.tw));var col=p.a?rgb:'200,220,230';
        g.beginPath();g.arc(p.x,p.y,p.r,0,6.28);g.fillStyle='rgba('+col+','+a+')';g.shadowBlur=7;g.shadowColor='rgba('+col+','+a+')';g.fill();}
      requestAnimationFrame(draw);}
    ukur();draw();addEventListener('resize',ukur);
  }

  /* ---------- perakitan emblem ---------- */
  var wrap=document.getElementById('emblem-wrap');
  var cont=document.getElementById('shards');
  if(wrap&&cont){
    var COLS=4,ROWS=5;
    for(var r=0;r<ROWS;r++)for(var c=0;c<COLS;c++){
      var s=document.createElement('div');s.className='shard';
      var t=r*100/ROWS,b=(ROWS-1-r)*100/ROWS,l=c*100/COLS,ri=(COLS-1-c)*100/COLS;
      s.style.clipPath='inset('+t+'% '+ri+'% '+b+'% '+l+'%)';
      var dx=(Math.random()*2-1)*innerWidth*.6, dy=(Math.random()*2-1)*innerHeight*.6, rot=(Math.random()*2-1)*180;
      s.style.transform='translate('+dx+'px,'+dy+'px) rotate('+rot+'deg) scale(.35)';
      s.style.transitionDelay=(Math.random()*.8)+'s';
      cont.appendChild(s);
    }
    requestAnimationFrame(function(){requestAnimationFrame(function(){
      var sh=cont.querySelectorAll('.shard');
      for(var i=0;i<sh.length;i++){sh[i].style.transform='translate(0,0) rotate(0) scale(1)';sh[i].style.opacity='1';}
    });});
    setTimeout(function(){wrap.classList.add('rakit');},2600);
    setTimeout(function(){wrap.style.animation='kApung 7s ease-in-out infinite';},3200);
  }

  /* ---------- dismiss: ketuk emblem -> masuk app ---------- */
  var panggung=document.getElementById('panggung');
  var loader=document.getElementById('kloader');
  var sudah=false;
  function masuk(){
    if(sudah||!panggung)return; sudah=true;
    if(wrap)wrap.style.animation='none';
    panggung.classList.add('keluar');
    if(loader)setTimeout(function(){loader.classList.add('on');},900);
    setTimeout(function(){panggung.classList.add('pergi');},1300);
    setTimeout(function(){if(loader)loader.classList.remove('on');if(panggung)panggung.style.display='none';document.body.classList.remove('k-opening');},2200);
  }
  if(wrap)wrap.addEventListener('click',masuk);
  var gk=document.getElementById('g-ketuk');
  if(gk)gk.addEventListener('click',masuk);

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
/* apung keyframe (dipakai via JS) */
(function(){var st=document.createElement('style');st.textContent='@keyframes kApung{0%,100%{transform:translate(-50%,-50%) translateY(0)}50%{transform:translate(-50%,-50%) translateY(-12px)}}';document.head.appendChild(st);})();
