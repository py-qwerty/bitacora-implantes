// Adapted from Bitácora PER (via Bitácora Ciber). shuffle, signature, time helpers and swipeDirection
// retain the original engine; exam quotas are replaced by a configurable study pool.
export const DURATION = 45 * 60 * 1000;
export const EXAM_SIZE = 30;
export function shuffle(items, random = Math.random) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export const signature = q => JSON.stringify([q.text.trim().toLowerCase(), q.options.map(o => o.text.trim()), q.correct, q.image]);
export function generateExam(questions, course = '', random = Math.random) {
  const pool=questions.filter(q=>!course||q.course===course);
  const unique=[...new Map(pool.map(q=>[signature(q),q])).values()];
  if(unique.length<EXAM_SIZE)throw Error('No hay suficientes preguntas distintas para este simulacro.');
  return shuffle(unique,random).slice(0,EXAM_SIZE);
}
export function gradeExam(questions, answers) {
  const byTopic=[...new Set(questions.map(q=>q.topic))].map(topic=>({topic,total:0,correct:0,wrong:0,blank:0,errors:0}));
  const rows=new Map(byTopic.map(t=>[t.topic,t]));
  questions.forEach(q=>{
    const row=rows.get(q.topic);row.total++;
    if(answers[q.id]===q.correct)row.correct++;
    else {row.errors++;Object.hasOwn(answers,q.id)?row.wrong++:row.blank++;}
  });
  const correct=byTopic.reduce((n,t)=>n+t.correct,0);
  const blank=byTopic.reduce((n,t)=>n+t.blank,0);
  const errors=questions.length-correct;
  return {correct,blank,errors,wrong:errors-blank,total:questions.length,score:questions.length?10*correct/questions.length:0,byTopic};
}
export function remaining(deadline, now = Date.now()) { return Math.max(0, deadline - now); }
export function formatTime(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60).toString().padStart(2, '0')}:${(total % 60).toString().padStart(2, '0')}`;
}
const validTime = value => Number.isFinite(value) && Math.abs(value)<=8640000000000000;
function validAnswers(answers,ids,map){return answers&&typeof answers==='object'&&!Array.isArray(answers)&&Object.entries(answers).every(([id,a])=>ids.includes(id)&&map.get(id)?.options.some(o=>o.key===a));}
export function isValidSession(s,map) {
  return !!(s&&typeof s.id==='string'&&Array.isArray(s.ids)&&s.ids.length===EXAM_SIZE&&new Set(s.ids).size===EXAM_SIZE&&s.ids.every(id=>map.has(id))&&validTime(s.deadline)&&validTime(s.startedAt)&&s.deadline>=s.startedAt&&Array.isArray(s.flags)&&s.flags.every(id=>s.ids.includes(id))&&Number.isInteger(s.index)&&s.index>=0&&s.index<s.ids.length&&validAnswers(s.answers,s.ids,map)&&(!s.finishedAt||(validTime(s.finishedAt)&&s.finishedAt>=s.startedAt&&s.finishedAt<=s.deadline)));
}
export function topicQuestions(questions,topic){return questions.filter(q=>q.topic===topic).sort((a,b)=>a.test.localeCompare(b.test,'es',{numeric:true})||a.order-b.order||a.id.localeCompare(b.id));}
export function practiceBlocks(questions,topic){
  const list=topicQuestions(questions,topic);const blocks=[];
  for(let i=0;i<list.length;i+=10){const block=list.slice(i,i+10);if(block.length!==10)throw Error('El tema debe contener bloques completos de diez preguntas.');blocks.push(block);}
  return blocks;
}
export function validPractice(p,ids,map){
  return !!(p&&Array.isArray(p.ids)&&p.ids.join(',')===ids.join(',')&&Number.isInteger(p.index)&&p.index>=0&&p.index<ids.length&&validAnswers(p.answers,ids,map)&&Array.isArray(p.checked)&&p.checked.every(id=>ids.includes(id))&&(!p.finishedAt||Number.isFinite(p.finishedAt)));
}
export function swipeDirection(dx,dy) {return Math.abs(dx)>=44&&Math.abs(dx)>Math.abs(dy)*1.25?(dx<0?1:-1):0;}
export function validateBank(data){
  if(!data||!Array.isArray(data.courses)||!data.courses.length||!Array.isArray(data.topics)||!data.topics.length||!Array.isArray(data.questions))throw Error('Banco incompleto');
  const courses=new Set(data.courses.map(c=>c.id));const topics=new Map(data.topics.map(t=>[t.id,t]));const ids=new Set();
  if(courses.size!==data.courses.length||topics.size!==data.topics.length||data.topics.some(t=>!Number.isInteger(t.id)||!courses.has(t.course)||typeof t.title!=='string'))throw Error('Asignaturas o temas no válidos');
  for(const q of data.questions){
    if(!q||typeof q.id!=='string'||ids.has(q.id)||!topics.has(q.topic)||topics.get(q.topic).course!==q.course||typeof q.text!=='string'||!q.text.trim()||!Array.isArray(q.options)||q.options.length!==4||q.options.some((o,i)=>o?.key!=='abcd'[i]||typeof o.text!=='string'||!o.text.trim())||!q.options.some(o=>o.key===q.correct)||typeof q.explanation!=='string'||!q.explanation.trim()||!q.source||!['practice','clase'].includes(q.source.kind)||typeof q.source.title!=='string'||!q.source.title.trim()||typeof q.test!=='string'||!Number.isFinite(q.order))throw Error('Pregunta no válida');
    ids.add(q.id);
  }
  for(const t of data.topics){const n=data.questions.filter(q=>q.topic===t.id).length;if(n!==0&&n!==30)throw Error('Cada tema debe contener treinta preguntas o estar en preparación.');}
  return true;
}
export const TEMA_BLOCKS = ['p','analogy','term','list','steps','table','example','exam','key','code'];
// Text is always escaped when rendered, so code samples such as <script> are allowed.
const text = v => typeof v === 'string' && v.trim().length > 0;
const texts = v => Array.isArray(v) && v.length > 0 && v.every(text);
export function validateTema(tema, bank) {
  const fail = message => { throw Error(`Tema digital no válido: ${message}`); };
  if (!tema || typeof tema !== 'object') fail('vacío');
  const topic = bank.topics.find(t => t.course === tema.course && t.number === tema.number);
  if (!topic) fail(`${tema.course}/${tema.number} no existe en el banco`);
  if (!text(tema.title)) fail('falta el título');
  if (!tema.intro || !text(tema.intro.why) || (tema.intro.before && !texts(tema.intro.before)) || (tema.intro.goals && !texts(tema.intro.goals))) fail('introducción incompleta');
  if (!Array.isArray(tema.sections) || !tema.sections.length) fail('sin apartados');
  const sections = new Set();
  for (const s of tema.sections) {
    if (!s || typeof s.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s.id) || sections.has(s.id)) fail(`id de apartado ${s?.id}`);
    sections.add(s.id);
    if (!text(s.title) || !Array.isArray(s.blocks) || !s.blocks.length) fail(`apartado ${s.id} incompleto`);
    if (s.pages && !(Array.isArray(s.pages) && s.pages.every(p => Number.isInteger(p) && p > 0))) fail(`páginas de ${s.id}`);
    for (const b of s.blocks) {
      if (!b || !TEMA_BLOCKS.includes(b.type)) fail(`bloque ${b?.type} en ${s.id}`);
      if (b.title !== undefined && !text(b.title)) fail(`título de bloque en ${s.id}`);
      if (['list','steps'].includes(b.type) ? !texts(b.items) : b.type === 'table' ? !(texts(b.head) && Array.isArray(b.rows) && b.rows.length && b.rows.every(r => texts(r) && r.length === b.head.length)) : !text(b.text)) fail(`contenido de bloque ${b.type} en ${s.id}`);
      if (b.type === 'term' && !text(b.term)) fail(`término vacío en ${s.id}`);
    }
  }
  if (tema.summary && !texts(tema.summary)) fail('resumen');
  if (tema.glossary && !(Array.isArray(tema.glossary) && tema.glossary.every(g => text(g?.term) && text(g?.text)))) fail('glosario');
  const ids = bank.questions.filter(q => q.topic === topic.id).map(q => q.id);
  const qs = tema.questions && typeof tema.questions === 'object' ? tema.questions : fail('sin preguntas');
  if (Object.keys(qs).length !== ids.length || !ids.every(id => Object.hasOwn(qs, id))) fail('debe argumentar exactamente las preguntas del tema');
  for (const id of ids) {
    const q = qs[id];
    if (!q || !sections.has(q.section) || !text(q.reasoning) || !q.options || !['a','b','c','d'].every(k => text(q.options[k])) || Object.keys(q.options).length !== 4 || (q.doubt !== undefined && !text(q.doubt))) fail(`argumentación de ${id}`);
  }
  return topic;
}
