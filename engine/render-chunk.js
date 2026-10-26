// usage: node engine/render-chunk.js <episode> <startSec> <endSec> <out.mp4> <totalDur> [totalForProgress]
const {chromium}=require('playwright');const {spawn}=require('child_process');
const http=require('http'),fs=require('fs'),path=require('path');
const [ep,a,b,outf,dur,total]=[process.argv[2],+process.argv[3],+process.argv[4],process.argv[5],process.argv[6],process.argv[7]||'66.5'];
const ROOT=path.resolve(__dirname,'..');
const MIME={'.html':'text/html','.js':'text/javascript','.png':'image/png','.ttf':'font/ttf','.json':'application/json'};
const srv=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end()}
 r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r)});
(async()=>{await new Promise(r=>srv.listen(0,'127.0.0.1',r));const port=srv.address().port;const FPS=30;
 const br=await chromium.launch();const p=await br.newPage({viewport:{width:1080,height:1920}});
 p.on('pageerror',e=>{console.error('PAGE ERROR',e.message);process.exit(2)});
 await p.goto(`http://127.0.0.1:${port}/engine/index.html?ep=${ep}&dur=${dur}&total=${total}`);await p.evaluate(()=>window.ready);
 const ff=spawn('ffmpeg',['-loglevel','error','-y','-f','image2pipe','-framerate',String(FPS),'-c:v','mjpeg','-i','-','-c:v','libx264','-preset','veryfast','-crf','16','-pix_fmt','yuv420p','-r',String(FPS),outf],{stdio:['pipe','inherit','inherit']});
 const f0=Math.round(a*FPS),f1=Math.round(b*FPS),T=Date.now();
 for(let f=f0;f<f1;f++){const url=await p.evaluate(t=>{frame(t);return document.getElementById('out').toDataURL('image/jpeg',.95)},f/FPS);
  const buf=Buffer.from(url.split(',')[1],'base64');if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));
  if((f-f0)%60===0)console.log(outf,f-f0,'/',f1-f0,((Date.now()-T)/1000).toFixed(0)+'s')}
 ff.stdin.end();await new Promise(r=>ff.on('close',r));await br.close();srv.close();console.log('done',outf,((Date.now()-T)/1000).toFixed(0)+'s')})();
