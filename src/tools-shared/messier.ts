// 메시에 천체 110개 (§22.7). 수집 요소의 **사실 데이터** — 종류·별자리·거리(광년).
//
// 저작권 대상이 아닌 사실만 둔다. 값은 NASA·ESA 공개 자료와 SEDS 메시에 목록을 참고해
// 유효숫자 두세 자리로 반올림했다(docs/messier-sources.md). 이름 문구는 i18n/messier.ts.
//
// DOM·브라우저 API 를 import 하지 않는다 (§0.3).

/**
 * 종류. gc 구상 성단 · oc 산개 성단 · neb 발광 성운 · rneb 반사 성운 · pn 행성상 성운 ·
 * snr 초신성 잔해 · sg 나선 은하 · eg 타원 은하 · lg 렌즈형 은하 · ig 불규칙 은하 ·
 * dbl 이중성 · ast 성군 · sc 별구름
 */
export type MessierType =
  | 'gc' | 'oc' | 'neb' | 'rneb' | 'pn' | 'snr' | 'sg' | 'eg' | 'lg' | 'ig' | 'dbl' | 'ast' | 'sc';
export const MESSIER_TYPES: readonly MessierType[] = [
  'gc', 'oc', 'neb', 'rneb', 'pn', 'snr', 'sg', 'eg', 'lg', 'ig', 'dbl', 'ast', 'sc',
];

/** 별자리(IAU 세 글자) */
export type Con =
  | 'And' | 'Aqr' | 'Aur' | 'CMa' | 'CVn' | 'Cap' | 'Cas' | 'Cet' | 'Cnc' | 'Com' | 'Cyg' | 'Dra'
  | 'Gem' | 'Her' | 'Hya' | 'Leo' | 'Lep' | 'Lyr' | 'Mon' | 'Oph' | 'Ori' | 'Peg' | 'Per' | 'Psc'
  | 'Pup' | 'Sco' | 'Sct' | 'Ser' | 'Sge' | 'Sgr' | 'Tau' | 'Tri' | 'UMa' | 'Vir' | 'Vul';
export const CONS: readonly Con[] = [
  'And', 'Aqr', 'Aur', 'CMa', 'CVn', 'Cap', 'Cas', 'Cet', 'Cnc', 'Com', 'Cyg', 'Dra',
  'Gem', 'Her', 'Hya', 'Leo', 'Lep', 'Lyr', 'Mon', 'Oph', 'Ori', 'Peg', 'Per', 'Psc',
  'Pup', 'Sco', 'Sct', 'Ser', 'Sge', 'Sgr', 'Tau', 'Tri', 'UMa', 'Vir', 'Vul',
];

export interface Messier { n: number; type: MessierType; con: Con; ly: number }

export const MESSIER_COUNT = 110;
/** 스쳐 지나가면 모으는 거리(우주선 중심에서) */
export const COLLECT_R = 18;

// n 종류 별자리 거리(광년)
const TABLE = `
1 snr Tau 6500
2 gc Aqr 37500
3 gc CVn 33900
4 gc Sco 7200
5 gc Ser 24500
6 oc Sco 1600
7 oc Sco 980
8 neb Sgr 4100
9 gc Oph 25800
10 gc Oph 14300
11 oc Sct 6200
12 gc Oph 16000
13 gc Her 25100
14 gc Oph 30300
15 gc Peg 33600
16 neb Ser 7000
17 neb Sgr 5500
18 oc Sgr 4900
19 gc Oph 28700
20 neb Sgr 5200
21 oc Sgr 4250
22 gc Sgr 10600
23 oc Sgr 2150
24 sc Sgr 10000
25 oc Sgr 2000
26 oc Sct 5000
27 pn Vul 1360
28 gc Sgr 17900
29 oc Cyg 4000
30 gc Cap 27100
31 sg And 2540000
32 eg And 2490000
33 sg Tri 2730000
34 oc Per 1500
35 oc Gem 2800
36 oc Aur 4100
37 oc Aur 4500
38 oc Aur 4200
39 oc Cyg 825
40 dbl UMa 510
41 oc CMa 2300
42 neb Ori 1340
43 neb Ori 1600
44 oc Cnc 577
45 oc Tau 444
46 oc Pup 5400
47 oc Pup 1600
48 oc Hya 1500
49 eg Vir 56000000
50 oc Mon 3200
51 sg CVn 23000000
52 oc Cas 5000
53 gc Com 58000
54 gc Sgr 87400
55 gc Sgr 17600
56 gc Lyr 32900
57 pn Lyr 2570
58 sg Vir 62000000
59 eg Vir 60000000
60 eg Vir 55000000
61 sg Vir 52500000
62 gc Oph 22200
63 sg CVn 29300000
64 sg Com 17300000
65 sg Leo 35000000
66 sg Leo 36000000
67 oc Cnc 2700
68 gc Hya 33600
69 gc Sgr 29700
70 gc Sgr 29400
71 gc Sge 13000
72 gc Aqr 55400
73 ast Aqr 2500
74 sg Psc 32000000
75 gc Sgr 67500
76 pn Per 2500
77 sg Cet 47000000
78 rneb Ori 1600
79 gc Lep 41000
80 gc Sco 32600
81 sg UMa 11800000
82 ig UMa 11500000
83 sg Hya 15000000
84 lg Vir 60000000
85 lg Com 60000000
86 lg Vir 52000000
87 eg Vir 53500000
88 sg Com 47000000
89 eg Vir 50000000
90 sg Vir 58700000
91 sg Com 63000000
92 gc Her 26700
93 oc Pup 3600
94 sg CVn 16000000
95 sg Leo 32600000
96 sg Leo 31000000
97 pn UMa 2030
98 sg Com 44400000
99 sg Com 50000000
100 sg Com 55000000
101 sg UMa 20900000
102 lg Dra 50000000
103 oc Cas 10000
104 sg Vir 29300000
105 eg Leo 32000000
106 sg CVn 23700000
107 gc Oph 20900
108 sg UMa 46000000
109 sg UMa 83500000
110 eg And 2690000
`;

export const MESSIER: readonly Messier[] = TABLE.trim().split('\n').map((line) => {
  const [n, type, con, ly] = line.trim().split(/\s+/) as [string, MessierType, Con, string];
  return { n: Number(n), type, con, ly: Number(ly) };
});

export function messierOf(n: number): Messier {
  const m = MESSIER[n - 1];
  if (!m || m.n !== n) throw new Error(`M${n} 은 목록에 없습니다`);
  return m;
}

/**
 * 스테이지에 놓은 26개 — 유명한 것부터, 1~6장은 넷씩, 7장은 둘(궤도 행성 단계는 나가기 뒤의
 * 성공 폭이 좁아 둘만 자리가 났다). 나머지 84개는 인피니티(§22.3)의 바깥 링에서 나온다.
 * 번호를 바꾸면 이미 놓인 단계 파일(messier 키)과 어긋난다 — tests/messier.test.ts 가 맞춰 본다.
 */
export const STAGE_MESSIER: readonly number[] = [
  45, 42, 31, 44, 13, 57, 51, 27, 8, 20, 16, 17, 1, 104, 81, 82, 33, 101, 64, 97, 63, 83, 87, 7,
  6, 11,
];
export const INFINITY_POOL: readonly number[] = MESSIER
  .map((m) => m.n).filter((n) => !STAGE_MESSIER.includes(n));
