from pathlib import Path
import json,subprocess,re,numpy as np,onnxruntime as ort
out=Path(__file__).resolve().parent;root=out.parent/'.local'/'alignment-model'
vocab=json.loads((root/'vocab.json').read_text());opt=ort.SessionOptions();opt.intra_op_num_threads=4;opt.inter_op_num_threads=1
session=ort.InferenceSession(str(root/'model.onnx'),sess_options=opt,providers=['CPUExecutionProvider'])
print('Model inputs',[(x.name,x.type) for x in session.get_inputs()],flush=True)
blank=vocab['<pad>'];data=json.loads((out/'timed-scenes.json').read_text(encoding='utf-8'))
for scene in data:
 dst=out/f"words-{scene['id']:02d}.json"
 if dst.exists():continue
 r=subprocess.run(['ffmpeg','-v','error','-i',str(out/'composition'/scene['voiceFile']),'-f','f32le','-ac','1','-ar','16000','-'],capture_output=True,check=True)
 audio=np.frombuffer(r.stdout,dtype=np.float32);duration=len(audio)/16000;audio=(audio-audio.mean())/np.sqrt(audio.var()+1e-7)
 inputs={}
 for inp in session.get_inputs():
  inputs[inp.name]=np.ones((1,len(audio)),dtype=np.int64) if 'mask' in inp.name else audio[None,:]
 logits=session.run(None,inputs)[0][0];logits=logits-logits.max(axis=-1,keepdims=True);em=logits-np.log(np.exp(logits).sum(axis=-1,keepdims=True))
 words=re.findall(r"[A-Za-z]+(?:'[A-Za-z]+)?",scene['voice']);text='|'.join(w.upper() for w in words)
 tokens=[vocab[c] for c in text];states=np.full(2*len(tokens)+1,blank,dtype=np.int64);states[1::2]=tokens;S=len(states);T=len(em)
 skip=np.zeros(S,dtype=bool);skip[2:]=(states[2:]!=blank)&(states[2:]!=states[:-2])
 dp=np.full(S,-1e30,dtype=np.float32);dp[0]=0;back=np.zeros((T,S),dtype=np.uint8)
 for t in range(T):
  one=np.r_[-1e30,dp[:-1]];two=np.r_[-1e30,-1e30,dp[:-2]];two[~skip]=-1e30
  choices=np.stack([dp,one,two]);arg=choices.argmax(axis=0);dp=choices[arg,np.arange(S)]+em[t,states];back[t]=arg
 state=S-1 if dp[-1]>=dp[-2] else S-2;charframes=[[] for _ in tokens]
 for t in range(T-1,-1,-1):
  if state%2:charframes[state//2].append(t)
  state-=int(back[t,state])
 ratio=duration/T;result=[];char=0
 for w in words:
  frames=[f for j in range(char,char+len(w)) for f in charframes[j]]
  if not frames:raise RuntimeError('Unaligned word '+w)
  start=min(frames)*ratio;end=(max(frames)+1)*ratio
  # Acoustic confidence is recorded for review, not used to invent word times.
  scores=[float(np.exp(em[f,tokens[j]])) for j in range(char,char+len(w)) for f in charframes[j]]
  result.append({'word':w,'start':round(start,3),'end':round(end,3),'confidence':round(float(np.mean(scores)),3)})
  char+=len(w)+1
 dst.write_text(json.dumps(result,indent=2),encoding='utf-8')
 print(f"CTC aligned chapter {scene['id']+1}/12: {len(words)} words, duration {duration:.2f}s",flush=True)
