from pathlib import Path
import concurrent.futures,subprocess,os,json,wave
root=Path.cwd();out=root/'brag-output-2026-11-13-222318';a=out/'composition/assets'
node=str(root/'.local/tools/node/node-v22.23.4-win-x64/node.exe')
cli=str(Path(os.environ['LOCALAPPDATA'])/'npm-cache/_npx/702923228c2ce1e6/node_modules/hyperframes/bin/hyperframes.mjs')
env=os.environ.copy();env['HYPERFRAMES_PYTHON']=str(root/'.local/kokoro-venv/Scripts/python.exe');env['OMP_NUM_THREADS']='2'
def make(i):
 p=a/f'voice-{i:02d}.wav'
 if not p.exists():
  r=subprocess.run([node,cli,'tts',str(a/f'voice-{i:02d}.txt'),'--voice','af_heart','--speed','1.02','-o',str(p)],env=env,text=True,capture_output=True)
  if r.returncode: raise RuntimeError(f'Voice {i} failed: '+r.stdout[-1000:]+r.stderr[-1000:])
 print(f'Kokoro chapter {i+1}/12 ready',flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(make,range(1,12)))
data=json.loads((out/'scenes.json').read_text());start=0
for s in data:
 with wave.open(str(a/f"voice-{s['id']:02d}.wav")) as w:duration=w.getnframes()/w.getframerate()
 s.update(start=round(start,3),voiceDuration=round(duration,3),duration=round(duration+1.4,3));start+=duration+1.4
(out/'timed-scenes.json').write_text(json.dumps(data,indent=2),encoding='utf-8')
(out/'duration.txt').write_text(str(round(start,3)))
print('TOTAL FILM SECONDS',round(start,3),flush=True)
