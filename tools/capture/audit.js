// ===== 꼬미입시 UI 측정(개발용): 화면별 글자 대비·12px 미만 글자·Tab 포커스·가로 넘침 =====
// 사용: zsh tools/capture/run.sh 가람중학교 audit  (서버 준비는 run.sh 가 한다, 가상 자료만)
// 글자/바탕 대비는 실제로 칠한 색을 읽고(oklch 포함) 반투명 바탕을 겹쳐 계산한다. 그라데이션 바탕·짧은 이모지는 뺀다.
import puppeteer from 'puppeteer-core';
import { login, clickMenu, wait, settle, setLook } from './lib/session.js';

const URL = process.argv[process.argv.indexOf('--url') + 1] || 'http://localhost:34851/';
const b=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,defaultViewport:{width:1366,height:768}});
const p=await b.newPage(); await login(p,URL,'admin');
const measure=()=>{
  const cv=document.createElement('canvas'); cv.width=cv.height=1; const cx=cv.getContext('2d',{willReadFrequently:true});
  // 어떤 CSS 색 형식(oklch·color-mix 포함)이든 실제로 칠해 RGBA 를 읽는다.
  const rgba=c=>{cx.clearRect(0,0,1,1); cx.fillStyle='rgba(0,0,0,0)'; cx.fillStyle=c; cx.fillRect(0,0,1,1); const d=cx.getImageData(0,0,1,1).data; return [d[0],d[1],d[2],d[3]/255];};
  const lum=c=>{const [r,g,bb,a]=rgba(c); if(a===0) return null; return [r,g,bb].map(v=>{v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)}).reduce((s,v,i)=>s+v*[0.2126,0.7152,0.0722][i],0)};
  const parse=c=>{if(!c) return null; const v=rgba(c); return v;};
  // 바탕: 위로 올라가며 반투명 색을 겹친다. 그라데이션 바탕을 만나면 판정에서 뺀다(null).
  const bgOf=el=>{const layers=[];for(let e=el;e;e=e.parentElement){const s=getComputedStyle(e); if(s.backgroundImage&&s.backgroundImage!=='none'&&s.backgroundImage.includes('gradient')) return null; const c=parse(s.backgroundColor); if(c&&c[3]>0){layers.push(c); if(c[3]>=1) break;}}
    let base=parse(getComputedStyle(document.documentElement).backgroundColor)||[255,255,255,1]; if(base[3]===0) base=[255,255,255,1];
    for(const c of layers.reverse()){const a=c[3]; base=[c[0]*a+base[0]*(1-a),c[1]*a+base[1]*(1-a),c[2]*a+base[2]*(1-a),1];}
    return `rgb(${base[0]},${base[1]},${base[2]})`;};
  const out={low:0,total:0,small:0,samples:[]};
  const w=document.createTreeWalker(document.querySelector('#app'),NodeFilter.SHOW_TEXT);let n;
  while(n=w.nextNode()){const t=n.textContent.trim(); if(t.length<2) continue; const el=n.parentElement; const s=getComputedStyle(el); if(s.visibility==='hidden'||s.display==='none'||el.offsetParent===null) continue;
    out.total++; const fs=parseFloat(s.fontSize); if(fs<12) out.small++;
    const bg=bgOf(el); if(!bg) continue; if(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF]/u.test(t)&&t.length<4) continue; const L1=lum(s.color), L2=lum(bg); if(L1==null||L2==null) continue; const ratio=(Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05);
    const need=(fs>=18.66||(fs>=14&&Number(s.fontWeight)>=700))?3:4.5;
    if(ratio<need){out.low++; if(out.samples.length<6) out.samples.push(`${t.slice(0,18)}(${ratio.toFixed(1)})`);}
  }
  out.overflowX=document.documentElement.scrollWidth>window.innerWidth+2;
  return out;
};
const focusCheck=async()=>{let visible=0,hidden=0; await p.evaluate(()=>document.activeElement?.blur());
  for(let i=0;i<25;i++){await p.keyboard.press('Tab'); const r=await p.evaluate(()=>{const e=document.activeElement;if(!e||e===document.body)return null;const s=getComputedStyle(e);return {o:s.outlineStyle!=='none'&&parseFloat(s.outlineWidth)>0, sh:s.boxShadow!=='none'}}); if(!r) continue; (r.o||r.sh)?visible++:hidden++;}
  return {visible,hidden};};
const screens=[['dash','대시보드'],['admin','나이스관리'],['classes','학급목록'],['applications','원서관리'],['cutoff','커트라인'],['users','계정']];
const res={};
for(const theme of ['light','dark']){ await setLook(p,theme);
  for(const [id,label] of screens){ await clickMenu(p,id); await settle(p,600); res[`${label}-${theme}`]=await p.evaluate(measure); if(theme==='light') res[`${label}-${theme}`].focus=await focusCheck(); }
  await clickMenu(p,'dash'); await p.click('#shellSearchInput',{clickCount:3}); await p.keyboard.type('1-1'); await wait(2500); await p.keyboard.press('Enter'); await wait(3500);
  res[`상담-${theme}`]=await p.evaluate(measure);
}
for(const [k,v] of Object.entries(res)) console.log(k.padEnd(14), `대비부족 ${v.low}/${v.total}`, `12px미만 ${v.small}`, v.overflowX?'가로넘침':'', v.focus?`포커스 보임${v.focus.visible}/안보임${v.focus.hidden}`:'', v.samples.join(' · '));
await b.close();
