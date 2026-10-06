// 메시에 도감의 문구 (§22.7). 종류·별자리·고유명을 네 언어로.
//
// 사실(종류·별자리·거리)은 tools-shared/messier.ts 에 있고 여기는 **이름**만이다. 남의 글을
// 옮기지 않았다 — 천체의 통용 이름과 별자리 이름은 고유명사이고, 한 줄 설명은 어휘를 조립해
// 만든다(docs/messier-sources.md). 영어·일본어·중국어는 Claude 가 썼다 — 원어민 검수는
// 열린 일 6번과 같이.

import { type Lang, getLang } from './index.js';
import { type Con, type Messier, type MessierType, messierOf } from '../tools-shared/messier.js';

export const TYPE_NAME: Readonly<Record<Lang, Readonly<Record<MessierType, string>>>> = {
  ko: {
    gc: '구상 성단', oc: '산개 성단', neb: '발광 성운', rneb: '반사 성운', pn: '행성상 성운',
    snr: '초신성 잔해', sg: '나선 은하', eg: '타원 은하', lg: '렌즈형 은하', ig: '불규칙 은하',
    dbl: '이중성', ast: '성군', sc: '별구름',
  },
  en: {
    gc: 'Globular cluster', oc: 'Open cluster', neb: 'Emission nebula', rneb: 'Reflection nebula',
    pn: 'Planetary nebula', snr: 'Supernova remnant', sg: 'Spiral galaxy', eg: 'Elliptical galaxy',
    lg: 'Lenticular galaxy', ig: 'Irregular galaxy', dbl: 'Double star', ast: 'Asterism', sc: 'Star cloud',
  },
  ja: {
    gc: '球状星団', oc: '散開星団', neb: '散光星雲', rneb: '反射星雲', pn: '惑星状星雲',
    snr: '超新星残骸', sg: '渦巻銀河', eg: '楕円銀河', lg: 'レンズ状銀河', ig: '不規則銀河',
    dbl: '二重星', ast: '星群', sc: 'スタークラウド',
  },
  zh: {
    gc: '球状星团', oc: '疏散星团', neb: '发射星云', rneb: '反射星云', pn: '行星状星云',
    snr: '超新星遗迹', sg: '螺旋星系', eg: '椭圆星系', lg: '透镜状星系', ig: '不规则星系',
    dbl: '双星', ast: '星群', sc: '恒星云',
  },
};

export const CON_NAME: Readonly<Record<Lang, Readonly<Record<Con, string>>>> = {
  ko: {
    And: '안드로메다자리', Aqr: '물병자리', Aur: '마차부자리', CMa: '큰개자리', CVn: '사냥개자리',
    Cap: '염소자리', Cas: '카시오페이아자리', Cet: '고래자리', Cnc: '게자리', Com: '머리털자리',
    Cyg: '백조자리', Dra: '용자리', Gem: '쌍둥이자리', Her: '헤르쿨레스자리', Hya: '바다뱀자리',
    Leo: '사자자리', Lep: '토끼자리', Lyr: '거문고자리', Mon: '외뿔소자리', Oph: '뱀주인자리',
    Ori: '오리온자리', Peg: '페가수스자리', Per: '페르세우스자리', Psc: '물고기자리', Pup: '고물자리',
    Sco: '전갈자리', Sct: '방패자리', Ser: '뱀자리', Sge: '화살자리', Sgr: '궁수자리',
    Tau: '황소자리', Tri: '삼각형자리', UMa: '큰곰자리', Vir: '처녀자리', Vul: '여우자리',
  },
  en: {
    And: 'Andromeda', Aqr: 'Aquarius', Aur: 'Auriga', CMa: 'Canis Major', CVn: 'Canes Venatici',
    Cap: 'Capricornus', Cas: 'Cassiopeia', Cet: 'Cetus', Cnc: 'Cancer', Com: 'Coma Berenices',
    Cyg: 'Cygnus', Dra: 'Draco', Gem: 'Gemini', Her: 'Hercules', Hya: 'Hydra',
    Leo: 'Leo', Lep: 'Lepus', Lyr: 'Lyra', Mon: 'Monoceros', Oph: 'Ophiuchus',
    Ori: 'Orion', Peg: 'Pegasus', Per: 'Perseus', Psc: 'Pisces', Pup: 'Puppis',
    Sco: 'Scorpius', Sct: 'Scutum', Ser: 'Serpens', Sge: 'Sagitta', Sgr: 'Sagittarius',
    Tau: 'Taurus', Tri: 'Triangulum', UMa: 'Ursa Major', Vir: 'Virgo', Vul: 'Vulpecula',
  },
  ja: {
    And: 'アンドロメダ座', Aqr: 'みずがめ座', Aur: 'ぎょしゃ座', CMa: 'おおいぬ座', CVn: 'りょうけん座',
    Cap: 'やぎ座', Cas: 'カシオペヤ座', Cet: 'くじら座', Cnc: 'かに座', Com: 'かみのけ座',
    Cyg: 'はくちょう座', Dra: 'りゅう座', Gem: 'ふたご座', Her: 'ヘルクレス座', Hya: 'うみへび座',
    Leo: 'しし座', Lep: 'うさぎ座', Lyr: 'こと座', Mon: 'いっかくじゅう座', Oph: 'へびつかい座',
    Ori: 'オリオン座', Peg: 'ペガスス座', Per: 'ペルセウス座', Psc: 'うお座', Pup: 'とも座',
    Sco: 'さそり座', Sct: 'たて座', Ser: 'へび座', Sge: 'や座', Sgr: 'いて座',
    Tau: 'おうし座', Tri: 'さんかく座', UMa: 'おおぐま座', Vir: 'おとめ座', Vul: 'こぎつね座',
  },
  zh: {
    And: '仙女座', Aqr: '宝瓶座', Aur: '御夫座', CMa: '大犬座', CVn: '猎犬座',
    Cap: '摩羯座', Cas: '仙后座', Cet: '鲸鱼座', Cnc: '巨蟹座', Com: '后发座',
    Cyg: '天鹅座', Dra: '天龙座', Gem: '双子座', Her: '武仙座', Hya: '长蛇座',
    Leo: '狮子座', Lep: '天兔座', Lyr: '天琴座', Mon: '麒麟座', Oph: '蛇夫座',
    Ori: '猎户座', Peg: '飞马座', Per: '英仙座', Psc: '双鱼座', Pup: '船尾座',
    Sco: '天蝎座', Sct: '盾牌座', Ser: '巨蛇座', Sge: '天箭座', Sgr: '人马座',
    Tau: '金牛座', Tri: '三角座', UMa: '大熊座', Vir: '室女座', Vul: '狐狸座',
  },
};

/** 통용 이름이 있는 것만. 없으면 "M번호" 로 부른다 */
export const MESSIER_NAME: Readonly<Record<Lang, Readonly<Record<number, string>>>> = {
  ko: {
    1: '게성운', 6: '나비 성단', 7: '프톨레마이오스 성단', 8: '석호 성운', 11: '야생오리 성단',
    13: '헤르쿨레스 대성단', 16: '독수리 성운', 17: '오메가 성운', 20: '삼렬 성운', 24: '궁수자리 별구름',
    27: '아령 성운', 31: '안드로메다 은하', 33: '삼각형자리 은하', 40: '빈네케 4', 42: '오리온 대성운',
    43: '드 메랑 성운', 44: '프레세페', 45: '플레이아데스', 51: '소용돌이 은하', 57: '고리 성운',
    63: '해바라기 은하', 64: '검은 눈 은하', 74: '유령 은하', 76: '작은 아령 성운', 77: '고래자리 A',
    81: '보데 은하', 82: '시가 은하', 83: '남쪽 바람개비 은하', 87: '처녀자리 A', 97: '올빼미 성운',
    101: '바람개비 은하', 102: '방추 은하', 104: '솜브레로 은하', 108: '서프보드 은하',
  },
  en: {
    1: 'Crab Nebula', 6: 'Butterfly Cluster', 7: 'Ptolemy Cluster', 8: 'Lagoon Nebula', 11: 'Wild Duck Cluster',
    13: 'Hercules Cluster', 16: 'Eagle Nebula', 17: 'Omega Nebula', 20: 'Trifid Nebula', 24: 'Sagittarius Star Cloud',
    27: 'Dumbbell Nebula', 31: 'Andromeda Galaxy', 33: 'Triangulum Galaxy', 40: 'Winnecke 4', 42: 'Orion Nebula',
    43: "De Mairan's Nebula", 44: 'Beehive Cluster', 45: 'Pleiades', 51: 'Whirlpool Galaxy', 57: 'Ring Nebula',
    63: 'Sunflower Galaxy', 64: 'Black Eye Galaxy', 74: 'Phantom Galaxy', 76: 'Little Dumbbell Nebula', 77: 'Cetus A',
    81: "Bode's Galaxy", 82: 'Cigar Galaxy', 83: 'Southern Pinwheel Galaxy', 87: 'Virgo A', 97: 'Owl Nebula',
    101: 'Pinwheel Galaxy', 102: 'Spindle Galaxy', 104: 'Sombrero Galaxy', 108: 'Surfboard Galaxy',
  },
  ja: {
    1: 'かに星雲', 6: 'バタフライ星団', 7: 'トレミー星団', 8: '干潟星雲', 11: '野鴨星団',
    13: 'ヘルクレス座球状星団', 16: 'わし星雲', 17: 'オメガ星雲', 20: '三裂星雲', 24: 'いて座スタークラウド',
    27: '亜鈴状星雲', 31: 'アンドロメダ銀河', 33: 'さんかく座銀河', 40: 'ウィンネッケ4', 42: 'オリオン大星雲',
    43: 'ド・メラン星雲', 44: 'プレセペ星団', 45: 'プレアデス星団', 51: '子持ち銀河', 57: '環状星雲',
    63: 'ひまわり銀河', 64: '黒眼銀河', 74: '幽霊銀河', 76: '小亜鈴状星雲', 77: 'くじら座A',
    81: 'ボーデの銀河', 82: '葉巻銀河', 83: '南の回転花火銀河', 87: 'おとめ座A', 97: 'ふくろう星雲',
    101: '回転花火銀河', 102: 'スピンドル銀河', 104: 'ソンブレロ銀河', 108: 'サーフボード銀河',
  },
  zh: {
    1: '蟹状星云', 6: '蝴蝶星团', 7: '托勒密星团', 8: '礁湖星云', 11: '野鸭星团',
    13: '武仙座大星团', 16: '鹰状星云', 17: '欧米茄星云', 20: '三裂星云', 24: '人马座恒星云',
    27: '哑铃星云', 31: '仙女座星系', 33: '三角座星系', 40: '温内克4', 42: '猎户座大星云',
    43: '德梅兰星云', 44: '鬼宿星团', 45: '昴星团', 51: '涡状星系', 57: '环状星云',
    63: '向日葵星系', 64: '黑眼星系', 74: '幽灵星系', 76: '小哑铃星云', 77: '鲸鱼座A',
    81: '波德星系', 82: '雪茄星系', 83: '南风车星系', 87: '室女座A', 97: '夜枭星云',
    101: '风车星系', 102: '纺锤星系', 104: '草帽星系', 108: '冲浪板星系',
  },
};

/** "M31 안드로메다 은하", 이름이 없으면 "M3" */
export function messierLabel(n: number, lang: Lang = getLang()): string {
  const name = MESSIER_NAME[lang][n];
  return name ? `M${n} ${name}` : `M${n}`;
}

const thousands = (v: number): string => String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * 거리. 유효숫자를 두세 자리로 — 측정값은 어차피 그 정도다.
 *   한·일·중: 6,500 광년 / 3.8만 광년 / 254만 광년 / 5,600만 광년
 *   영어:     6,500 ly / 37,500 ly / 2.5 million ly / 56 million ly
 */
export function distText(ly: number, lang: Lang = getLang()): string {
  if (lang === 'en') {
    if (ly < 1e6) return `${thousands(ly)} ly`;
    const m = ly / 1e6;
    return `${m < 10 ? m.toFixed(1) : thousands(Math.round(m))} million ly`;
  }
  const unit = lang === 'ko' ? ' 광년' : '光年';
  const man = lang === 'ko' ? '만' : '万';
  if (ly < 1e4) return `${thousands(ly)}${unit}`;
  const v = ly / 1e4;
  const text = v < 10 ? v.toFixed(1) : thousands(Math.round(v));
  return `${text}${man}${unit}`;
}

/** 도감의 한 줄: "나선 은하 · 안드로메다자리 · 254만 광년" */
export function messierLine(m: Messier, lang: Lang = getLang()): string {
  return `${TYPE_NAME[lang][m.type]} · ${CON_NAME[lang][m.con]} · ${distText(m.ly, lang)}`;
}

export function messierLineOf(n: number, lang: Lang = getLang()): string {
  return messierLine(messierOf(n), lang);
}
