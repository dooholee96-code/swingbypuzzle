// ===== 결정론적 물리 코어 (게임과 검증기에서 공용) =====
const DT = 1/240;
const SHIP_R = 5;
const MAX_FLIGHT = 30;

function dist(ax,ay,bx,by){ const dx=ax-bx, dy=ay-by; return Math.sqrt(dx*dx+dy*dy); }
function bodyPos(b, t){
  if(!b.orbit) return [b.x, b.y];
  const o = b.orbit, a = o.phase + 2*Math.PI*t/o.period;
  return [o.cx + o.rad*Math.cos(a), o.cy + o.rad*Math.sin(a)];
}
function gravs(L){ return (L.planets||[]).concat(L.holes||[]); }
function accel(G, x, y, t){
  let ax=0, ay=0;
  for(const b of G){
    const [bx,by] = bodyPos(b,t);
    const dx=bx-x, dy=by-y, r2=dx*dx+dy*dy, R2=b.R*b.R;
    if(r2>=R2 || r2<1) continue;
    const r=Math.sqrt(r2), f=1-r/b.R, m=b.g*f*f;
    ax+=m*dx/r; ay+=m*dy/r;
  }
  return [ax,ay];
}
// 우주선 1스텝 + 충돌 판정 (총알 제외). 반환: null=계속, 문자열=결과
function stepShip(L, G, s, t){
  const [ax,ay]=accel(G,s.x,s.y,t);
  s.vx+=ax*DT; s.vy+=ay*DT; s.x+=s.vx*DT; s.y+=s.vy*DT;
  const tt=t+DT;
  for(const p of (L.planets||[])){ const [px,py]=bodyPos(p,tt); if(dist(px,py,s.x,s.y)<p.r+SHIP_R) return 'planet'; }
  for(const h of (L.holes||[])){ if(dist(h.x,h.y,s.x,s.y)<h.rH+2) return 'hole'; }
  for(const a of (L.rocks||[])){ if(dist(a.x,a.y,s.x,s.y)<a.r*0.85+SHIP_R) return 'rock'; }
  for(const u of (L.ufos||[])){ if(dist(u.x,u.y,s.x,s.y)<13+SHIP_R) return 'ufo'; }
  if(s.x<SHIP_R||s.y<SHIP_R||s.x>L.w-SHIP_R||s.y>L.h-SHIP_R) return 'wall';
  if(dist(L.goal.x,L.goal.y,s.x,s.y)<L.goal.r) return 'win';
  return null;
}
function fireUfos(L, st, ship, ft){
  for(const u of (L.ufos||[])){
    if(u._next===undefined) u._next=u.delay;
    while(ft>=u._next){
      const dx=ship.x-u.x, dy=ship.y-u.y, d=Math.sqrt(dx*dx+dy*dy);
      if(d<u.range) st.bullets.push({x:u.x,y:u.y,vx:dx/d*u.bs,vy:dy/d*u.bs,age:0});
      u._next+=u.interval;
    }
  }
}
function stepBullets(L, st, ship){
  for(const b of st.bullets){ b.x+=b.vx*DT; b.y+=b.vy*DT; b.age+=DT; }
  st.bullets=st.bullets.filter(b=>b.age<5&&b.x>-20&&b.y>-20&&b.x<L.w+20&&b.y<L.h+20);
  for(const b of st.bullets){ if(dist(b.x,b.y,ship.x,ship.y)<3+SHIP_R) return 'shot'; }
  return null;
}
// 전체 비행 시뮬레이션 (검증용)
function simulate(L, angleDeg, launchStep){
  const G=gravs(L);
  for(const u of (L.ufos||[])) delete u._next;
  const a=angleDeg*Math.PI/180;
  const s={x:L.start.x,y:L.start.y,vx:Math.cos(a)*L.speed,vy:Math.sin(a)*L.speed};
  const st={bullets:[]};
  let t=launchStep*DT, n=0, maxN=MAX_FLIGHT/DT;
  while(n<maxN){
    const r=stepShip(L,G,s,t); t+=DT; n++;
    if(r) return r;
    fireUfos(L,st,s,n*DT);
    const rb=stepBullets(L,st,s); if(rb) return rb;
  }
  return 'drift';
}
if(typeof module!=='undefined') module.exports={DT,SHIP_R,MAX_FLIGHT,bodyPos,gravs,accel,stepShip,fireUfos,stepBullets,simulate};
