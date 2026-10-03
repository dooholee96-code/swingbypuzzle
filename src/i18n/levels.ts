// 단계 이름·힌트와 장 이름의 번역. docs/PLAN.md §8.3
//
// **한국어 원문은 여기 없다.** 단계 JSON 의 name·hint 와 chapters.ts 의 장 이름이
// 원문이고, 생성기와 검증기가 그 파일을 쓴다. 여기에는 번역만 둔다 — 번역을
// 고친다고 검증된 단계 파일이 바뀌지 않게.
//
// 단계를 새로 등록하면 세 언어의 이름을 여기에 더해야 한다. 빠지면
// tests/i18n.test.ts 가 막는다(CI 관문).

import { getLang } from './index.js';

type Other = 'en' | 'ja' | 'zh';
/** 이름과, 원문에 힌트가 있으면 그 번역 */
type Text = readonly [name: string, hint?: string];

export const LEVEL_TEXT: Readonly<Record<Other, Readonly<Record<string, Text>>>> = {
  en: {
    '1-1': ['First Swingby', 'Drag anywhere on the screen to aim, then let go to launch'],
    '1-2': ['The Other Side', 'Which side of the planet you pass decides which way you bend'],
    '1-3': ['Sharp Turn', 'The closer you pass, the more you bend'],
    '1-4': ['Two Bends', 'The closer you pass, the more you bend'],
    '1-5': ['Pick Your Planets', "Using every planet isn't always the answer"],
    '1-6': ['Choose a Route'],
    '1-7': ['Narrow Gap', "You'll need to fly between the asteroids"],
    '1-8': ['Long Route', 'Check the whole route on the minimap first'],
    '2-1': ['Event Horizon', "A black hole's pull can help too, if you use it well"],
    '2-2': ['Just Avoid the Horizon', 'A black hole alone can bend your path'],
    '2-3': ['Hairpin', 'Skim close to the center of the black hole to bend hard'],
    '2-4': ['Steer Clear', 'This time, just stay away from the black hole'],
    '2-5': ['Planet to Black Hole'],
    '2-6': ['Between Two Pulls'],
    '2-7': ['Precision Combo'],
    '2-8': ['Long Chain Route'],
    '3-1': ['Restricted Zone', 'Enter the red circle and the alien will fire'],
    '3-2': ['Graze the Edge', 'Dipping into the range briefly can be okay'],
    '3-3': ['Between Two Ranges', 'Look for a safe passage'],
    '3-4': ['Light Review'],
    '3-5': ['Fast via Black Hole', 'Pass through quickly to take less fire'],
    '3-6': ['Route Choice'],
    '3-7': ['Break Through the Fire'],
    '3-8': ['Long Route'],
    '4-1': ['Moving Planet', 'The planet moves. Time your launch'],
    '4-2': ['Watch the Orbit', 'Wait for the orbiting planet to come around'],
    '4-3': ['Passing the Goal'],
    '4-4': ['Slow Orbit'],
    '4-5': ['Orbit and Black Hole'],
    '4-6': ['Syncing Two Orbits'],
    '4-7': ['Timing and Detour'],
    '4-8': ['Everything Together'],
    '5-1': ['Distant Route', 'Drag the minimap to check the whole route first'],
    '5-2': ['Wide Map', 'Use the minimap to look left and right'],
    '5-3': ['Return Orbit', 'Swing wide and come back to where you started'],
    '5-4': ['Review'],
    '5-5': ['Aliens and Orbits'],
    '5-6': ['Long Chain'],
    '5-7': ['Precision Combo'],
    '5-8': ['Opening Finale'],
    '6-1': ['First Boost', 'Tap mid-flight to veer toward that side'],
    '6-2': ['Let the Planet Steer', 'Turn as you enter the dotted circle and the planet carries you to the burrow'],
    '6-3': ['Between Two Planets', 'Turn as you enter the second dotted circle'],
    '6-4': ['Catch Your Breath', 'Turn toward the burrow as you pass the planet'],
    '6-5': ['Past the Black Hole', 'Don\'t turn toward the black hole'],
    '6-6': ['Gap in the Rocks', 'Swing wide and turn at the top-left corner'],
    '6-7': ['Through the Watch', 'Skirt the red circle\'s edge and turn at the very top'],
    '6-8': ['Carrot Rocket Flight', 'Turn between the pulls of the two planets'],
    '7-1': ['First Orbit', 'Touch the green circle and you orbit. Tap when you face the burrow'],
    '7-2': ['Leave from the Right', 'Leave from the right side of the ring to reach the burrow'],
    '7-3': ['Around the Planet to the Station', 'Curve around the planet, then leave the ring toward the burrow'],
    '7-4': ['A Restful Orbit', 'Take your time choosing a direction as you circle'],
    '7-5': ['Orbit by the Black Hole', 'Don\'t leave toward the black hole'],
    '7-6': ['Orbit Between Two Planets', 'Pass through both pulls to reach the ring'],
    '7-7': ['Orbit Under Watch', 'Pick a spot to leave that avoids the red circle'],
    '7-8': ['Moon Rabbit Station', 'After you leave, the planet swings you around wide'],
  },
  ja: {
    '1-1': ['はじめてのスイングバイ', '画面のどこでもドラッグして方向を決め、指を離すと発射'],
    '1-2': ['反対側へ', '惑星のどちら側を通るかで曲がる向きが変わります'],
    '1-3': ['大きく曲がる', '近くを通るほど大きく曲がります'],
    '1-4': ['二度曲がる', '近くを通るほど大きく曲がります'],
    '1-5': ['使う惑星を選ぶ', 'すべての惑星を使うのが正解とは限りません'],
    '1-6': ['航路を選ぶ'],
    '1-7': ['狭いすき間', '小惑星の間を通り抜けましょう'],
    '1-8': ['長い航路', 'まずミニマップで航路全体を確かめましょう'],
    '2-1': ['事象の地平線', 'ブラックホールの引力も、うまく使えば助けになります'],
    '2-2': ['地平線だけ避けて', 'ブラックホールだけでも軌道を曲げられます'],
    '2-3': ['急旋回', 'ブラックホールの中心近くをかすめると大きく曲がります'],
    '2-4': ['よけて通る', '今回はブラックホールを避けるだけで大丈夫です'],
    '2-5': ['惑星からブラックホールへ'],
    '2-6': ['二つの引力のあいだ'],
    '2-7': ['精密コンビネーション'],
    '2-8': ['長い連携航路'],
    '3-1': ['警戒区域', '赤い円に入るとエイリアンが撃ってきます'],
    '3-2': ['ふちをかすめて', '範囲に少し入るだけなら大丈夫なこともあります'],
    '3-3': ['二つの範囲のあいだ', '安全な通り道を探しましょう'],
    '3-4': ['軽いおさらい'],
    '3-5': ['ブラックホールで加速', '速く通り抜ければ砲撃を受けにくくなります'],
    '3-6': ['ルート選択'],
    '3-7': ['砲撃突破'],
    '3-8': ['長い航路'],
    '4-1': ['動く惑星', '惑星が動いています。発射のタイミングを狙いましょう'],
    '4-2': ['公転周期を見る', '公転する惑星が定位置に来るのを待ちましょう'],
    '4-3': ['目的地の前を横切る'],
    '4-4': ['ゆっくり公転'],
    '4-5': ['公転とブラックホール'],
    '4-6': ['二つの周期を合わせる'],
    '4-7': ['タイミングと迂回'],
    '4-8': ['総まとめ'],
    '5-1': ['遠い航路', 'ミニマップをドラッグして、まず航路全体を確かめましょう'],
    '5-2': ['横に広いマップ', 'ミニマップで左右を確かめましょう'],
    '5-3': ['戻ってくる軌道', '大きく回って出発した側へ戻ってきます'],
    '5-4': ['おさらい'],
    '5-5': ['エイリアンと公転'],
    '5-6': ['長い連携'],
    '5-7': ['精密コンビネーション'],
    '5-8': ['序盤の総まとめ'],
    '6-1': ['はじめてのブースト', '飛んでいる最中にタップすると、その方向へ曲がります'],
    '6-2': ['惑星にまかせる', '点線の円に入るときに曲がれば、惑星が巣穴へ運んでくれます'],
    '6-3': ['ふたつの惑星のあいだ', 'ふたつ目の点線の円に入るときに曲がってみましょう'],
    '6-4': ['ひと休み', '惑星の横を通るときに巣穴のほうへ曲がりましょう'],
    '6-5': ['ブラックホールのわき道', 'ブラックホールのほうへ曲がってはいけません'],
    '6-6': ['小惑星のすきま', '大きく回って、左上の端で曲がりましょう'],
    '6-7': ['監視網突破', '赤い円のふちを通って、いちばん上で曲がりましょう'],
    '6-8': ['にんじんロケット飛行', 'ふたつの惑星の引力のあいだで曲がりましょう'],
    '7-1': ['はじめての軌道', '緑の円につかまると回ります。巣穴のほうを向いたらタップ'],
    '7-2': ['右から出る', '輪の右側から出ると巣穴に届きます'],
    '7-3': ['惑星を回って駅へ', '惑星で曲がって輪に入り、巣穴のほうへ出ましょう'],
    '7-4': ['ひと休みの軌道', '回りながらゆっくり向きを選びましょう'],
    '7-5': ['ブラックホールのそばの軌道', 'ブラックホールのほうへ出ないように'],
    '7-6': ['ふたつの惑星のあいだの軌道', 'ふたつの引力を抜けて輪に入りましょう'],
    '7-7': ['監視の中の軌道', '赤い円をさけて出る場所を選びましょう'],
    '7-8': ['月うさぎの駅', '出たあと、惑星が大きく回してくれます'],
  },
  zh: {
    '1-1': ['第一次引力弹弓', '在屏幕任意位置拖动来瞄准，松手即发射'],
    '1-2': ['绕到另一边', '从行星哪一侧经过，决定了轨道往哪边弯'],
    '1-3': ['大转弯', '离得越近，弯得越大'],
    '1-4': ['两次转弯', '离得越近，弯得越大'],
    '1-5': ['挑选行星', '用上所有行星不一定是正解'],
    '1-6': ['选择路线'],
    '1-7': ['狭窄缝隙', '需要从小行星之间穿过去'],
    '1-8': ['漫长航线', '先用小地图看看整条航线'],
    '2-1': ['事件视界', '黑洞的引力用得好也能帮上忙'],
    '2-2': ['只避开视界', '只靠黑洞也能让轨道转弯'],
    '2-3': ['急转弯', '贴近黑洞中心掠过，就会大幅转弯'],
    '2-4': ['绕道而行', '这次只要避开黑洞就行'],
    '2-5': ['从行星到黑洞'],
    '2-6': ['两股引力之间'],
    '2-7': ['精准组合'],
    '2-8': ['长距离连环航线'],
    '3-1': ['警戒区域', '进入红圈，外星人就会开火'],
    '3-2': ['擦边而过', '短暂进入范围也许没关系'],
    '3-3': ['两片范围之间', '找一条安全通道'],
    '3-4': ['轻松复习'],
    '3-5': ['借黑洞加速', '快速通过，就能少挨炮火'],
    '3-6': ['路线选择'],
    '3-7': ['突破炮火'],
    '3-8': ['漫长航线'],
    '4-1': ['移动的行星', '行星在移动。把握好发射时机'],
    '4-2': ['观察公转周期', '等公转行星转到合适的位置'],
    '4-3': ['从目的地前经过'],
    '4-4': ['缓慢公转'],
    '4-5': ['公转与黑洞'],
    '4-6': ['对齐两个周期'],
    '4-7': ['时机与绕行'],
    '4-8': ['综合'],
    '5-1': ['遥远航线', '先拖动小地图查看整条航线'],
    '5-2': ['横向大地图', '用小地图查看左右两侧'],
    '5-3': ['折返轨道', '绕一大圈回到出发的一侧'],
    '5-4': ['复习'],
    '5-5': ['外星人与公转'],
    '5-6': ['长距离连环'],
    '5-7': ['精准组合'],
    '5-8': ['前期总复习'],
    '6-1': ['第一次喷射', '飞行中点击屏幕，就会朝那一侧转向'],
    '6-2': ['交给行星', '进入虚线圆时转向，行星会把你带到洞口'],
    '6-3': ['两颗行星之间', '进入第二个虚线圆时转向试试'],
    '6-4': ['喘口气', '经过行星旁边时，朝洞口转向'],
    '6-5': ['黑洞旁的小路', '别朝黑洞那边转'],
    '6-6': ['小行星缝隙', '绕一大圈，在左上角转向'],
    '6-7': ['突破警戒网', '沿着红圈边缘飞过，在最上方转向'],
    '6-8': ['胡萝卜火箭飞行', '在两颗行星的引力之间转向'],
    '7-1': ['第一次绕轨', '碰到绿圈就会绕圈。朝向洞口时点击'],
    '7-2': ['从右边出发', '要从圆环右侧出发才能到达洞口'],
    '7-3': ['绕过行星进站', '绕过行星进入圆环，再朝洞口出发'],
    '7-4': ['歇脚的轨道', '一边绕圈一边慢慢选方向'],
    '7-5': ['黑洞旁的轨道', '别朝黑洞那边出发'],
    '7-6': ['两颗行星之间的轨道', '穿过两股引力抵达圆环'],
    '7-7': ['监视下的轨道', '选一个避开红圈的出发点'],
    '7-8': ['月兔空间站', '出发后，行星会带你绕一大圈'],
  },
};

/** 장 이름. 한국어 원문은 chapters.ts (tools/register.ts 의 NAMES) */
export const CHAPTER_NAME: Readonly<Record<Other, Readonly<Record<number, string>>>> = {
  en: { 1: 'Planets', 2: 'Black Holes', 3: 'Aliens', 4: 'Orbiting Planets', 5: 'Wide Routes', 6: 'Boost', 7: 'Orbit Stations' },
  ja: { 1: '惑星', 2: 'ブラックホール', 3: 'エイリアン', 4: '公転する惑星', 5: '広い航路', 6: 'ブースト', 7: '軌道惑星' },
  zh: { 1: '行星', 2: '黑洞', 3: '外星人', 4: '公转行星', 5: '广阔航线', 6: '喷射', 7: '轨道行星' },
};

/** 지금 언어의 단계 이름. 번역이 없으면 원문 */
export function levelName(L: { id: string; name: string }): string {
  const l = getLang();
  return l === 'ko' ? L.name : LEVEL_TEXT[l][L.id]?.[0] ?? L.name;
}

/** 지금 언어의 단계 힌트. 원문에 힌트가 없으면 없다 */
export function levelHint(L: { id: string; hint?: string }): string | undefined {
  if (!L.hint) return undefined;
  const l = getLang();
  return l === 'ko' ? L.hint : LEVEL_TEXT[l][L.id]?.[1] ?? L.hint;
}

/** 지금 언어의 장 이름 */
export function chapterName(chapter: number, koName: string): string {
  const l = getLang();
  return l === 'ko' ? koName : CHAPTER_NAME[l][chapter] ?? koName;
}
