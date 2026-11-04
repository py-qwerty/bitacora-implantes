import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shuffle,signature,generateExam,gradeExam,remaining,formatTime,practiceBlocks,topicQuestions,validPractice,isValidSession,swipeDirection,validateBank,validateTema,DURATION} from '../dist/core.js';
export function fixture(){
 const courses=[{id:'sistemas',title:'Sistemas',shortTitle:'Sistemas'},{id:'redes',title:'Redes',shortTitle:'Redes'}];
 const topics=[{id:11,course:'sistemas',number:1,title:'Windows Server'},{id:12,course:'sistemas',number:2,title:'Linux'},{id:21,course:'redes',number:1,title:'Redes'}];
 const questions=topics.flatMap(t=>Array.from({length:30},(_,i)=>({id:`${t.course}-${t.number}-${i}`,course:t.course,topic:t.id,test:'Tema '+t.number,order:i+1,text:`Caso ${t.id}/${i}: ¿qué acción es correcta?`,options:['a','b','c','d'].map(key=>({key,text:'Opción '+key})),correct:'abcd'[i%4],explanation:'Explicación del concepto y su aplicación.',difficulty:'media',source:{kind:'practice',title:t.title,page:5}})));
 return {version:'test',courses,topics,questions};
}
const bank=fixture(), map=new Map(bank.questions.map(q=>[q.id,q]));
const session=()=>({id:'sample',ids:bank.questions.slice(0,30).map(q=>q.id),index:0,answers:{},flags:[],startedAt:10,deadline:10+DURATION});
test('shuffle produces a new permutation without mutating the bank',()=>{const a=[1,2,3,4];const b=shuffle(a,()=>0);assert.deepEqual(a,[1,2,3,4]);assert.deepEqual([...b].sort(),a);assert.notDeepEqual(a,b);});
test('bank validation accepts non-sequential global topic IDs and 30 per topic',()=>assert.equal(validateBank(bank),true));
test('bank validation rejects empty feedback, bad answer and incomplete topics',()=>{
 for(const mutate of [d=>d.questions[0].explanation='',d=>d.questions[0].correct='z',d=>d.questions.pop(),d=>d.questions[0].source.kind='official',d=>d.questions[0].options.reverse()]){const d=structuredClone(bank);mutate(d);assert.throws(()=>validateBank(d));}
});
test('three practice blocks cover all 30 without repeating or reordering options',()=>{const blocks=practiceBlocks(bank.questions,11);assert.equal(blocks.length,3);assert.ok(blocks.every(b=>b.length===10));assert.equal(new Set(blocks.flat().map(q=>q.id)).size,30);assert.equal(blocks[1][0].order,11);assert.deepEqual(blocks[0][0].options.map(o=>o.key),['a','b','c','d']);});
test('complete30 uses the same source-ordered questions as the blocks',()=>assert.deepEqual(topicQuestions(bank.questions,11),practiceBlocks(bank.questions,11).flat()));
test('simulation filters subject, samples 30 unique signatures, leaves source order intact',()=>{for(let i=0;i<100;i++){const qs=generateExam(bank.questions,'sistemas');assert.equal(qs.length,30);assert.ok(qs.every(q=>q.course==='sistemas'));assert.equal(new Set(qs.map(signature)).size,30);assert.ok(qs.every(q=>q.options.map(o=>o.key).join('')==='abcd'));}});
test('simulation handles duplicate source questions and insufficient unique pool',()=>{const pool=bank.questions.slice(0,30);assert.equal(generateExam([...pool,pool[0]],'sistemas').length,30);assert.throws(()=>generateExam([...pool.slice(0,29),pool[0]],'sistemas'));assert.throws(()=>generateExam(bank.questions,'missing'));});
test('grading separates wrong and blank and groups actual global topic IDs',()=>{const qs=[bank.questions[0],bank.questions[1],bank.questions[30]];const r=gradeExam(qs,{[qs[0].id]:qs[0].correct,[qs[1].id]:'a'});assert.equal(r.correct,1);assert.equal(r.wrong,1);assert.equal(r.blank,1);assert.equal(r.errors,2);assert.equal(r.total,3);assert.deepEqual(r.byTopic.map(t=>t.topic),[11,12]);assert.equal(Object.hasOwn(r,'passed'),false);});
test('practice validation supports 10 and30 and rejects malformed/stale stored progress',()=>{for(const len of [10,30]){const ids=bank.questions.slice(0,len).map(q=>q.id);const p={ids,index:len-1,answers:{[ids[0]]:'a'},checked:[ids[0]],finishedAt:null};assert.equal(validPractice(p,ids,map),true);for(const change of [{index:len},{answers:{foreign:'a'}},{checked:['foreign']},{answers:[]},{ids:ids.slice(1)}])assert.equal(validPractice({...p,...change},ids,map),false);}});
test('simulation validation rejects corrupt IDs, answer keys, flags and deadline',()=>{const s=session();assert.equal(isValidSession(s,map),true);for(const change of [{ids:[...s.ids.slice(1),s.ids[1]]},{answers:{[s.ids[0]]:'z'}},{flags:['foreign']},{index:30},{deadline:NaN},{startedAt:Infinity},{answers:[]},{deadline:Number.MAX_VALUE},{finishedAt:9}])assert.equal(isValidSession({...s,...change},map),false);});
test('deadline and time formatting do not allow negative remaining time',()=>{assert.equal(remaining(10,20),0);assert.equal(remaining(2000,1000),1000);assert.equal(formatTime(1),'00:01');assert.equal(formatTime(-1),'00:00');assert.equal(formatTime(DURATION),'45:00');});
test('inherited swipe respects horizontal threshold and vertical scroll',()=>{assert.equal(swipeDirection(-44,3),1);assert.equal(swipeDirection(44,3),-1);assert.equal(swipeDirection(43,0),0);assert.equal(swipeDirection(50,80),0);});
test('production bank has complete coverage and explanations',t=>{let d;try{d=JSON.parse(readFileSync(new URL('../dist/bank.json',import.meta.url),'utf8'));}catch(e){if(e.code==='ENOENT'){t.skip('Content bank is being assembled separately');return;}throw e;}assert.equal(validateBank(d),true);assert.ok(d.courses.length>=1);assert.ok(d.topics.length>=1);assert.equal(d.questions.length%30,0);});

function tema(){return {course:'sistemas',number:1,title:'Windows Server',intro:{why:'Porque sí.'},sections:[{id:'uno',title:'Uno',pages:[3],blocks:[{type:'p',text:'Texto'},{type:'table',head:['A','B'],rows:[['1','2']]}]}],questions:Object.fromEntries(bank.questions.filter(q=>q.topic===11).map(q=>[q.id,{section:'uno',reasoning:'Porque.',options:{a:'1',b:'2',c:'3',d:'4'}}]))};}
test('digital topic validation requires the topic questions argued per option',()=>{
 assert.equal(validateTema(tema(),bank).id,11);
 for(const mutate of [t=>t.number=9,t=>delete t.questions[Object.keys(t.questions)[0]],t=>t.questions.extra={},t=>Object.values(t.questions)[0].section='nada',t=>delete Object.values(t.questions)[0].options.d,t=>t.sections[0].blocks[0].type='video',t=>t.sections[0].blocks[0].text='  ',t=>t.sections[0].blocks[1].rows=[['1']],t=>t.sections.push({...t.sections[0]}),t=>t.sections[0].id='Mal Id',t=>Object.values(t.questions)[0].doubt='']){const t=tema();mutate(t);assert.throws(()=>validateTema(t,bank));}
});
