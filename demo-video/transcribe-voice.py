from faster_whisper import WhisperModel
from pathlib import Path
import json,difflib,re
out=Path(__file__).resolve().parent;data=json.loads((out/'timed-scenes.json').read_text(encoding='utf-8'))
model=WhisperModel('base.en',device='cpu',compute_type='int8',cpu_threads=4,num_workers=1,download_root=str(out.parent/'.local'/'whisper-models'))
for s in data:
 target=out/f"words-{s['id']:02d}.json"
 if target.exists():continue
 segs,info=model.transcribe(str(out/'composition'/s['voiceFile']),language='en',beam_size=3,word_timestamps=True,condition_on_previous_text=False,vad_filter=False,initial_prompt='Fundicate. Syndicate. NEAR testnet. Elo. Glicko two. First Past the Post. Ranked Choice. Single Transferable Vote.')
 words=[]
 for seg in segs:
  for w in seg.words:words.append({'word':w.word,'start':round(w.start,3),'end':round(w.end,3),'probability':round(w.probability,3)})
 target.write_text(json.dumps(words,indent=2),encoding='utf-8')
 print(f"Aligned audio chapter {s['id']+1}/12, {len(words)} recognized words",flush=True)
