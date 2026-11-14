from pathlib import Path
import json,re
out=Path(__file__).resolve().parent;scenes=json.loads((out/'timed-scenes.json').read_text(encoding='utf-8'));plan=json.loads((out/'focus-plan.json').read_text(encoding='utf-8'));plan=plan.get('scenes',[]) if isinstance(plan,dict) else plan
norm=lambda s:re.findall(r"[a-z]+(?:'[a-z]+)?",s.lower())
result=[];audit=[]
for p in plan:
 s=scenes[p['id']];words=json.loads((out/f"words-{s['id']:02d}.json").read_text(encoding='utf-8'));tokens=[w['word'].lower() for w in words]
 def locate(phrase):
  target=norm(phrase);matches=[i for i in range(len(tokens)-len(target)+1) if tokens[i:i+len(target)]==target]
  if len(matches)!=1:raise RuntimeError(f"Scene {s['id']}: anchor must be unique: {phrase!r}, matches={matches}")
  a=matches[0];b=a+len(target)-1
  confidence=sum(w['confidence'] for w in words[a:b+1])/len(target)
  return {'localStart':words[a]['start'],'localEnd':words[b]['end'],'confidence':round(confidence,3)}
 switch=locate(p['switchPhrase']);switchAt=s['start']+.25+switch['localStart']-.18
 cues=[]
 for q in p['cues']:
  match=locate(q['phrase']);time=s['start']+.25+match['localStart']-.1;end=s['start']+.25+match['localEnd']+.45
  cues.append({**q,'time':round(max(s['start'],time),3),'end':round(max(time+q.get('hold',1.8),end),3),'confidence':match['confidence'],'wordEnd':round(s['start']+.25+match['localEnd'],3)})
 cues.sort(key=lambda x:x['time'])
 for i,c in enumerate(cues):
  if i+1<len(cues) and cues[i+1]['time']>c['time']+.2:c['end']=round(min(c['end'],cues[i+1]['time']+.12),3)
  c['end']=min(c['end'],s['start']+s['duration']-.15)
 result.append({'id':s['id'],'switchAt':round(switchAt,3),'switchPhrase':p['switchPhrase'],'cues':cues})
 audit.append({'scene':s['id'],'chapter':s['chapter'],'switchPhrase':p['switchPhrase'],'oldSwitch':round(s['start']+s['duration']*.49,3),'measuredSwitch':round(switchAt,3),'differenceSeconds':round(switchAt-(s['start']+s['duration']*.49),3),'cueCount':len(cues),'minAcousticConfidence':min(c['confidence'] for c in cues)})
(out/'timed-focus.json').write_text(json.dumps(result,indent=2),encoding='utf-8');(out/'alignment-audit.json').write_text(json.dumps(audit,indent=2),encoding='utf-8')
print(json.dumps(audit,indent=2));print('Total measured focus cues',sum(len(s['cues']) for s in result))
