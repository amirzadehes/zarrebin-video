// usage: node engine/render-v2.js <episode> <v|h> <startSec> <endSec> <out.mp4> [scale]
// scale: output resolution factor (1 = 1080p; 1.3333333333333333 = 2560x1440 for the horizontal video). Everything is still drawn in the 1920x1080 / 1080x1920 layout space.
// Uses Chrome from CHROME_PATH (GitHub runners ship it) or Playwright's bundled Chromium.
// Exit codes: 2 page error, 3 a picture that exists in the repo could not be loaded (transient: run again), 4 the finished chunk has the wrong number of frames (run again).
const {chromium}=require('playwright');const {spawn,spawnSync}=require('child_process');
const http=require('http'),fs=require('fs'),path=require('path');
const [ep,fmt,a,b,outf]=[process.argv[2],process.argv[3],+process.argv[4],+process.argv[5],process.argv[6]];
const SCALE=Math.max(1,Math.min(2,+(process.argv[7]||1)||1));
const ROOT=path.resolve(__dirname,'..');
const MIME={'.html':'text/html','.js':'text/javascript','.png':'image/png','.webp':'image/webp','.ttf':'font/ttf','.json':'application/json'};
const srv=http.createServer((q,r)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end()}
 r.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});fs.createReadStream(f).pipe(r)});
(async()=>{await new Promise(r=>srv.listen(0,'127.0.0.1',r));const port=srv.address().port;const FPS=30;
 const opt={args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']};if(process.env.CHROME_PATH)opt.executablePath=process.env.CHROME_PATH;
 const br=await chromium.launch(opt);const v=fmt==='h'?{width:1920,height:1080}:{width:1080,height:1920};const p=await br.newPage({viewport:v});
 p.on('pageerror',e=>{console.error('PAGE ERROR',e.message);process.exit(2)});
 const lay=+(process.argv[8]||0)||(SCALE>1?2000:1600);   // 3D layer size: sharper pictures for the bigger output
 await p.goto(`http://127.0.0.1:${port}/engine/v2.html?ep=${ep}&fmt=${fmt}&scale=${SCALE}&lay=${lay}`);await p.evaluate(()=>window.ready);
 const miss=await p.evaluate(()=>window.MISSING||[]);   // pictures that did not load after several tries
 const real=miss.filter(s=>fs.existsSync(path.join(ROOT,s)));
 miss.filter(s=>!real.includes(s)).forEach(s=>console.warn('WARNING picture not in the repo (scene is drawn without it):',s));
 if(real.length){console.error('ERROR pictures that exist in the repo could not be loaded:',real.join(', '));process.exit(3)}
 // intermediate chunk: PNG frames (no JPEG loss) into a near-lossless x264 file; the final, smaller encode happens once when the chunks are joined
 const ff=spawn('ffmpeg',['-loglevel','error','-y','-f','image2pipe','-framerate',String(FPS),'-c:v','png','-i','-','-c:v','libx264','-preset','veryfast','-crf','12','-pix_fmt','yuv420p','-r',String(FPS),outf],{stdio:['pipe','inherit','inherit']});
 ff.stdin.on('error',()=>{});
 const f0=Math.round(a*FPS),f1=Math.round(b*FPS),T=Date.now();
 for(let f=f0;f<f1;f++){const url=await p.evaluate(t=>{frame(t);return document.getElementById('out').toDataURL('image/png')},f/FPS);
  const buf=Buffer.from(url.split(',')[1],'base64');if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));
  if((f-f0)%150===0)console.log(outf,f-f0,'/',f1-f0,((Date.now()-T)/1000).toFixed(0)+'s')}
 ff.stdin.end();await new Promise(r=>ff.on('close',r));await br.close();srv.close();
 const pr=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-count_frames','-show_entries','stream=nb_read_frames,width,height','-of','csv=p=0',outf],{encoding:'utf8'});
 const [w,h,n]=(pr.stdout||'').trim().split(',').map(Number);
 if(n!==f1-f0){console.error('ERROR chunk has',n,'frames, expected',f1-f0);process.exit(4)}
 console.log('done',outf,w+'x'+h,n,'frames',((Date.now()-T)/1000).toFixed(0)+'s')})();
