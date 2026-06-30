import { useState, useEffect, useRef } from "react";

// ═══ CONSTANTS ══════════════════════════════════════════
const CHIP_VALS = [100, 500, 1000, 5000, 10000];
const MIN_BET = 100;
const CHC = {
  100:   { bg:"#ff5555", tx:"#fff",    lb:"100" },
  500:   { bg:"#22cc99", tx:"#fff",    lb:"500" },
  1000:  { bg:"#c9a84c", tx:"#1a0800", lb:"1k" },
  5000:  { bg:"#9a88ee", tx:"#fff",    lb:"5k" },
  10000: { bg:"#222",    tx:"#c9a84c", lb:"10k" },
};
const DOTS = {
  1:[{x:50,y:50}],
  2:[{x:27,y:27},{x:73,y:73}],
  3:[{x:27,y:27},{x:50,y:50},{x:73,y:73}],
  4:[{x:27,y:27},{x:73,y:27},{x:27,y:73},{x:73,y:73}],
  5:[{x:27,y:27},{x:73,y:27},{x:50,y:50},{x:27,y:73},{x:73,y:73}],
  6:[{x:27,y:22},{x:73,y:22},{x:27,y:50},{x:73,y:50},{x:27,y:78},{x:73,y:78}],
};
// 各面を上に向けるためのキューブ回転
// 立方体を回して「value」の面を正面(+Z=最も見える面)へ向ける回転。
// 面配置は下の cube で固定（正面1/裏6・上2/下5・右3/左4）。
const FACE_ROTS = {
  1:'rotateX(0deg)',          // 1 は正面のまま
  2:'rotateX(-90deg)',        // 上(2)→正面
  3:'rotateY(-90deg)',        // 右(3)→正面
  4:'rotateY(90deg)',         // 左(4)→正面
  5:'rotateX(90deg)',         // 下(5)→正面
  6:'rotateY(180deg)',        // 裏(6)→正面
};
const RC = {
  pinzoro: { c:"#f5c842", s:"rgba(245,200,66,.5)" },
  arashi:  { c:"#44ee88", s:"rgba(68,238,136,.4)" },
  shigoro: { c:"#66bbff", s:"rgba(100,180,255,.4)" },
  me:      { c:"#f0f0f0", s:"transparent" },
  hifumi:  { c:"#ff5555", s:"rgba(255,85,85,.4)" },
  shonben: { c:"#666",    s:"transparent" },
  menashi: { c:"#555",    s:"transparent" },
};
const STAT_KEYS = ['ピンゾロ','アラシ','シゴロ','6の目','5の目','4の目','3の目','2の目','1の目','目なし','ヒフミ','ションベン'];
const THEORY = {
  'ピンゾロ':1/216,'アラシ':5/216,'シゴロ':6/216,
  '6の目':15/216,'5の目':15/216,'4の目':15/216,'3の目':15/216,'2の目':15/216,'1の目':15/216,
  '目なし':108/216,'ヒフミ':6/216,'ションベン':0.01,
};
const INIT_STATS = { totalThrows:0, totalTurns:0, counts: Object.fromEntries(STAT_KEYS.map(k=>[k,0])) };

// ═══ UTILS ══════════════════════════════════════════════
const uid = () => Math.random().toString(36).slice(2,9);
const rollDice = () => [1,2,3].map(()=>Math.floor(Math.random()*6)+1);
const fmt = s => (s>0?'+':'')+s.toLocaleString();

function classify(dice) {
  const [a,b,c] = [...dice].sort((x,y)=>x-y);
  if(a===1&&b===1&&c===1) return {t:'pinzoro', l:'ピンゾロ！', sk:'ピンゾロ', v:null};
  if(a===b&&b===c)        return {t:'arashi',  l:`アラシ(${a})`, sk:'アラシ',  v:a};
  if(a===4&&b===5&&c===6) return {t:'shigoro', l:'シゴロ',       sk:'シゴロ',  v:null};
  if(a===1&&b===2&&c===3) return {t:'hifumi',  l:'ヒフミ',       sk:'ヒフミ',  v:null};
  if(a===b) return {t:'me', l:`${c}の目`, sk:`${c}の目`, v:c};
  if(b===c) return {t:'me', l:`${a}の目`, sk:`${a}の目`, v:a};
  if(a===c) return {t:'me', l:`${b}の目`, sk:`${b}の目`, v:b};
  return {t:'menashi', l:'目なし', sk:'目なし', v:null};
}

// 役の強さ（数値が大きいほど強い）。勝敗は必ずこの強さで判定する（倍率では判定しない）。
//   1位 ピンゾロ ＞ 2位 アラシ ＞ 3位 シゴロ ＞ 4位 目あり(6>5>4>3>2>1)
//   ＞ 5位 目なし＝ションベン（同じ強さ＝引き分け） ＞ 6位 ヒフミ（最弱）
function getRank(r) {
  if(!r) return -1;
  if(r.t==='pinzoro') return 1000;
  if(r.t==='arashi')  return 600 + (r.v||0);
  if(r.t==='shigoro') return 500;
  if(r.t==='me')      return 400 + (r.v||0);   // 6の目=406 … 1の目=401
  if(r.t==='menashi') return 100;              // 目なし＝5位
  if(r.t==='shonben') return 100;              // ションベン＝目なしと同じ5位（引き分け）
  if(r.t==='hifumi')  return 10;               // ヒフミ＝最弱（6位）
  return 0;
}

// ── 役ごとの倍率 ──────────────────────────────────────────
// 勝ち役・負け役それぞれが固有の倍率を持つ。最終倍率は「親の役倍率 × 子の役倍率」。
//   ピンゾロ ×5 / アラシ ×3 / シゴロ ×2（強い勝ち役）
//   ヒフミ ×2（重い負け役）
//   それ以外（◯の目＝通常役・目なし・ションベン・役なし）は ×1
//   ※ションベンは目なしと同じ扱い（×1）。
function roleMult(r){
  switch(r?.t){
    case 'pinzoro': return 5;
    case 'arashi':  return 3;
    case 'shigoro': return 2;
    case 'hifumi':  return 2;
    default:        return 1;   // ◯の目・目なし・ションベン・なし＝通常役（1倍）
  }
}

function calcPayout(pR, cR, bet) {
  // 勝敗は出目の強さ（getRank）で決める。引き分け（同ランク）は親の勝ち。
  const pRank = getRank(pR), cRank = getRank(cR);
  // 最終倍率 ＝ 親の役倍率 × 子の役倍率（通常役は1倍なので掛けても影響しない）。
  //   例) 子ヒフミ(×2) × 親シゴロ(×2)   = ×4
  //       子ションベン(×3) × 親シゴロ(×2) = ×6
  //       子ヒフミ(×2) × 親ピンゾロ(×5)  = ×10
  // この最終倍率をベット額に掛けてスコアを移動する。親・子どちらが倍率役でも、
  // 両方が倍率役でも、必ず掛け算で反映される。
  const m = roleMult(pR) * roleMult(cR);
  if(pRank >= cRank){
    return { cd: -bet*m, pd: bet*m, m, w:'parent' }; // 親の勝ち
  }
  return { cd: bet*m, pd: -bet*m, m, w:'child' };     // 子の勝ち
}

function getChildren(players, parentIdx) {
  const n = players.length;
  return Array.from({length:n-1}, (_,i) => players[(parentIdx+1+i)%n]);
}

// ═══ 期待感演出（炎＋カットイン）の抽選 ═══════════════════
// 公平なサイコロ結果が出た「後」に、見た目だけを抽選する。
// 出目には一切影響しない。役と「ゆるく」連動するが、絶対に確定演出にはしない。
//  全体のおおよその割合 … 炎のみ8% / カットインのみ5% / 激アツ(炎＋カットイン)1% / なし86%（演出は約14%）
//  そして「演出が出たとき」の役の内訳が次になるよう、役カテゴリごとの発生確率を逆算してある：
//    炎のみ・カットインのみ … 良い役45% / 普通45% / 悪い役10%
//    激アツ               … 良い役80% / 普通18% / 悪い役2%
//  ※どのカテゴリでも演出ゼロにはせず、悪い役でもまれに出る＝「確定演出」にはならない。
const FX_MSGS = ["アツい！","ここで…！","来るか…？","勝負！","震えろ…！","魅せろ！",
                 "一発っ！","運命の一投","イチかバチか","気合いだッ","いけ…！","魅せ場だ"];
let _fxLastMsg = -1;
function fxPickMsg(){
  let i; do{ i=Math.floor(Math.random()*FX_MSGS.length); }while(i===_fxLastMsg && FX_MSGS.length>1);
  _fxLastMsg = i; return FX_MSGS[i];
}
function pickEffect(res){
  // 役を「良い役 / 普通 / 悪い役」の3カテゴリに分ける。
  const good = res.t==='pinzoro' || res.t==='arashi' || res.t==='shigoro' || (res.t==='me' && (res.v||0)>=5);
  const bad  = res.t==='hifumi'  || res.t==='shonben' || res.t==='menashi';
  // カテゴリごとの「演出が出る確率」（炎・カットイン・激アツ）。
  // これらは “1回のスローでその役が出る理論確率（良い役42/216・普通60/216・悪い役114/216）” と
  // 目標（全体で 炎8%/カットイン5%/激アツ1%、かつ演出時の役内訳 45/45/10・激アツは80/18/2）
  // から逆算した値。出目は公平に決まった後なので、サイコロの結果には一切影響しない。
  let pFire, pCutin, pBoth;
  if(good){      pFire=0.185; pCutin=0.116; pBoth=0.0410;  }  // 良い役：演出が出やすく激アツ寄り
  else if(bad){  pFire=0.0152; pCutin=0.0095; pBoth=0.0004; } // 悪い役：かなり控えめ（でもゼロにはしない＝確定しない）
  else {         pFire=0.130; pCutin=0.081; pBoth=0.0065;  }  // 普通
  const r = Math.random();
  if(r < pBoth)                      return { fire:true,  cutin:true,  msg:fxPickMsg() }; // 激アツ
  if(r < pBoth+pCutin)               return { fire:false, cutin:true,  msg:fxPickMsg() }; // カットインのみ
  if(r < pBoth+pCutin+pFire)         return { fire:true,  cutin:false, msg:null };        // 炎のみ
  return null;                                                                            // 演出なし
}

// ═══ CSS ════════════════════════════════════════════════
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
html,body{height:100%;background:#0d0d0d;}
body{font-family:'Noto Sans JP',sans-serif;color:#f0f0f0;max-width:430px;margin:0 auto;min-height:100%;overflow-x:clip;}
#root{min-height:100vh;min-height:100dvh;}

@keyframes bowlShake{
  0%,100%{transform:none;}
  14%{transform:translate(-5px,3px) rotate(-2deg);}
  28%{transform:translate(6px,-4px) rotate(1.3deg);}
  42%{transform:translate(-5px,2px) rotate(-1.1deg);}
  57%{transform:translate(4px,-2px) rotate(0.7deg);}
  72%{transform:translate(-2px,1px) rotate(-0.3deg);}
  86%{transform:translate(1px,-0.5px) rotate(0.1deg);}
}
/* ── サイコロ落下アニメ（採用：サンプル1番）──
   位置(間隔)・大きさ・回転を別々のレイヤーで動かし、
   「広く大きく → 縮みながら品の字へ」を実現。重ならない。 */
/* グループ全体の落下（上下）＋フェードイン */
@keyframes diceDrop{0%{transform:translateY(-34px);opacity:0;}7%{opacity:1;}82%{transform:translateY(7px);}91%{transform:translateY(-4px);}100%{transform:translateY(0);}}
/* 各サイコロの位置＝間隔：広い → 重ならない品の字 */
@keyframes posTop{0%{left:50%;top:15%;}100%{left:50%;top:44%;}}
@keyframes posBl {0%{left:20%;top:80%;}100%{left:42%;top:57%;}}
@keyframes posBr {0%{left:80%;top:80%;}100%{left:58%;top:57%;}}
/* 大きさ：大 → 小（落下の奥行き感。最後ポン）*/
@keyframes diceScale{0%{transform:scale(2.40);}82%{transform:scale(0.50);}91%{transform:scale(0.60);}100%{transform:scale(0.56);}}
/* 回転：立体キューブを2軸でくるくる → 360の倍数で着地（＝上面の出目がまっすぐ出る）*/
@keyframes diceSpin1{0%{transform:rotateX(0) rotateY(0) rotateZ(0);}100%{transform:rotateX(1440deg) rotateY(1080deg) rotateZ(0);}}
@keyframes diceSpin2{0%{transform:rotateX(0) rotateY(0) rotateZ(0);}100%{transform:rotateX(1080deg) rotateY(1440deg) rotateZ(0);}}
@keyframes diceSpin3{0%{transform:rotateX(0) rotateY(0) rotateZ(0);}100%{transform:rotateX(1800deg) rotateY(1080deg) rotateZ(0);}}
@keyframes dieOut{0%{opacity:1;transform:none;}15%{opacity:1;}100%{opacity:0;transform:translate(var(--ox),var(--oy)) rotate(1800deg) scale(0.04);}}
@keyframes reveal{0%{transform:scale(.2) rotate(-12deg);opacity:0;}55%{transform:scale(1.2) rotate(2deg);}80%{transform:scale(.96) rotate(-1deg);}100%{transform:scale(1);opacity:1;}}
@keyframes floatUp{0%{transform:translateY(0);opacity:1;}20%{opacity:1;}100%{transform:translateY(-60px) scale(.8);opacity:0;}}
@keyframes fadeIn{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:none;}}
@keyframes slideUp{from{opacity:0;transform:translateY(22px);}to{opacity:1;transform:none;}}
@keyframes popIn{0%{transform:scale(.6);opacity:0;}70%{transform:scale(1.08);}100%{transform:scale(1);opacity:1;}}

.btn{border:none;border-radius:10px;cursor:pointer;font-family:'Noto Sans JP',sans-serif;font-weight:700;transition:transform .1s,filter .1s;}
.btn:active:not(:disabled){transform:scale(.95);}
.btn:disabled{opacity:.4;cursor:not-allowed;}
.btn-y{background:linear-gradient(135deg,#f5c842,#e8a000);color:#1a0800;}
.btn-y:hover:not(:disabled){filter:brightness(1.08);}
.btn-g{background:rgba(255,255,255,.1);color:#f0f0f0;border:1px solid rgba(255,255,255,.14);}
.btn-g:hover:not(:disabled){background:rgba(255,255,255,.16);}
.roll-btn{font-size:24px;padding:17px 72px;border-radius:50px;background:linear-gradient(135deg,#f5c842,#e8a000);color:#1a0800;font-weight:900;box-shadow:0 6px 24px rgba(232,160,0,.45);letter-spacing:.03em;border:none;cursor:pointer;transition:transform .1s,filter .1s;font-family:'Noto Sans JP',sans-serif;}
.roll-btn:active:not(:disabled){transform:scale(.96);}
.roll-btn:disabled{opacity:.4;cursor:not-allowed;}
/* 入力欄はOS（iOS/Android）のライト/ダークテーマに左右されないよう、色を全て明示指定する。
   -webkit-text-fill-color はiOSが文字色を上書きするのを防ぐためのもの。 */
/* font-size は16px。iOS Safariは16px未満の入力欄をタップすると画面を勝手に拡大するため、それを防ぐ。 */
input[type=text]{background:#2a2a2a;border:1px solid #555;border-radius:8px;color:#f5f5f5;-webkit-text-fill-color:#f5f5f5;caret-color:#f5c842;color-scheme:dark;-webkit-appearance:none;appearance:none;padding:11px 14px;font-family:'Noto Sans JP',sans-serif;font-size:16px;outline:none;transition:border-color .2s;}
input[type=text]:focus{border-color:#f5c842;background:#2a2a2a;}
input[type=text]::placeholder{color:#9a9a9a;-webkit-text-fill-color:#9a9a9a;opacity:1;}
::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-thumb{background:#333;border-radius:2px;}

/* ── 期待感演出：炎の暖色グロー ── */
.fx-warm{position:absolute;inset:0;border-radius:50%;pointer-events:none;
  background:radial-gradient(ellipse at 50% 60%,rgba(255,150,40,.85) 0%,rgba(255,90,20,.45) 34%,rgba(180,40,10,.12) 56%,transparent 72%);
  mix-blend-mode:soft-light;opacity:0;}

/* ── 期待感演出：カットイン（衝撃スラム） ── */
.fx-cutin{position:absolute;inset:0;pointer-events:none;display:flex;align-items:center;justify-content:center;opacity:0;}
.fx-cutin.show{opacity:1;}
.fx-cutin.out{opacity:0;transition:opacity .22s ease;}
.fx-fly{position:relative;display:flex;align-items:center;justify-content:center;}
.fx-citext{font-size:calc(30px * var(--fxs,1));font-weight:900;letter-spacing:.05em;white-space:nowrap;line-height:1;
  background:linear-gradient(168deg,#fff8e6 0%,#ffe49e 26%,#f3c155 50%,#fff0bf 68%,#e3a93f 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 1px 1px rgba(0,0,0,.7)) drop-shadow(0 2px 7px rgba(0,0,0,.45)) drop-shadow(0 0 10px rgba(255,196,84,.65));}
.fx-ciglow{position:absolute;left:50%;top:50%;width:calc(215px * var(--fxs,1));height:calc(86px * var(--fxs,1));transform:translate(-50%,-50%);
  background:radial-gradient(ellipse at center,rgba(8,5,0,.52) 0%,rgba(8,5,0,.22) 46%,transparent 72%);filter:blur(2px);opacity:0;}
.fx-cutin.show .fx-ciglow{animation:fxGlowIn .2s ease both;}
@keyframes fxGlowIn{from{opacity:0}to{opacity:1}}
.fx-shock{position:absolute;left:50%;top:50%;width:calc(74px * var(--fxs,1));height:calc(74px * var(--fxs,1));
  border:3px solid rgba(255,214,128,.95);border-radius:50%;transform:translate(-50%,-50%) scale(.3);opacity:0;box-shadow:0 0 16px rgba(255,190,90,.7);}
.fx-flash{position:absolute;left:50%;top:50%;width:calc(240px * var(--fxs,1));height:calc(130px * var(--fxs,1));transform:translate(-50%,-50%);
  background:radial-gradient(ellipse,rgba(255,246,222,.95) 0%,rgba(255,210,140,.4) 40%,transparent 68%);opacity:0;}
.fx-streak{position:absolute;height:3px;border-radius:3px;opacity:0;
  background:linear-gradient(90deg,transparent,#fff,transparent);box-shadow:0 0 8px #ffd98a;}
.fx-streak.s1{left:0;top:42%;width:70%;}
.fx-streak.s2{right:0;top:58%;width:62%;}
.fx-streak.s3{left:6%;top:50%;width:46%;}
.fx-cutin.show .fx-fly{animation:fxSlam .44s cubic-bezier(.12,.72,.2,1) both;}
.fx-cutin.show .fx-shock{animation:fxShock .52s ease-out .2s both;}
.fx-cutin.show .fx-flash{animation:fxFlash .34s ease-out .18s both;}
.fx-cutin.show .fx-streak{animation:fxStreak .3s ease-out both;}
.fx-cutin.show .fx-streak.s2{animation-delay:.04s;}
.fx-cutin.show .fx-streak.s3{animation-delay:.02s;}
@keyframes fxSlam{0%{opacity:0;transform:translateX(165px) scale(1.28)}50%{opacity:1;transform:translateX(-14px) scale(1.06)}
  68%{transform:translateX(7px) scale(.97)}82%{transform:translateX(-3px) scale(1.01)}92%{transform:translateX(2px)}100%{transform:translateX(0) scale(1)}}
@keyframes fxShock{0%{opacity:0;transform:translate(-50%,-50%) scale(.3)}22%{opacity:.85}100%{opacity:0;transform:translate(-50%,-50%) scale(1.7)}}
@keyframes fxFlash{0%{opacity:0}26%{opacity:.9}100%{opacity:0}}
@keyframes fxStreak{0%{opacity:0;transform:translateX(40px)}30%{opacity:1}100%{opacity:0;transform:translateX(-30px)}}
@keyframes fxKick{0%{transform:translate(0,0)}20%{transform:translate(3px,-2px)}40%{transform:translate(-3px,2px)}60%{transform:translate(2px,2px)}80%{transform:translate(-2px,-1px)}100%{transform:translate(0,0)}}
`;

// ═══ DICE LAYOUT ════════════════════════════════════════
// 着地後の最終位置（重ならない「品」の字）。お椀基準（%）。
const FINAL_POS = [
  { left:'50%', top:'44%' }, // 上
  { left:'42%', top:'57%' }, // 左下
  { left:'58%', top:'57%' }, // 右下
];
const POS_NAMES   = ['posTop','posBl','posBr'];          // 位置(間隔)アニメ
const SPIN_NAMES  = ['diceSpin1','diceSpin2','diceSpin3'];// 回転アニメ
const FLY_SIZE    = 60;   // 飛行中の基準サイズ（×0.56 で最終 ≈34px）
const SETTLE_SIZE = 34;   // 着地後サイズ
const DICE_DUR    = '1.25s';
const DICE_EASE   = 'cubic-bezier(.3,.1,.3,1)';

// ═══ 期待感演出：炎エンジン（Canvas粒子・加算合成） ════════
// サンプル(sample-enshutsu11.html)で承認された炎をそのまま移植。
// サイズはサイコロ基準で合わせる（FX_SCALE）。位置は落下中のサイコロを毎フレーム追従。
const FX_BASE_DIE  = 46;                 // サンプルのサイコロ基準サイズ
const FX_SCALE     = SETTLE_SIZE / FX_BASE_DIE; // 本アプリのサイコロに合わせた縮尺
const FX_FIRE_DROP = 42 * FX_SCALE;      // サイコロが炎の中心に来るよう発生源を少し下げる

// 炎の粒（放射グラデーションのスプライト）。1回だけ生成して使い回す。
function _fxSprite(r,g,b){
  const c=document.createElement('canvas'); c.width=c.height=64;
  const x=c.getContext('2d');
  const gd=x.createRadialGradient(32,32,0,32,32,32);
  gd.addColorStop(0,'rgba('+r+','+g+','+b+',1)');
  gd.addColorStop(.45,'rgba('+r+','+g+','+b+',.45)');
  gd.addColorStop(1,'rgba('+r+','+g+','+b+',0)');
  x.fillStyle=gd; x.fillRect(0,0,64,64); return c;
}
let _FXS=null;
function fxSprites(){
  if(_FXS) return _FXS;
  _FXS={
    CORE:_fxSprite(255,249,210), YEL:_fxSprite(255,236,150), AMB:_fxSprite(255,178,72),
    ORA:_fxSprite(255,120,40), RED:_fxSprite(212,52,18), EMB:_fxSprite(255,232,170),
    SPK:[{s:_fxSprite(255,255,248)},{s:_fxSprite(255,236,150)},{s:_fxSprite(255,170,78)}],
  };
  return _FXS;
}
// 炎の発生源（サイコロ3個ぶん）。サイズ系の数値だけ FX_SCALE で縮める。
function fxMakeSRC(){
  const k=FX_SCALE;
  return [
    {cx:0,baseY:0,baseW:28.2*k,height:108*k,  size:18.9*k,swayAmt:11*k,drift:0.7*k, wander:1.55*k,spawn:6.54,front:2.03,spark:3.51,
     swayInt:0.16,breathInt:0.20,phase:0.0, sway:0,swayT:0,swayNext:0,breath:1,breathT:1,breathNext:0},
    {cx:0,baseY:0,baseW:28.2*k,height:113.4*k,size:18.9*k,swayAmt:15*k,drift:0.85*k,wander:1.8*k, spawn:7.82,front:2.97,spark:3.51,
     swayInt:0.23,breathInt:0.27,phase:1.7, sway:0,swayT:0,swayNext:0,breath:1,breathT:1,breathNext:0},
    {cx:0,baseY:0,baseW:28.2*k,height:124.2*k,size:18.9*k,swayAmt:13*k,drift:0.6*k, wander:1.7*k, spawn:8.53,front:2.97,spark:4.05,
     swayInt:0.19,breathInt:0.31,phase:3.1, sway:0,swayT:0,swayNext:0,breath:1,breathT:1,breathNext:0},
  ];
}

// 炎エンジン本体。canvas2つ・暖色グロー要素・サイコロ追従関数を受け取り動かす。
function createFireEngine(back, front, warmEl, getCenters, sizeRef){
  const K=FX_SCALE;
  const SP=fxSprites();
  const {CORE,YEL,AMB,ORA,RED,EMB,SPK}=SP;
  const spkCol=()=>{const r=Math.random();return r<.3?SP.SPK[0]:r<.74?SP.SPK[1]:SP.SPK[2];};
  const SRC=fxMakeSRC();
  let raf=0,t0=0,time=0,flick=1;
  let fire=[],fireF=[],emb=[],spk=[],spkB=[];
  let burn=false,inten=0,offT=0,stopped=false;
  const last=[[0,0],[0,0],[0,0]];

  function updateSources(){
    const cs=getCenters(); // [[x,y],...] お椀左上基準・実px
    for(let i=0;i<3;i++){
      if(cs&&cs[i]){ last[i][0]=cs[i][0]; last[i][1]=cs[i][1]; }
      SRC[i].cx   = last[i][0];
      SRC[i].baseY= last[i][1] + FX_FIRE_DROP;
    }
  }
  function mkFire(si,isFront){
    const S=SRC[si];
    const baseX=S.cx+S.sway*S.swayAmt;
    const x=baseX+(Math.random()-.5)*S.baseW;
    const y=S.baseY+Math.random()*8*K;
    const tall=Math.random()<0.22?1.5:1;
    const vy=-(0.65+Math.random()*1.0)*(0.75+S.breath*0.8)*tall*K;
    return {si,x,y,vx:(Math.random()-.5)*.4*K,vy,life:1,
      decay:0.016*(0.7+Math.random()*0.7),size:S.size*(0.7+Math.random()*0.8),
      ph:Math.random()*6.28,amp:S.wander*(0.5+Math.random()),
      baseY:S.baseY,height:S.height,front:isFront,split:false};
  }
  function drawFire(p,ctx){
    const S=SRC[p.si];
    p.ph+=0.09;
    const hf=Math.max(0,Math.min(1,(p.baseY-p.y)/p.height));
    const wob=Math.sin(p.ph+S.sway*2)*p.amp*(0.4+hf*1.6);
    p.x+=p.vx+wob*0.12+S.sway*S.drift;
    p.vy-=0.0065*(0.8+S.breath*0.6)*K;
    p.y+=p.vy;
    if(hf>0.5){
      p.vx+=(Math.random()-.5)*0.7*hf*K;
      p.life-=p.decay*(1+hf*1.6);
      if(!p.split&&p.life<0.5&&Math.random()<0.05){p.split=true;
        for(let n=0;n<2;n++)fire.push({si:p.si,x:p.x,y:p.y,vx:(Math.random()-.5)*1.3*K,vy:p.vy*0.8,
          life:p.life*0.8,decay:p.decay*1.7,size:p.size*0.65,ph:Math.random()*6.28,amp:p.amp,
          baseY:p.baseY,height:p.height,front:p.front,split:true});}
    }else p.life-=p.decay;
    if(p.life<=0)return false;
    const l=p.life;let spr,a;
    if(l>0.82){spr=CORE;a=0.10;}else if(l>0.6){spr=YEL;a=0.13;}
    else if(l>0.4){spr=AMB;a=0.14;}else if(l>0.22){spr=ORA;a=0.13;}else{spr=RED;a=0.10;}
    a*=(p.front?0.62:1)*0.85;
    const env=Math.sin(Math.min(1,l)*Math.PI);
    ctx.globalAlpha=a*env*inten;
    const s=p.size*(0.7+(1-l)*1.0);
    ctx.drawImage(spr,p.x-s/2,p.y-s/2,s,s);
    return true;
  }
  function mkEmb(si){const S=SRC[si];
    const x=S.cx+S.sway*S.swayAmt+(Math.random()-.5)*S.baseW,y=S.baseY-Math.random()*30*K;
    return {x,y,vx:((Math.random()-.5)*1.0+S.sway*0.4)*K,vy:-(0.9+Math.random()*1.8)*K,
      life:1,decay:0.012+Math.random()*0.02,size:(1.2+Math.random()*2.2)*K,ph:Math.random()*6.28};}
  function drawEmb(p,ctx){
    p.ph+=0.2; p.x+=p.vx+Math.sin(p.ph)*0.3*K; p.vy+=0.008*K; p.y+=p.vy; p.life-=p.decay;
    if(p.life<=0)return false;
    ctx.globalAlpha=Math.min(1,p.life*1.3)*(0.7+0.3*Math.sin(p.ph*2))*inten;
    const s=p.size*1.6*1.35; ctx.drawImage(EMB,p.x-s/2,p.y-s/2,s,s); return true;}
  function mkSpark(si){const S=SRC[si];
    const x=S.cx+S.sway*S.swayAmt+(Math.random()-.5)*S.baseW,y=S.baseY-Math.random()*40*K;
    const ang=-Math.PI/2+(Math.random()-.5)*2.6,sp=(0.8+Math.random()*3.4)*K,col=spkCol();
    return {x,y,vx:Math.cos(ang)*sp+S.sway*0.4*K,vy:Math.sin(ang)*sp,g:(0.02+Math.random()*0.05)*K,
      life:1,decay:0.012+Math.random()*0.04,size:(0.7+Math.random()*2.8)*K,bright:0.45+Math.random()*0.55,
      tw:Math.random()*6.28,s:col.s};}
  function drawSpark(p,ctx){
    p.tw+=0.7; p.vy+=p.g; p.x+=p.vx; p.y+=p.vy; p.life-=p.decay;
    if(p.life<=0)return false;
    const tw=0.6+0.4*Math.sin(p.tw*1.7+p.x);
    ctx.globalAlpha=Math.min(1,p.life*1.3)*p.bright*tw;
    const s=p.size*1.5*1.35; ctx.drawImage(p.s,p.x-s/2,p.y-s/2,s,s); return true;}

  function step(){
    const W=sizeRef.w||220, H=sizeRef.h||220;
    inten+=((burn?1:0)-inten)*0.06;
    for(const S of SRC){
      if(time>S.swayNext){S.swayT=(Math.random()-.5)*2;S.swayNext=time+S.swayInt+Math.random()*0.4;}
      S.sway+=(S.swayT-S.sway)*0.07;
      if(time>S.breathNext){S.breathT=0.5+Math.random()*1.0;S.breathNext=time+S.breathInt+Math.random()*0.5;}
      if(Math.random()<0.015)S.breathT=1.5+Math.random()*0.3;
      S.breath+=(S.breathT-S.breath)*0.08;
    }
    if(inten>0.02){
      for(let si=0;si<3;si++){const S=SRC[si];
        const fl=0.5+0.5*Math.sin(time*13+S.phase*3);
        const nb=Math.round(S.spawn*(0.6+fl*0.8)*inten*S.breath);
        for(let i=0;i<nb;i++)fire.push(mkFire(si,false));
        const nfr=Math.round(S.front*(0.5+fl*0.8)*inten);
        for(let i=0;i<nfr;i++)fireF.push(mkFire(si,true));
        if(Math.random()<0.55*inten)emb.push(mkEmb(si));
        const nsp=Math.round(S.spark*(0.5+fl)*inten);
        for(let i=0;i<nsp;i++)(Math.random()<0.4?spkB:spk).push(mkSpark(si));
      }
    }
    back.clearRect(0,0,W,H); back.globalCompositeOperation='lighter';
    for(let i=fire.length-1;i>=0;i--){if(!drawFire(fire[i],back))fire.splice(i,1);}
    for(let i=spkB.length-1;i>=0;i--){if(!drawSpark(spkB[i],back))spkB.splice(i,1);}
    front.clearRect(0,0,W,H); front.globalCompositeOperation='lighter';
    for(let i=fireF.length-1;i>=0;i--){if(!drawFire(fireF[i],front))fireF.splice(i,1);}
    for(let i=emb.length-1;i>=0;i--){if(!drawEmb(emb[i],front))emb.splice(i,1);}
    for(let i=spk.length-1;i>=0;i--){if(!drawSpark(spk[i],front))spk.splice(i,1);}
    if(warmEl) warmEl.style.opacity=((0.30+0.5*flick)*inten*1.25).toFixed(3);
    if(!burn&&inten<0.02&&fire.length+fireF.length+spk.length+spkB.length+emb.length===0){
      back.clearRect(0,0,W,H);front.clearRect(0,0,W,H);if(warmEl)warmEl.style.opacity=0;
      cancelAnimationFrame(raf);raf=0;
    }
  }
  function loop(ts){
    if(stopped)return;
    if(!t0)t0=ts; time=(ts-t0)/1000;
    flick=0.5+0.5*(0.5*Math.sin(time*13)+0.3*Math.sin(time*27+1)+0.2*Math.sin(time*41+2));
    updateSources(); step();
    if(raf||burn||inten>0.02) raf=requestAnimationFrame(loop);
  }
  function start(){ if(!raf&&!stopped){t0=0;raf=requestAnimationFrame(loop);} }
  function ignite(dur){ burn=true; clearTimeout(offT); offT=setTimeout(()=>{burn=false;},dur); start(); }
  function destroy(){
    stopped=true; burn=false; clearTimeout(offT); cancelAnimationFrame(raf); raf=0;
    const W=sizeRef.w||220,H=sizeRef.h||220;
    back.clearRect(0,0,W,H); front.clearRect(0,0,W,H); if(warmEl)warmEl.style.opacity=0;
  }
  return { ignite, destroy };
}

// ═══ 期待感演出レイヤー（炎＋カットイン）════════════════════
// お椀の上に重ねる。runId が変わるたびに、その回の effect に応じて炎/カットインを再生する。
function FxLayer({ runId, effect, bowlRef, dieRefs }){
  const backRef=useRef(null), frontRef=useRef(null), warmRef=useRef(null);
  const cutinRef=useRef(null), textRef=useRef(null);
  const sizeRef=useRef({w:220,h:220});

  useEffect(()=>{
    if(!runId || !effect) return;
    const bowl=bowlRef.current;
    if(!bowl || !backRef.current || !frontRef.current) return;
    const b=bowl.getBoundingClientRect();
    const W=Math.max(40,Math.round(b.width)), H=Math.max(40,Math.round(b.height||b.width));
    sizeRef.current={w:W,h:H};
    // Canvasの内部解像度をお椀の実サイズに合わせる
    backRef.current.width=W;  backRef.current.height=H;
    frontRef.current.width=W; frontRef.current.height=H;
    // カットインの大きさをお椀サイズに合わせる（220基準）
    const uiScale=Math.max(0.9, Math.min(1.9, W/220));
    if(cutinRef.current) cutinRef.current.style.setProperty('--fxs', uiScale.toFixed(3));

    // 落下中サイコロの中心（お椀左上基準・実px）を毎フレーム取得
    const getCenters=()=>{
      const bb=bowl.getBoundingClientRect();
      return [0,1,2].map(i=>{
        const el=dieRefs.current[i];
        if(!el) return null;
        const r=el.getBoundingClientRect();
        return [ r.left+r.width/2-bb.left, r.top+r.height/2-bb.top ];
      });
    };

    const timers=[];
    let eng=null;
    if(effect.fire){
      eng=createFireEngine(
        backRef.current.getContext('2d'),
        frontRef.current.getContext('2d'),
        warmRef.current, getCenters, sizeRef.current
      );
      timers.push(setTimeout(()=>eng.ignite(950),120)); // 振り始めで発火（回る間だけ燃える）
    }
    if(effect.cutin){
      const ci=cutinRef.current, tx=textRef.current;
      if(tx) tx.textContent=effect.msg||'勝負！';
      timers.push(setTimeout(()=>{
        if(!ci)return;
        ci.classList.remove('show','out'); void ci.offsetWidth; ci.classList.add('show');
      },300));                                            // 落下の最中にドンッと飛び込む
      timers.push(setTimeout(()=>{                        // 着弾シェイク（お椀を一瞬揺らす）
        if(bowl){ bowl.style.animation='none'; void bowl.offsetWidth; bowl.style.animation='fxKick .13s linear'; }
      },450));
      timers.push(setTimeout(()=>{ if(bowl) bowl.style.animation=''; },600));
      timers.push(setTimeout(()=>{ if(ci) ci.classList.add('out'); },980)); // 着弾後サッと消える
    }
    return ()=>{
      timers.forEach(clearTimeout);
      if(eng) eng.destroy();
      const ci=cutinRef.current;
      if(ci) ci.classList.remove('show','out');
      if(bowl) bowl.style.animation='';
    };
  },[runId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <canvas ref={backRef} width={220} height={220}
        style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:2}}/>
      <div ref={warmRef} className="fx-warm" style={{zIndex:5}}/>
      <canvas ref={frontRef} width={220} height={220}
        style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:6}}/>
      <div ref={cutinRef} className="fx-cutin" style={{zIndex:10}}>
        <div className="fx-ciglow"/><div className="fx-flash"/><div className="fx-shock"/>
        <span className="fx-streak s1"/><span className="fx-streak s2"/><span className="fx-streak s3"/>
        <div className="fx-fly"><div className="fx-citext" ref={textRef}>勝負！</div></div>
      </div>
    </>
  );
}

// ═══ DIE ════════════════════════════════════════════════
function Die({ value, size=50, spin }) {
  const half = size / 2;
  const spinning = !!spin;

  // 回転中（spinning）は1フレームごとに描画し直すので、重い表現をやめて軽くする：
  //   ・ピップ（目）は単色フラット（radial-gradient と inset影をやめる）
  //   ・面のグラデも単色寄りに
  // 静止時はこれまで通りリッチに見せる。出目・配置・確率には一切影響しない見た目だけの分岐。
  const face = (n, tfm, l=1) => (
    <div style={{
      position:'absolute', width:size, height:size,
      background: spinning
        ? `hsl(38,9%,${Math.round(94*l)}%)`
        : `linear-gradient(145deg,hsl(38,9%,${Math.round(98*l)}%),hsl(38,9%,${Math.round(89*l)}%))`,
      borderRadius:size*.13,
      border:'0.5px solid rgba(200,190,178,.6)',
      transform:tfm,
      backfaceVisibility:'hidden',
    }}>
      {(DOTS[n]||[]).map((d,i)=>(
        <div key={i} style={{
          position:'absolute',
          width:size*.2, height:size*.2, borderRadius:'50%',
          background: spinning
            ? (n===1 ? '#c00' : '#222')
            : (n===1
              ?'radial-gradient(circle at 35% 30%,#ff9988,#bb0000)'
              :'radial-gradient(circle at 35% 30%,#555,#111)'),
          left:`${d.x}%`, top:`${d.y}%`,
          transform:'translate(-50%,-50%)',
          boxShadow: spinning ? 'none' : 'inset 0 1px 3px rgba(0,0,0,.5)',
        }}/>
      ))}
    </div>
  );

  // 元の「正しく出目が出る」面配置＋FACE_ROTS。これは静止時の正解の向き。
  const cube = (
    <div style={{
      width:size, height:size, position:'relative',
      transformStyle:'preserve-3d',
      transform:FACE_ROTS[value]||'rotateX(0deg)',
    }}>
      {face(1,`translateZ(${half}px)`,                1.00)} {/* 正面 +Z */}
      {face(6,`rotateY(180deg) translateZ(${half}px)`,0.72)} {/* 裏 -Z */}
      {face(2,`rotateX(90deg) translateZ(${half}px)`, 0.93)} {/* 上 -Y */}
      {face(5,`rotateX(-90deg) translateZ(${half}px)`,0.80)} {/* 下 +Y */}
      {face(3,`rotateY(90deg) translateZ(${half}px)`, 0.86)} {/* 右 +X */}
      {face(4,`rotateY(-90deg) translateZ(${half}px)`,0.82)} {/* 左 -X */}
    </div>
  );

  return (
    <div style={{
      width:size, height:size, flexShrink:0,
      perspective:size*6, perspectiveOrigin:'50% -40%',
      // drop-shadow は毎フレーム再ラスタライズされて重い。回転中は外し、静止時だけ付ける。
      filter: spinning ? 'none' : `drop-shadow(0 ${size*.1}px ${size*.22}px rgba(0,0,0,.55))`,
    }}>
      {spinning ? (
        // 回転は perspective の内側・preserve-3d でキューブごとタンブル。
        // 360の倍数で着地するので、最後は静止時と同じ＝正しい出目になる。
        // willChange/translateZ で GPU 合成に乗せてカクつきを抑える。
        <div style={{
          width:size, height:size, position:'relative',
          transformStyle:'preserve-3d',
          willChange:'transform',
          animation:`${spin} ${DICE_DUR} ${DICE_EASE} both`,
        }}>
          {cube}
        </div>
      ) : cube}
    </div>
  );
}

// ═══ BOWL ═══════════════════════════════════════════════
function Bowl({ phase, dice, prevDice, easterEgg, onPhaseDone, effect }) {
  const [flyKey, setFlyKey] = useState(0);
  const [spinSeed, setSpinSeed] = useState(0);
  const [fxRun, setFxRun] = useState(0);      // 演出を再生するたびに増やすキー
  const outerRef = useRef(null);              // お椀全体（炎・カットインの座標基準＆着弾シェイク）
  const dieRefs  = useRef([null,null,null]);  // 落下中サイコロ3個（炎が追従する）

  useEffect(()=>{
    if(phase==='shaking'){ const t=setTimeout(()=>onPhaseDone('shaking'),480); return()=>clearTimeout(t); }
    if(phase==='flying'){
      setSpinSeed(Math.floor(Math.random()*3));  // 投げるたびに回転を変えて変化を出す
      setFlyKey(k=>k+1);
      if(effect) setFxRun(k=>k+1);               // この回に演出があれば再生
      const t=setTimeout(()=>onPhaseDone('flying'),1300);
      return()=>clearTimeout(t);
    }
  },[phase]);

  const showDice = phase==='settled' ? dice : phase==='idle' ? prevDice : null;
  const dimDice  = phase==='idle';

  return (
    <div ref={outerRef} style={{position:'relative', width:'100%', maxWidth:360, margin:'0 auto'}}>
      {/* 正円のお椀 */}
      <div style={{
        position:'relative', paddingBottom:'100%', zIndex:1,
        animation: phase==='shaking' ? 'bowlShake .48s ease-in-out' : 'none',
      }}>
        <div style={{
          position:'absolute', inset:0,
          borderRadius:'50%',
          background:'radial-gradient(ellipse at 40% 34%, #fafaf8 0%, #f2efe8 11%, #eae6de 25%, #ddd9d0 42%, #cec9c0 56%, #b2aea4 68%, #8c887e 78%, #5a5650 88%, #262220 96%, #0c0a08 100%)',
          boxShadow:'0 16px 55px rgba(0,0,0,.92), 0 5px 18px rgba(0,0,0,.6), inset 0 10px 36px rgba(255,255,255,.55), inset 0 -18px 52px rgba(0,0,0,.44), inset 18px 0 28px rgba(0,0,0,.08), inset -12px 0 22px rgba(0,0,0,.06)',
          overflow:'hidden',
        }}>
          {/* 光の反射 */}
          <div style={{position:'absolute',width:'36%',height:'18%',top:'12%',left:'22%',background:'radial-gradient(ellipse,rgba(255,255,255,.38) 0%,transparent 70%)',borderRadius:'50%',filter:'blur(4px)',pointerEvents:'none'}}/>

          {/* 着地したサイコロ — 重ならない「品」の字に整列 */}
          {showDice && FINAL_POS.map((pos, i) => {
            // ションベンで飛び出す1個は、お椀の外まで飛べるよう
            // overflow:hidden の外側（下のオーバーレイ）で描画する。ここでは出さない。
            if(easterEgg && i===1) return null;
            return (
              <div key={i} style={{
                position:'absolute', left:pos.left, top:pos.top,
                transform:'translate(-50%,-50%)',
                opacity: dimDice ? 0.48 : 1,
                transition:'opacity .3s',
              }}>
                <Die value={showDice[i]} size={SETTLE_SIZE}/>
              </div>
            );
          })}
        </div>
      </div>

      {/* 期待感演出（炎＋カットイン）。お椀全体に重ねる。
          演出が無い回（effect が null）は丸ごと描画しない＝余計な canvas を DOM に置かない。 */}
      {effect && <FxLayer runId={fxRun} effect={effect} bowlRef={outerRef} dieRefs={dieRefs}/>}

      {/* 飛んでくるサイコロ — 広く大きく → 縮みながら品の字へ（位置・大きさ・回転を分離）*/}
      {phase==='flying' && dice && (
        <div key={`fly-${flyKey}`} style={{position:'absolute', inset:0, pointerEvents:'none', zIndex:4}}>
          {/* グループ全体の落下（上下）*/}
          <div style={{position:'absolute', inset:0, willChange:'transform', animation:`diceDrop ${DICE_DUR} ${DICE_EASE} both`}}>
            {dice.map((val, i) => (
              // 位置(間隔)レイヤー（炎がこの中心を追従する）
              <div key={i} ref={el=>{ dieRefs.current[i]=el; }} style={{
                position:'absolute',
                transform:'translate(-50%,-50%)',
                willChange:'transform',
                animation:`${POS_NAMES[i]} ${DICE_DUR} ${DICE_EASE} both`,
              }}>
                {/* 大きさレイヤー */}
                <div style={{willChange:'transform', animation:`diceScale ${DICE_DUR} ${DICE_EASE} both`}}>
                  {/* 回転は Die 内部の立体キューブにかける（紙ぺらぺら防止）*/}
                  <Die value={val} size={FLY_SIZE} spin={SPIN_NAMES[(i+spinSeed)%3]}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ションベン：1個だけお椀の外へ飛び出して消える（overflow外なので画面外まで飛べる）*/}
      {easterEgg && showDice && (
        <div style={{position:'absolute', inset:0, pointerEvents:'none', zIndex:11, overflow:'visible'}}>
          <div style={{position:'absolute', left:FINAL_POS[1].left, top:FINAL_POS[1].top, transform:'translate(-50%,-50%)'}}>
            <div style={{animation:'dieOut 1.4s cubic-bezier(.3,.8,.9,.2) forwards','--ox':'120px','--oy':'-320px'}}>
              <Die value={showDice[1]} size={SETTLE_SIZE}/>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ ROLL COUNTER ═══════════════════════════════════════
// 振り直し回数を3つのドットで表示（数字なし）。使った分だけ点灯。
function RollCounter({ count, max=3 }) {
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:9,
      padding:'9px 7px',borderRadius:14,background:'rgba(0,0,0,.32)',border:'1px solid rgba(255,255,255,.07)'}}>
      {Array.from({length:max},(_,i)=>{
        const on = i<count;
        return (
          <div key={i} style={{
            width:13, height:13, borderRadius:'50%',
            background: on ? 'radial-gradient(circle at 34% 30%, #ffe08a, #f5c842 60%, #d6a324)' : 'rgba(255,255,255,.08)',
            border: on ? '1px solid rgba(255,224,138,.9)' : '1px solid rgba(255,255,255,.16)',
            boxShadow: on ? '0 0 10px rgba(245,200,66,.7)' : 'inset 0 1px 2px rgba(0,0,0,.5)',
            transition:'all .3s',
          }}/>
        );
      })}
    </div>
  );
}

// ═══ SETUP SCREEN ═══════════════════════════════════════
function SetupScreen({ players, setPlayers, parentIdx, setParentIdx, onStart, onSettings, onStats }) {
  const [name, setName] = useState('');

  const addP = () => {
    const n=name.trim();
    if(!n||players.length>=8) return;
    setPlayers(p=>[...p,{id:uid(),name:n,score:0}]);
    setName('');
  };
  const removeP = (id) => setPlayers(p=>{
    const np=p.filter(x=>x.id!==id);
    if(parentIdx>=np.length) setParentIdx(Math.max(0,np.length-1));
    return np;
  });

  return (
    <div style={{minHeight:'100dvh',display:'flex',flexDirection:'column',padding:'20px 16px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:24}}>
        <div>
          <div style={{fontSize:30,fontWeight:900,color:'#f5c842',lineHeight:1.1}}>🎲 チンチロ</div>
          <div style={{fontSize:11,color:'#555',marginTop:3}}>フリーモード</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          <button className="btn btn-g" style={{fontSize:14,padding:'8px 12px'}} onClick={onStats}>📊</button>
          <button className="btn btn-g" style={{fontSize:14,padding:'8px 12px'}} onClick={onSettings}>⚙️</button>
        </div>
      </div>

      <div style={{display:'flex',justifyContent:'center',gap:14,marginBottom:26}}>
        {[2,5,4].map((v,i)=><Die key={i} value={v} size={52}/>)}
      </div>

      <div style={{display:'flex',gap:8,marginBottom:14}}>
        <input type="text" value={name} onChange={e=>setName(e.target.value)}
          onKeyDown={e=>e.key==='Enter'&&addP()}
          placeholder="プレイヤー名..." style={{flex:1}} maxLength={8}/>
        <button className="btn btn-y" style={{padding:'11px 16px',fontSize:14}} onClick={addP} disabled={!name.trim()||players.length>=8}>追加</button>
      </div>

      {players.length>0 ? (
        <>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <div style={{fontSize:12,color:'#555'}}>{players.length}/8人 — タップで親を選択</div>
            <button onClick={()=>setPlayers(p=>p.map(x=>({...x,score:0})))} style={{fontSize:11,color:'#555',background:'none',border:'none',cursor:'pointer',textDecoration:'underline'}}>スコアリセット</button>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:8,flex:1}}>
            {players.map((p,i)=>(
              <div key={p.id} style={{display:'flex',alignItems:'center',gap:10,padding:'11px 13px',background:parentIdx===i?'rgba(245,200,66,.12)':'rgba(255,255,255,.05)',borderRadius:12,border:`1px solid ${parentIdx===i?'rgba(245,200,66,.35)':'rgba(255,255,255,.08)'}`,cursor:'pointer',transition:'all .15s'}} onClick={()=>setParentIdx(i)}>
                <div style={{fontSize:18,width:24,textAlign:'center'}}>{parentIdx===i?'👑':'　'}</div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:16}}>{p.name}</div>
                  <div style={{fontSize:10,color:parentIdx===i?'#f5c842':'#555'}}>{parentIdx===i?'親（タップで変更）':'子'}</div>
                </div>
                <div style={{fontSize:20,fontWeight:900,minWidth:44,textAlign:'right',color:p.score>0?'#44cc88':p.score<0?'#ff5555':'#888'}}>{fmt(p.score)}</div>
                <button onClick={e=>{e.stopPropagation();removeP(p.id);}} style={{width:26,height:26,borderRadius:6,background:'rgba(255,50,50,.15)',border:'none',color:'#ff6666',cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center'}}>×</button>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:10,color:'#444'}}>
          <div style={{fontSize:40}}>🎲</div>
          <div style={{fontSize:15}}>プレイヤーを追加してください</div>
          <div style={{fontSize:12,color:'#333'}}>最低2人から遊べます</div>
        </div>
      )}

      <button className="btn btn-y" style={{fontSize:18,padding:'15px',marginTop:20,borderRadius:14,fontWeight:900}} onClick={onStart} disabled={players.length<2}>
        ゲームスタート →
      </button>
    </div>
  );
}

// ═══ BETTING SCREEN ══════════════════════════════════════
function BettingScreen({ children, betStep, currentBet, onAdd, onReset, onConfirm, round, bets }) {
  const cur = children[betStep];
  return (
    <div style={{minHeight:'calc(100dvh - 56px)',display:'flex',flexDirection:'column',padding:'16px'}}>
      <div style={{textAlign:'center',marginBottom:20}}>
        <div style={{fontSize:11,color:'#888',marginBottom:3}}>ベット入力</div>
        <div style={{fontSize:24,fontWeight:900,marginBottom:2}}>{cur?.name}さんのベット</div>
        <div style={{fontSize:12,color:'#888'}}>{betStep+1} / {children.length}人目</div>
      </div>

      <div style={{display:'flex',justifyContent:'center',gap:8,marginBottom:28}}>
        {children.map((c,i)=>(
          <div key={c.id} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:3}}>
            <div style={{width:28,height:28,borderRadius:'50%',background:i<betStep?'#44cc88':i===betStep?'#f5c842':'rgba(255,255,255,.1)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:i===betStep?'#1a0800':'#f0f0f0',transition:'background .3s'}}>
              {i<betStep?'✓':i+1}
            </div>
            <div style={{fontSize:9,color:i===betStep?'#f5c842':'#555',whiteSpace:'nowrap',maxWidth:38,textAlign:'center',overflow:'hidden',textOverflow:'ellipsis'}}>{c.name}</div>
          </div>
        ))}
      </div>

      <div style={{textAlign:'center',marginBottom:20}}>
        <div style={{fontSize:13,color:'#888',marginBottom:4}}>ベット額</div>
        <div style={{fontSize:48,fontWeight:900,color:'#f5c842',fontFamily:'monospace',letterSpacing:'.04em',lineHeight:1.1}}>
          ₿{currentBet.toLocaleString()}
        </div>
      </div>

      <div style={{display:'flex',gap:10,justifyContent:'center',marginBottom:16}}>
        {CHIP_VALS.map(v=>{
          const {bg,tx,lb}=CHC[v];
          return (
            <button key={v} onClick={()=>onAdd(v)} style={{width:54,height:54,borderRadius:'50%',background:bg,color:tx,fontWeight:700,fontSize:12,border:'3.5px dashed rgba(255,255,255,.38)',cursor:'pointer',boxShadow:'0 4px 12px rgba(0,0,0,.4)',fontFamily:'Noto Sans JP'}}
              onMouseDown={e=>e.currentTarget.style.transform='scale(.88)'}
              onMouseUp={e=>e.currentTarget.style.transform='none'}
              onMouseLeave={e=>e.currentTarget.style.transform='none'}
            >{lb}</button>
          );
        })}
      </div>

      {currentBet>0&&(
        <div style={{textAlign:'center',marginBottom:8}}>
          <button className="btn btn-g" style={{fontSize:12,padding:'6px 14px'}} onClick={onReset}>リセット</button>
        </div>
      )}

      <div style={{marginTop:'auto',paddingTop:14}}>
        <div style={{fontSize:11,color:'#666',marginBottom:7,textAlign:'center',letterSpacing:'.06em'}}>ベット状況</div>
        <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:14}}>
          {children.map((c,i)=>{
            const done=i<betStep, isCur=i===betStep;
            const amount = done ? (bets?.[c.id]||0) : isCur ? currentBet : null;
            return (
              <div key={c.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 12px',borderRadius:10,background:isCur?'rgba(245,200,66,.1)':'rgba(255,255,255,.04)',border:`1px solid ${isCur?'rgba(245,200,66,.3)':'rgba(255,255,255,.06)'}`}}>
                <div style={{display:'flex',alignItems:'center',gap:9}}>
                  <div style={{width:26,height:26,borderRadius:'50%',background:done?'#44cc88':isCur?'#f5c842':'rgba(255,255,255,.12)',color:done||isCur?'#1a0800':'#aaa',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:12}}>{done?'✓':c.name.slice(0,1)}</div>
                  <span style={{fontSize:14,fontWeight:700,color:isCur?'#f5c842':'#ddd'}}>{c.name}</span>
                </div>
                <span style={{fontSize:15,fontWeight:900,fontFamily:'monospace',color:done?'#44cc88':isCur?'#f5c842':'#555'}}>{amount==null?'—':`₿${amount.toLocaleString()}`}</span>
              </div>
            );
          })}
        </div>
        <button className="btn btn-y" style={{width:'100%',fontSize:17,padding:'14px',borderRadius:14,fontWeight:900}} onClick={onConfirm} disabled={currentBet<MIN_BET}>
          {currentBet<MIN_BET ? `最低 ₿${MIN_BET} からベットできます` : `₿${currentBet.toLocaleString()} で確定`}
        </button>
      </div>
    </div>
  );
}

// ═══ PLAYER STRIP (振る画面の下部：出目・ベット確認) ═══════
function PlayerStrip({ roster }) {
  return (
    <div style={{display:'flex',gap:10,overflowX:'auto',width:'100%',padding:'4px 2px 6px',justifyContent: roster.length<=4 ? 'center' : 'flex-start'}}>
      {roster.map(r=>{
        const c = RC[r.res?.t]?.c || '#888';
        return (
          <div key={r.id} style={{
            flex:'0 0 auto', width:96, padding:'12px 8px', borderRadius:16,
            background: r.isCurrent ? 'rgba(245,200,66,.16)' : 'rgba(255,255,255,.05)',
            border:`1.5px solid ${r.isCurrent ? 'rgba(245,200,66,.5)' : 'rgba(255,255,255,.08)'}`,
            boxShadow: r.isCurrent ? '0 0 16px rgba(245,200,66,.18)' : 'none',
            display:'flex', flexDirection:'column', alignItems:'center', gap:7,
          }}>
            <div style={{position:'relative'}}>
              <div style={{
                width:48, height:48, borderRadius:'50%',
                background: r.isParent ? 'linear-gradient(145deg,#ffe08a,#c89a20)' : 'linear-gradient(145deg,rgba(255,255,255,.2),rgba(255,255,255,.07))',
                color: r.isParent ? '#1a0800' : '#f0f0f0',
                display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:22,
                boxShadow:'inset 0 1px 3px rgba(255,255,255,.3), 0 2px 6px rgba(0,0,0,.4)',
              }}>{r.name.slice(0,1)}</div>
              {r.isParent && <div style={{position:'absolute', top:-13, left:'50%', transform:'translateX(-50%)', fontSize:17}}>👑</div>}
            </div>
            <div style={{fontSize:12, fontWeight:700, color:r.isCurrent?'#f5c842':'#bbb', maxWidth:88, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{r.name}</div>
            <div style={{fontSize:16, fontWeight:900, color:c, minHeight:21, textAlign:'center', lineHeight:1.1,
              textShadow: r.res ? `0 0 12px ${RC[r.res?.t]?.s||'transparent'}` : 'none'}}>
              {r.res ? r.res.l : (r.isCurrent ? '…' : '—')}
            </div>
            <div style={{fontSize:13, fontWeight:900, fontFamily:'monospace', color: r.isParent ? '#c9a84c' : (r.bet>0 ? '#f0f0f0' : '#666')}}>
              {r.isParent ? '親' : (r.bet>0 ? `₿${r.bet.toLocaleString()}` : '—')}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ═══ ROLLING SCREEN ══════════════════════════════════════
function RollingScreen({ player, isParent, bet, round, onComplete, childList, bets, childRes, parent, parentRes, rollStep, gameCount, forcePinzoro, effectsOn }) {
  const [history, setHistory] = useState([]);
  const [finalRes, setFinalRes] = useState(null);
  const [bowlPhase, setBowlPhase] = useState('idle');
  const [curDice, setCurDice] = useState(null);
  const [prevDice, setPrevDice] = useState(null);
  const [easterEgg, setEasterEgg] = useState(false);
  const [canProceed, setCanProceed] = useState(false);
  const [rollEffect, setRollEffect] = useState(null);   // この回の期待感演出（炎/カットイン/なし）

  const rollCount = history.length;
  const lastRes = history[rollCount-1]?.res;
  const canRoll = !finalRes && rollCount<3 && (bowlPhase==='idle' || bowlPhase==='settled');

  const handleRoll = () => {
    if(!canRoll) return;
    // ゲームのテンポ維持：結果が確定した累計が50の倍数になるターンは、最初の一投を必ずピンゾロにする。
    // （プレイヤーには条件を見せない。ピンゾロは即・役確定なので振り直しも起こらない。）
    const mustPinzoro = forcePinzoro && rollCount===0;
    const dice = mustPinzoro ? [1,1,1] : rollDice();
    // 1%（1/100）の確率でションベン＝サイコロがお椀の外へ飛び出す（即・負け）。1回振るごとに判定。
    // ただし強制ピンゾロのターンはションベン判定を無効化する（必ずピンゾロを出すため）。
    const isShonben = !mustPinzoro && Math.random() < 0.01;
    const res = isShonben
      ? { t:'shonben', l:'ションベン', sk:'ションベン', v:null }
      : classify(dice);
    setCurDice(dice);
    // 期待感演出を抽選（出目が出た後・見た目だけ）。ションベンは演出なし。
    // 演出OFF（effectsOn=false）のときは抽選結果を使わず null＝炎・カットインを一切出さない。
    // ※ pickEffect は出目が決まった後の「見た目だけ」の抽選なので、ON/OFFは役の確率・勝敗に一切影響しない。
    setRollEffect((isShonben || !effectsOn) ? null : pickEffect(res));
    const nh = [...history, {dice, res}];
    setHistory(nh);
    setBowlPhase('shaking');
    if(isShonben) setEasterEgg(true);   // 1個が飛び出す演出を発動

    const isFinal = res.t !== 'menashi'; // ションベンも即確定（t!=='menashi'）
    const isLast  = nh.length >= 3;

    if(isFinal) {
      setTimeout(()=>{ setFinalRes(res); setCanProceed(true); }, 1500);
    } else if(isLast) {
      // 3回振っても目がそろわなかったら「目なし」で確定。
      setTimeout(()=>{ setFinalRes(res); setCanProceed(true); }, 1500);
    }
  };

  const onPhaseDone = (ph) => {
    if(ph==='shaking') setBowlPhase('flying');
    if(ph==='flying') { setPrevDice(curDice); setBowlPhase('settled'); }
  };

  const handleNext = () => onComplete(history, finalRes);

  // 画面タップ：まだ振れるなら振る／結果が出ていれば次へ進む
  const handleTap = () => {
    if(canRoll) handleRoll();
    else if(canProceed) handleNext();
  };

  const col = RC[finalRes?.t]?.c || '#f0f0f0';
  const glow = RC[finalRes?.t]?.s || 'transparent';

  // 下部ストリップ用：子→親の順で、出目とベットをまとめる
  const roster = [
    ...(childList||[]).map((ch,i)=>({
      id: ch.id,
      name: ch.name,
      bet: bets?.[ch.id] || 0,
      res: (!isParent && i===rollStep) ? finalRes : (childRes?.[ch.id] || null),
      isParent: false,
      isCurrent: !isParent && i===rollStep,
    })),
    ...(parent ? [{
      id: parent.id,
      name: parent.name,
      bet: 0,
      res: isParent ? finalRes : (parentRes || null),
      isParent: true,
      isCurrent: isParent,
    }] : []),
  ];

  return (
    <div style={{position:'relative',display:'flex',flexDirection:'column',alignItems:'center',minHeight:'calc(100dvh - 56px)',padding:'12px 14px 20px'}}>
      {/* 左上：ゲーム全体での「結果が確定した通し番号」 */}
      <div style={{position:'absolute',left:10,top:8,zIndex:6,display:'flex',alignItems:'baseline',gap:4,
        background:'rgba(245,200,66,.12)',border:'1px solid rgba(245,200,66,.35)',borderRadius:10,padding:'4px 11px'}}>
        <span style={{fontSize:10,fontWeight:900,color:'#9a8a55',letterSpacing:'.14em'}}>GAME</span>
        <span style={{fontSize:20,fontWeight:900,color:'#f5c842',lineHeight:1,fontFamily:'monospace'}}>{gameCount}</span>
      </div>
      {/* 上半分：タップ／クリックで「振る」または「次へ」 */}
      <div
        onClick={handleTap}
        style={{width:'100%',display:'flex',flexDirection:'column',alignItems:'center',cursor:(canRoll||canProceed)?'pointer':'default',WebkitUserSelect:'none',userSelect:'none'}}
      >
        <div style={{textAlign:'center',marginBottom:14,animation:'fadeIn .3s'}}>
          {isParent&&<div style={{fontSize:11,color:'#f5c842',letterSpacing:'.12em',marginBottom:3}}>👑 親</div>}
          <div style={{fontSize:22,fontWeight:900}}>{player.name}さんの番</div>
          {!isParent&&bet>0&&<div style={{fontSize:12,color:'#888',marginTop:2}}>ベット ₿{bet.toLocaleString()}</div>}
        </div>

        <div style={{position:'relative',width:'100%'}}>
          <div style={{position:'absolute',left:2,top:'50%',transform:'translateY(-50%)',zIndex:5}}>
            <RollCounter count={rollCount}/>
          </div>
          <Bowl phase={bowlPhase} dice={curDice} prevDice={prevDice} easterEgg={easterEgg} onPhaseDone={onPhaseDone} effect={rollEffect}/>
        </div>

        <div style={{minHeight:64,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',marginTop:10,gap:6}}>
          {finalRes && (
            <div style={{fontSize:44,fontWeight:900,color:col,textShadow:`0 0 30px ${glow}, 0 2px 8px rgba(0,0,0,.6)`,animation:'reveal .5s cubic-bezier(.2,1.5,.5,1)',letterSpacing:'.03em',lineHeight:1.05,textAlign:'center'}}>
              {finalRes.l}
            </div>
          )}
          {!finalRes && lastRes?.t==='menashi' && rollCount<3 && (
            <div style={{fontSize:13,color:'#555',animation:'fadeIn .3s'}}>目なし... あと{3-rollCount}回振れます</div>
          )}
          {!finalRes && canRoll && (
            <div style={{fontSize:15,color:'#f5c842',fontWeight:700,animation:'fadeIn .3s'}}>
              {rollCount===0 ? '🎲 タップして振る' : `🎲 タップして振る（あと${3-rollCount}回）`}
            </div>
          )}
          {canProceed && (
            <div style={{fontSize:14,color:'#f5c842',fontWeight:700,animation:'fadeIn .4s'}}>
              タップして{isParent ? '結果へ' : '次へ'} →
            </div>
          )}
        </div>
      </div>

      {/* 下部：プレイヤー一覧（出目・ベット確認）*/}
      <div style={{marginTop:'auto',paddingTop:12,display:'flex',flexDirection:'column',gap:12,alignItems:'center',width:'100%'}}>
        <PlayerStrip roster={roster}/>
      </div>
    </div>
  );
}

// ═══ RESULTS SCREEN ══════════════════════════════════════
// 数値を from→to へ徐々に増減させる（RPGの経験値風カウントアップ/ダウン）
function useCountUp(to, from = 0, duration = 1300, delay = 350) {
  const [val, setVal] = useState(from);
  useEffect(() => {
    let raf, t0 = null;
    const tm = setTimeout(() => {
      const step = (now) => {
        if (t0 === null) t0 = now;
        const p = Math.min((now - t0) / duration, 1);
        const e = 1 - Math.pow(1 - p, 3); // easeOutCubic
        setVal(Math.round(from + (to - from) * e));
        if (p < 1) raf = requestAnimationFrame(step);
        else setVal(to);
      };
      raf = requestAnimationFrame(step);
    }, delay);
    return () => { clearTimeout(tm); if (raf) cancelAnimationFrame(raf); };
  }, [to, from, duration, delay]);
  return val;
}

// スコアボードの1行：旧スコア→新スコアへ滑らかに増減＋バー＋増減バッジ
function ScoreRow({ name, initial, isParent, medal, res, delta, newScore, maxAbs, delay }) {
  const oldScore = newScore - delta;
  const val = useCountUp(newScore, oldScore, 1300, delay);
  const [showDelta, setShowDelta] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShowDelta(true), delay); return () => clearTimeout(t); }, [delay]);

  const scoreCol = val > 0 ? '#44cc88' : val < 0 ? '#ff5555' : '#aaa';
  const barPct = maxAbs > 0 ? Math.min(Math.abs(val) / maxAbs * 100, 100) : 0;
  const dCol = delta > 0 ? '#44cc88' : delta < 0 ? '#ff5555' : '#888';

  return (
    <div style={{ padding:'12px 14px', borderRadius:14, marginBottom:10,
      background: isParent ? 'rgba(245,200,66,.08)' : 'rgba(255,255,255,.045)',
      border:`1px solid ${isParent ? 'rgba(245,200,66,.32)' : 'rgba(255,255,255,.08)'}`,
      animation:'slideUp .4s' }}>
      <div style={{ display:'flex', alignItems:'center', gap:11 }}>
        <div style={{ position:'relative', flexShrink:0 }}>
          <div style={{ width:42, height:42, borderRadius:'50%',
            background: isParent ? 'linear-gradient(145deg,#ffe08a,#c89a20)' : 'linear-gradient(145deg,rgba(255,255,255,.2),rgba(255,255,255,.07))',
            color: isParent ? '#1a0800' : '#f0f0f0',
            display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:19,
            boxShadow:'inset 0 1px 3px rgba(255,255,255,.3), 0 2px 6px rgba(0,0,0,.4)' }}>{name.slice(0,1)}</div>
          {medal && <div style={{ position:'absolute', top:-9, left:-7, fontSize:16 }}>{medal}</div>}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:15, fontWeight:700, color:'#eee', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{isParent ? '👑 ' : ''}{name}</span>
            <span style={{ fontSize:12, fontWeight:700, color: RC[res?.t]?.c || '#888' }}>{res?.l || ''}</span>
          </div>
          {/* スコアバー（滑らかに増減）*/}
          <div style={{ marginTop:7, height:8, borderRadius:5, background:'rgba(0,0,0,.45)', overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${barPct}%`,
              background: val >= 0 ? 'linear-gradient(90deg,#2e9e6a,#44cc88)' : 'linear-gradient(90deg,#cc4444,#ff5555)',
              boxShadow:`0 0 8px ${scoreCol}`, transition:'width .12s linear', borderRadius:5 }}/>
          </div>
        </div>
        <div style={{ textAlign:'right', flexShrink:0, minWidth:74 }}>
          <div style={{ fontSize:24, fontWeight:900, fontFamily:'monospace', color:scoreCol, lineHeight:1,
            textShadow:`0 0 12px ${val>0?'rgba(68,204,136,.4)':val<0?'rgba(255,85,85,.4)':'transparent'}` }}>
            {val > 0 ? '+' : ''}{val.toLocaleString()}
          </div>
          {showDelta && delta !== 0 && (
            <div style={{ fontSize:13, fontWeight:900, color:dCol, marginTop:3, animation:'popIn .4s' }}>
              {delta > 0 ? '▲+' : '▼'}{Math.abs(delta).toLocaleString()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultsScreen({ players, parentIdx, bets, childRes, parentRes, payouts, deltas, onNext }) {
  const parent = players[parentIdx];
  const children = getChildren(players, parentIdx);
  const sorted = [...players].sort((a,b)=>b.score-a.score);
  const maxAbs = Math.max(1, ...players.map(p=>Math.abs(p.score)));
  const roleOf = (p) => p.id===parent?.id ? parentRes : childRes[p.id];

  return (
    <div style={{minHeight:'calc(100dvh - 56px)',padding:'14px 16px',display:'flex',flexDirection:'column'}}>
      {/* 役のサマリー（コンパクト）*/}
      <div style={{display:'flex',flexWrap:'wrap',gap:7,justifyContent:'center',marginBottom:16,animation:'fadeIn .3s'}}>
        {[parent, ...children].filter(Boolean).map(pl => {
          const r = roleOf(pl);
          return (
            <div key={pl.id} style={{display:'flex',alignItems:'center',gap:5,padding:'4px 10px',borderRadius:20,
              background:'rgba(255,255,255,.05)',border:'1px solid rgba(255,255,255,.08)'}}>
              <span style={{fontSize:11,color:'#aaa'}}>{pl.id===parent?.id?'👑':''}{pl.name}</span>
              <span style={{fontSize:12,fontWeight:900,color:RC[r?.t]?.c||'#888'}}>{r?.l||'?'}</span>
            </div>
          );
        })}
      </div>

      {/* 主役：スコアボード */}
      <div style={{fontSize:12,color:'#f5c842',fontWeight:900,letterSpacing:'.14em',textAlign:'center',marginBottom:12}}>★ スコアボード ★</div>
      <div style={{marginBottom:8}}>
        {sorted.map((p,i) => (
          <ScoreRow
            key={p.id}
            name={p.name}
            isParent={p.id===parent?.id}
            medal={i===0?'🥇':i===1?'🥈':i===2?'🥉':''}
            res={roleOf(p)}
            delta={deltas?.[p.id]||0}
            newScore={p.score}
            maxAbs={maxAbs}
            delay={400 + i*220}
          />
        ))}
      </div>

      <button className="btn btn-y" style={{fontSize:17,padding:'14px',borderRadius:14,fontWeight:900,marginTop:'auto'}} onClick={onNext}>
        次のラウンドへ →
      </button>
    </div>
  );
}

// ═══ STATS SCREEN ════════════════════════════════════════
// 履歴用のミニサイコロ（出目の絵）。pip 位置は % 指定。
const HISTORY_PIP = {
  1:[[50,50]], 2:[[28,28],[72,72]], 3:[[28,28],[50,50],[72,72]],
  4:[[28,28],[72,28],[28,72],[72,72]],
  5:[[28,28],[72,28],[50,50],[28,72],[72,72]],
  6:[[28,28],[72,28],[28,50],[72,50],[28,72],[72,72]],
};
function HistoryDie({ v }) {
  return (
    <div style={{width:22,height:22,borderRadius:5,background:'#fafafa',position:'relative',boxShadow:'0 1px 2px rgba(0,0,0,.3)',flex:'none'}}>
      {(HISTORY_PIP[v]||[]).map(([x,y],i)=>(
        <span key={i} style={{position:'absolute',width:4,height:4,borderRadius:'50%',background:'#222',left:x+'%',top:y+'%',transform:'translate(-50%,-50%)'}}/>
      ))}
    </div>
  );
}
function StatsScreen({ stats, history, onBack, onReset }) {
  const { totalThrows:tt, totalTurns:tu } = stats;
  return (
    <div style={{minHeight:'100dvh',padding:'16px'}}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
        <button className="btn btn-g" style={{fontSize:14,padding:'8px 13px'}} onClick={onBack}>← 戻る</button>
        <div style={{fontSize:20,fontWeight:700,flex:1}}>📊 出目統計</div>
        <button onClick={onReset} style={{background:'rgba(255,50,50,.15)',border:'none',color:'#ff6666',borderRadius:8,padding:'6px 12px',cursor:'pointer',fontSize:13}}>リセット</button>
      </div>
      <div style={{fontSize:12,color:'#555',marginBottom:14,display:'flex',gap:16}}>
        <span>総投数: <span style={{color:'#f5c842'}}>{tt.toLocaleString()}</span></span>
        <span>総ターン: <span style={{color:'#f5c842'}}>{tu.toLocaleString()}</span></span>
      </div>
      <div style={{borderRadius:12,overflow:'hidden',border:'1px solid rgba(255,255,255,.1)'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead>
            <tr style={{background:'rgba(255,255,255,.08)'}}>
              {['役','回数','出現率','理論値'].map(h=>(
                <td key={h} style={{padding:'9px 10px',fontSize:12,color:'#888',textAlign:h==='役'?'left':'center'}}>{h}</td>
              ))}
            </tr>
          </thead>
          <tbody>
            {STAT_KEYS.map((key,i) => {
              const count = stats.counts[key]||0;
              const denom = key==='ションベン' ? tu : tt;
              const rate  = denom>0 ? count/denom : 0;
              const theo  = THEORY[key]||0;
              return (
                <tr key={key} style={{background:i%2===0?'rgba(255,255,255,.03)':'transparent',borderTop:'1px solid rgba(255,255,255,.06)'}}>
                  <td style={{padding:'9px 10px',fontWeight:count>0?600:400,color:count>0?'#f0f0f0':'#444',fontSize:13}}>
                    {key}{key==='ションベン'&&<span style={{fontSize:9,color:'#555',marginLeft:3}}>(ターン比)</span>}
                  </td>
                  <td style={{padding:'9px',textAlign:'center',color:'#f0f0f0',fontSize:13,fontWeight:count>0?700:400}}>{count}</td>
                  <td style={{padding:'9px',textAlign:'center',color:'#f5c842',fontSize:13,fontWeight:600}}>{(rate*100).toFixed(1)}%</td>
                  <td style={{padding:'9px 10px',textAlign:'center',color:'#555',fontSize:12}}>{(theo*100).toFixed(1)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 最新の出目履歴（確定した結果だけ・新しい順・最大100件）。ホームに戻るとリセット。 */}
      <div style={{marginTop:24}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
          <div style={{fontSize:14,fontWeight:900}}>🎲 最新の出目履歴</div>
          <span style={{fontSize:10,color:'#9a8a55',background:'rgba(245,200,66,.12)',border:'1px solid rgba(245,200,66,.3)',borderRadius:6,padding:'2px 7px',fontWeight:700}}>直近100件</span>
        </div>
        <div style={{fontSize:11,color:'#666',marginBottom:10}}>確定した結果のみ・新しい順。ホームに戻るとこの履歴はリセットされます。</div>
        {(!history || history.length===0) ? (
          <div style={{padding:'18px',textAlign:'center',color:'#555',fontSize:13,border:'1px solid rgba(255,255,255,.1)',borderRadius:12}}>
            まだ履歴がありません
          </div>
        ) : (
          <div style={{borderRadius:12,overflow:'hidden',border:'1px solid rgba(255,255,255,.1)'}}>
            {history.map((h,i)=>(
              <div key={h.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 12px',borderTop:i===0?'none':'1px solid rgba(255,255,255,.05)',background:i%2===1?'rgba(255,255,255,.03)':'transparent'}}>
                <span style={{fontSize:11,color:'#555',width:38,flex:'none',fontFamily:'monospace',textAlign:'right'}}>{h.serial}</span>
                <div style={{display:'flex',gap:5,flex:'none'}}>
                  {h.dice.map((v,j)=><HistoryDie key={j} v={v}/>)}
                </div>
                <span style={{marginLeft:'auto',fontSize:14,fontWeight:700,color:RC[h.t]?.c||'#888'}}>{h.l}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══ SETTINGS MODAL ══════════════════════════════════════
function SettingsModal({ rotation, setRotation, effectsOn, setEffectsOn, onClose }) {
  return (
    <div style={{position:'fixed',inset:0,zIndex:100,background:'rgba(0,0,0,.75)',display:'flex',alignItems:'flex-end'}} onClick={onClose}>
      <div style={{width:'100%',maxWidth:430,margin:'0 auto',background:'#1c1c1c',borderRadius:'20px 20px 0 0',padding:'24px 20px 40px',animation:'slideUp .3s'}} onClick={e=>e.stopPropagation()}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
          <div style={{fontSize:18,fontWeight:700}}>設定</div>
          <button onClick={onClose} style={{background:'none',border:'none',color:'#888',fontSize:24,cursor:'pointer',lineHeight:1}}>×</button>
        </div>
        <div style={{marginBottom:24}}>
          <div style={{fontSize:13,color:'#888',marginBottom:10}}>親の交代方法</div>
          {[{k:'auto',l:'🔄 時計回り（自動）',d:'毎ラウンド自動で時計回りに交代'},{k:'manual',l:'👆 手動で選択',d:'毎ラウンド手動で親を選べる'}].map(o=>(
            <button key={o.k} onClick={()=>setRotation(o.k)} style={{display:'block',width:'100%',padding:'12px 14px',borderRadius:10,textAlign:'left',cursor:'pointer',marginBottom:8,background:rotation===o.k?'rgba(245,200,66,.15)':'rgba(255,255,255,.06)',border:`1px solid ${rotation===o.k?'rgba(245,200,66,.4)':'rgba(255,255,255,.1)'}`,color:'#f0f0f0',fontFamily:'Noto Sans JP',transition:'all .15s'}}>
              <div style={{fontWeight:700,fontSize:15,marginBottom:2}}>{o.l}</div>
              <div style={{fontSize:11,color:'#888'}}>{o.d}</div>
            </button>
          ))}
        </div>

        {/* 演出 ON/OFF トグル。OFFにすると炎・カットイン等の盛り上げ演出を無効化する。
            ゲーム進行に必要な動き（サイコロ・画面遷移）や役の抽選確率には影響しない。 */}
        <div style={{marginBottom:24}}>
          <div style={{fontSize:13,color:'#888',marginBottom:10}}>演出</div>
          <div
            onClick={()=>setEffectsOn(!effectsOn)}
            style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',borderRadius:10,cursor:'pointer',
              background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.1)'}}>
            <div>
              <div style={{fontWeight:700,fontSize:15,marginBottom:2}}>🔥 演出 {effectsOn?'ON':'OFF'}</div>
              <div style={{fontSize:11,color:'#888'}}>炎・カットインなどの盛り上げ演出{effectsOn?'を表示します':'を表示しません'}</div>
            </div>
            {/* トグルスイッチ */}
            <div style={{position:'relative',width:48,height:28,borderRadius:14,flex:'none',transition:'background .2s',
              background:effectsOn?'#f5c842':'#555'}}>
              <div style={{position:'absolute',top:3,left:effectsOn?23:3,width:22,height:22,borderRadius:'50%',background:'#fff',
                transition:'left .2s',boxShadow:'0 1px 3px rgba(0,0,0,.4)'}}/>
            </div>
          </div>
        </div>

        <button className="btn btn-y" style={{width:'100%',padding:'13px',fontSize:16}} onClick={onClose}>完了</button>
      </div>
    </div>
  );
}

// ═══ PARENT SELECT MODAL ═════════════════════════════════
function ParentSelectModal({ players, onSelect, onCancel }) {
  return (
    <div style={{position:'fixed',inset:0,zIndex:100,background:'rgba(0,0,0,.8)',display:'flex',alignItems:'center',justifyContent:'center',padding:20}}>
      <div style={{background:'#1c1c1c',borderRadius:16,padding:24,width:'100%',maxWidth:380,animation:'popIn .3s'}}>
        <div style={{fontSize:18,fontWeight:700,textAlign:'center',marginBottom:16}}>👑 親を選んでください</div>
        {players.map((p,i)=>(
          <button key={p.id} className="btn btn-g" style={{width:'100%',padding:'13px 16px',fontSize:15,marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center'}} onClick={()=>onSelect(i)}>
            <span>{p.name}</span>
            <span style={{fontSize:16,fontWeight:900,color:p.score>0?'#44cc88':p.score<0?'#ff5555':'#888'}}>{fmt(p.score)}</span>
          </button>
        ))}
        <button className="btn btn-g" style={{display:'block',width:'100%',padding:'10px',fontSize:13,color:'#555',marginTop:4}} onClick={onCancel}>キャンセル</button>
      </div>
    </div>
  );
}

// ═══ MAIN APP ════════════════════════════════════════════
export default function App() {
  const [scr, setScr] = useState('setup');
  const [players, setPlayers] = useState([]);
  const [parentIdx, setParentIdx] = useState(0);
  const [rotation, setRotation] = useState('auto');
  const [effectsOn, setEffectsOn] = useState(true);  // 演出ON/OFF（炎・カットイン等）。デフォルトON。localStorageで保持。
  const [round, setRound] = useState(1);
  const [stats, setStats] = useState(INIT_STATS);
  const [showStats, setShowStats] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showParentSelect, setShowParentSelect] = useState(false);
  const [pendingNextRound, setPendingNextRound] = useState(false);

  const [bets, setBets] = useState({});
  const [betStep, setBetStep] = useState(0);
  const [curBet, setCurBet] = useState(0);
  const [children, setChildren] = useState([]);
  const [rollStep, setRollStep] = useState(0);
  const [childRes, setChildRes] = useState({});
  const [parentRes, setParentRes] = useState(null);
  const [payouts, setPayouts] = useState({});
  const [deltas, setDeltas] = useState({});      // 各プレイヤーの今ラウンドのスコア増減（結果画面の演出用）
  const [gameCount, setGameCount] = useState(1); // ゲーム全体で結果が確定した通し番号
  const [finalCount, setFinalCount] = useState(0); // ホームに戻るまでの「結果が確定した累計回数」。50ごとにピンゾロ。
  const FORCE_PINZORO_EVERY = 50;
  const [rollHistory, setRollHistory] = useState([]); // 最新の出目履歴（確定結果のみ・最大100件）。ホームでリセット。

  // localStorage を使って統計・設定を保存（ブラウザ対応版）
  useEffect(()=>{
    try {
      const d = localStorage.getItem('cc-stats');
      if(d) setStats(JSON.parse(d));
      const fx = localStorage.getItem('cc-effects');   // 演出ON/OFF（'1'=ON / '0'=OFF）
      if(fx!==null) setEffectsOn(fx==='1');
    } catch(e) {}
  },[]);

  const save = (s) => {
    try { localStorage.setItem('cc-stats', JSON.stringify(s)); } catch(e) {}
  };

  // 演出ON/OFFの切り替え（即反映＋localStorageへ保存）
  const updateEffects = (on) => {
    setEffectsOn(on);
    try { localStorage.setItem('cc-effects', on ? '1' : '0'); } catch(e) {}
  };

  const addStats = (history, finalRes) => {
    setStats(prev => {
      const counts = {...prev.counts};
      let totalThrows = prev.totalThrows;
      history.forEach(({res})=>{ counts[res.sk]=(counts[res.sk]||0)+1; totalThrows++; });
      if(finalRes.t==='shonben') counts['ションベン']=(counts['ションベン']||0)+1;
      const next = {counts, totalThrows, totalTurns:prev.totalTurns+1};
      save(next);
      return next;
    });
  };

  const beginRound = (pidx) => {
    const ch = getChildren(players, pidx);
    setChildren(ch);
    setBets({});
    setBetStep(0);
    setCurBet(0);
    setChildRes({});
    setParentRes(null);
    setPayouts({});
    setRollStep(0);
    setParentIdx(pidx);
    setScr('betting');
  };

  const startGame = () => {
    setGameCount(1);   // 新しいゲーム開始 → 通し番号は1から
    if(rotation==='manual'){ setShowParentSelect(true); return; }
    beginRound(parentIdx);
  };

  const confirmBet = () => {
    const ch = children[betStep];
    setBets(b=>({...b,[ch.id]:curBet}));
    setCurBet(0);
    if(betStep+1 < children.length){
      setBetStep(s=>s+1);
    } else {
      setRollStep(0);
      setScr('rolling');
    }
  };

  const onRollDone = (history, finalRes) => {
    addStats(history, finalRes);
    setGameCount(g=>g+1);   // 結果が1つ確定するたびに通し番号を+1
    setFinalCount(c=>c+1);  // ホームに戻るまでの累計（50ごとピンゾロ判定用）
    // 最新の出目履歴に「確定した結果」を1件追加（新しい順・最大100件）。
    const lastDice = history[history.length-1]?.dice || [0,0,0];
    setRollHistory(prev => {
      const serial = (prev[0]?.serial || 0) + 1;
      return [{ id: uid(), serial, dice: lastDice, t: finalRes.t, l: finalRes.l }, ...prev].slice(0,100);
    });
    const N = children.length;

    if(rollStep < N) {
      const ch = children[rollStep];
      const newCR = {...childRes, [ch.id]: finalRes};
      setChildRes(newCR);
      const next = rollStep+1;
      if(next < N){
        setRollStep(next);
        setScr('rolling');
      } else {
        setRollStep(N);
        setScr('rolling');
      }
    } else {
      setParentRes(finalRes);
      const newPay = {};
      const deltas = {};
      children.forEach(ch => {
        const cr = childRes[ch.id];
        const bet = bets[ch.id]||0;
        const {cd, pd} = calcPayout(finalRes, cr, bet);
        newPay[ch.id] = cd;
        deltas[ch.id] = (deltas[ch.id]||0)+cd;
        deltas[players[parentIdx].id] = (deltas[players[parentIdx].id]||0)+pd;
      });
      setPayouts(newPay);
      setDeltas(deltas);
      setPlayers(prev=>prev.map(p=>({...p, score:p.score+(deltas[p.id]||0)})));
      setScr('results');
    }
  };

  const nextRound = () => {
    if(rotation==='manual'){ setPendingNextRound(true); setShowParentSelect(true); return; }
    const next = (parentIdx+1)%players.length;
    setRound(r=>r+1);
    beginRound(next);
  };

  const N = children.length;
  const isParentRolling = rollStep >= N;
  const currentRoller = isParentRolling ? players[parentIdx] : (children[rollStep]||null);

  return (
    <>
      <style>{CSS}</style>

      {/* 出目統計は「閲覧専用オーバーレイ」。ゲーム画面（RollingScreen）はマウントしたまま＝
          ターン中の状態（確定出目・振り直し回数・進行など）を保持する。閉じると元の状態から再開。 */}
      {showStats && (
        <div style={{position:'fixed',top:0,bottom:0,left:0,right:0,maxWidth:430,margin:'0 auto',background:'#0d0d0d',zIndex:60,overflowY:'auto'}}>
          <StatsScreen stats={stats} history={rollHistory} onBack={()=>setShowStats(false)} onReset={()=>{setStats(INIT_STATS);save(INIT_STATS);}}/>
        </div>
      )}

      {showSettings && <SettingsModal rotation={rotation} setRotation={setRotation} effectsOn={effectsOn} setEffectsOn={updateEffects} onClose={()=>setShowSettings(false)}/>}

      {showParentSelect && (
        <ParentSelectModal
          players={players}
          onSelect={i=>{
            setShowParentSelect(false);
            if(pendingNextRound){ setPendingNextRound(false); setRound(r=>r+1); }
            beginRound(i);
          }}
          onCancel={()=>{ setShowParentSelect(false); setPendingNextRound(false); }}
        />
      )}

      {scr!=='setup' && (
        <div style={{position:'sticky',top:0,zIndex:20,background:'rgba(13,13,13,.96)',backdropFilter:'blur(8px)',padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid rgba(255,255,255,.06)'}}>
          <button className="btn btn-g" style={{fontSize:13,padding:'6px 12px'}} onClick={()=>{setGameCount(0);setFinalCount(0);setRollHistory([]);setScr('setup');}}>🏠</button>
          <div style={{textAlign:'center'}}>
            {/* 「何振り目か」の通し番号。振る画面の GAME バッジと同じ数字（gameCount）で全画面そろえる。 */}
            <div style={{fontSize:10,fontWeight:900,letterSpacing:'.14em',color:'#9a8a55'}}>GAME <span style={{fontSize:12,color:'#f5c842'}}>{gameCount}</span></div>
            <div style={{fontSize:15,fontWeight:700,color:'#f5c842'}}>チンチロ</div>
          </div>
          <button className="btn btn-g" style={{fontSize:13,padding:'6px 12px'}} onClick={()=>setShowStats(true)}>📊</button>
        </div>
      )}

      {scr==='setup' && (
        <SetupScreen players={players} setPlayers={setPlayers} parentIdx={parentIdx} setParentIdx={setParentIdx} onStart={startGame} onSettings={()=>setShowSettings(true)} onStats={()=>setShowStats(true)}/>
      )}
      {scr==='betting' && (
        <BettingScreen children={children} betStep={betStep} currentBet={curBet} onAdd={v=>setCurBet(b=>b+v)} onReset={()=>setCurBet(0)} onConfirm={confirmBet} round={round} bets={bets}/>
      )}
      {scr==='rolling' && currentRoller && (
        <RollingScreen
          key={`r-${rollStep}`}
          player={currentRoller}
          isParent={isParentRolling}
          bet={bets[currentRoller.id]||0}
          round={round}
          childList={children}
          bets={bets}
          childRes={childRes}
          parent={players[parentIdx]}
          parentRes={parentRes}
          rollStep={rollStep}
          gameCount={gameCount}
          forcePinzoro={(finalCount + 1) % FORCE_PINZORO_EVERY === 0}
          effectsOn={effectsOn}
          onComplete={onRollDone}
        />
      )}
      {scr==='results' && (
        <ResultsScreen players={players} parentIdx={parentIdx} bets={bets} childRes={childRes} parentRes={parentRes} payouts={payouts} deltas={deltas} onNext={nextRound}/>
      )}
    </>
  );
}
