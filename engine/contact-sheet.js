// usage: node engine/contact-sheet.js <episode> <v|h> <out.jpg> [stepSec]
// One picture of the whole episode: a frame every stepSec seconds (auto: about 90 frames) with the time, the scene number and the template written on it.
// A coloured bar at the top of a frame marks the first frame of a new scene. Used to judge rhythm, repetition and empty stretches at a glance.
// Uses Chrome from CHROME_PATH (GitHub runners ship it) or Playwright's bundled Chromium. Reads episodes/<ep>/scenes.json only (no voice needed).
const {chromium}=require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const [ep,fmt,outf,stepArg]=[process.argv[2],process.argv[3]==='h'?'h':'v',process.argv[4]||'contact.jpg',+process.argv[5]||0];
const ROOT=path.resolve(__dirname,'..');
const MIME={'.html':'text/html','.js':'text/javascript','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf','.json':'application/json'};
const srv=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end()}
 r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r)});
(async()=>{await new Promise(r=>srv.listen(0,'127.0.0.1',r));const port=srv.address().port;
 const opt={};if(process.env.CHROME_PATH)opt.executablePath=process.env.CHROME_PATH;
 const br=await chromium.launch(opt);const v=fmt==='h'?{width:1920,height:1080}:{width:1080,height:1920};const p=await br.newPage({viewport:v});
 p.on('pageerror',e=>{console.error('PAGE ERROR',e.message);process.exit(2)});
 await p.goto(`http://127.0.0.1:${port}/engine/v2.html?ep=${ep}&fmt=${fmt}&mb=0`);await p.evaluate(()=>window.ready);
 const url=await p.evaluate(step=>{
  const total=D.meta.total, st=step||Math.max(1,Math.ceil(total/90)), n=Math.floor(total/st), V0=FMT==='v', tw=V0?180:320, th=V0?320:180, cols=V0?10:6, rows=Math.ceil(n/cols);
  const sh=document.createElement('canvas');sh.width=cols*tw;sh.height=rows*th;const g=sh.getContext('2d');g.fillStyle='#111';g.fillRect(0,0,sh.width,sh.height);
  let prev=-1;
  for(let i=0;i<n;i++){const t=Math.min(i*st+.5,total-.05);frame(t);const x=(i%cols)*tw,y=Math.floor(i/cols)*th,k=sceneIndex(t);
   g.drawImage(out,x,y,tw,th);
   if(k!==prev){g.fillStyle='#ff3b4a';g.fillRect(x,y,tw,5);prev=k}
   g.strokeStyle='rgba(0,0,0,.55)';g.lineWidth=1;g.strokeRect(x+.5,y+.5,tw-1,th-1);
   const lab=Math.floor(t/60)+':'+String(Math.floor(t%60)).padStart(2,'0')+'  #'+k+' '+D.scenes[k].tpl;
   g.font='700 13px sans-serif';g.textBaseline='bottom';g.textAlign='left';const w=g.measureText(lab).width+8;g.fillStyle='rgba(0,0,0,.65)';g.fillRect(x+3,y+th-20,w,17);g.fillStyle='#fff';g.fillText(lab,x+7,y+th-6)}
  return {url:sh.toDataURL('image/jpeg',.82),n,st,total}},stepArg);
 fs.mkdirSync(path.dirname(path.resolve(outf)),{recursive:true});fs.writeFileSync(outf,Buffer.from(url.url.split(',')[1],'base64'));
 console.log('contact sheet',outf,url.n,'frames, every',url.st,'s,',url.total,'s total');await br.close();srv.close()})();
