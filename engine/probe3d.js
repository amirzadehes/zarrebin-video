// usage: node engine/probe3d.js <episode> <v|h> [out.json]
// Is the 3D (depth) effect really visible in each scene? For every scene with a picture and a depth level above 0 it draws the scene at two moments
// twice (3D as set / 3D switched off for that picture) and counts how many pixels differ. Also reports pictures whose depth map is missing.
// verdict: ok | off (depth level 0, set by the owner) | NO-DEPTH-MAP (the map is not there: flat picture) | NO-3D (maps there but nothing moves) | short (scene too short to judge)
// exit code 1 when a scene that should have 3D shows none (so a workflow can warn); the engine itself is the one tested, so a broken engine is caught as well.
const {chromium}=require('playwright');const http=require('http'),fs=require('fs'),path=require('path');
const [ep,fmt,outf]=[process.argv[2],process.argv[3]||'v',process.argv[4]];
const ROOT=path.resolve(__dirname,'..');
const MIME={'.html':'text/html','.js':'text/javascript','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.ttf':'font/ttf','.json':'application/json'};
const srv=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end()}
 r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r)});
(async()=>{await new Promise(r=>srv.listen(0,'127.0.0.1',r));const port=srv.address().port;
 const opt={args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']};if(process.env.CHROME_PATH)opt.executablePath=process.env.CHROME_PATH;
 const br=await chromium.launch(opt);const v=fmt==='h'?{width:1920,height:1080}:{width:1080,height:1920};const p=await br.newPage({viewport:v});
 p.on('pageerror',e=>{console.error('PAGE ERROR',e.message);process.exit(2)});
 await p.goto(`http://127.0.0.1:${port}/engine/v2.html?ep=${ep}&fmt=${fmt}&scale=1&lay=1600`);await p.evaluate(()=>window.ready);
 const res=await p.evaluate(()=>{
  const cv=document.getElementById('out'), sm=document.createElement('canvas'); sm.width=Math.round(cv.width/4); sm.height=Math.round(cv.height/4); const g=sm.getContext('2d',{willReadFrequently:true});
  const grab=t=>{ frame(t); g.drawImage(cv,0,0,sm.width,sm.height); return g.getImageData(0,0,sm.width,sm.height).data };
  const out=[];
  D.scenes.forEach((s,i)=>{ const ph=s.photo; if(!ph||!ph.src) return; const L=s.t1-s.t0, lvl=ph.depth!=null?ph.depth:(D.meta.depth!=null?D.meta.depth:2), row={n:i+1,src:ph.src,depth:lvl,dur:+L.toFixed(1)};
   if(!lvl){ row.verdict='off'; out.push(row); return }
   let best=0; const times=[s.t0+.35*L, s.t0+.85*L];
   for(const t of times){ const A=grab(t); const keep=ph.depth; ph.depth=0; const B=grab(t); if(keep===undefined) delete ph.depth; else ph.depth=keep;
    let n=0,tot=0; for(let y=Math.round(sm.height*.12);y<sm.height*.75;y++) for(let x=0;x<sm.width;x++){ const k=(y*sm.width+x)*4, a=.3*A[k]+.59*A[k+1]+.11*A[k+2], b=.3*B[k]+.59*B[k+1]+.11*B[k+2]; tot++; if(Math.abs(a-b)>10) n++ }
    best=Math.max(best,n/tot) }
   row.built=Object.keys(DEP).some(k=>k.split('|')[0]===ph.src&&DEP[k]); row.share=+(best*100).toFixed(2);
   row.verdict=!row.built?'NO-DEPTH-MAP':best>=.01?'ok':L<2.5?'short':'NO-3D'; out.push(row) });
  return out});
 await br.close();srv.close();
 const bad=res.filter(r=>r.verdict==='NO-DEPTH-MAP'||r.verdict==='NO-3D');
 const rep={episode:ep,fmt,ts:Date.now(),scenes:res,bad:bad.map(r=>r.n)};
 if(outf) fs.writeFileSync(outf,JSON.stringify(rep,null,1));
 res.forEach(r=>console.log(String(r.n).padStart(3),r.verdict.padEnd(13),'depth',r.depth,r.share!=null?('changed px '+r.share+'%'):'',r.src.split('/').pop()));
 console.log(bad.length?'PROBLEM scenes: '+bad.map(r=>r.n+' ('+r.verdict+')').join(', '):'3D OK in all scenes that have it');
 process.exit(bad.length?1:0)})();
