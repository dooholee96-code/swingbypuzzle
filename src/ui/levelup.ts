// 레벨업 카드 (§22.5). 인피니티에서 경험치 문턱을 넘으면 판이 멈추고 셋 중 하나를 고른다.
//
// 문구는 i18n 사전에서 꺼낸다 (§0.6). 카드 셋은 세션이 시드로 뽑아 넘긴다 — 여기는 보여 주고
// 고른 것을 돌려줄 뿐이다.

import { type Key, t } from '../i18n/index.js';
import { type OfferKind, PERK_MAX, type PerkLevels, perkValueText } from '../tools-shared/perks.js';
import { img, perkIcon } from './art.js';

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} 를 찾을 수 없습니다`);
  return el;
};

export class LevelUpSheet {
  readonly el = $('levelup');
  private offers: OfferKind[] = [];
  onPick: (kind: OfferKind) => void = () => {};
  /** 다시 뽑기 (§14.7): 뽑았으면 null, 못 뽑았으면 보일 안내 문구의 키 */
  onReroll: () => Promise<Key | null> = async () => null;
  /** 지금 다시 뽑기를 권할 수 있는가 — 광고 없이 / 광고로 / 없음. 레벨업마다 한 번 */
  rerollMode: () => 'free' | 'ad' | null = () => null;

  constructor() {
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-i]');
      if (b) { this.choose(Number(b.dataset['i'])); return; }
      const r = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-a=reroll]');
      if (!r || r.disabled) return;
      r.disabled = true;
      void this.onReroll().then((k) => {
        if (!k || !this.el.contains(r)) return;   // 뽑았으면 show() 가 다시 그렸다
        r.disabled = false;
        const note = this.el.querySelector<HTMLElement>('.note');
        if (note) { note.textContent = t(k); note.hidden = false; }
      });
    });
  }

  get open(): boolean { return !this.el.hidden; }

  /** i 번째 카드를 고른다 (키보드 1·2·3 도 여기로) */
  choose(i: number): void {
    const k = this.offers[i];
    if (k === undefined) return;
    this.el.hidden = true;
    this.onPick(k);
  }

  show(offers: OfferKind[], perks: PerkLevels, level: number): void {
    this.offers = offers;
    const cards = offers.map((k, i) => {
      const cur = k === 'refill' ? 0 : perks[k];
      const next = Math.min(PERK_MAX, cur + 1);
      const desc = k === 'refill' ? t('perk.refill.desc')
        : t(`perk.${k}.desc` as Key, { v: perkValueText(k, next) });
      const dots = k === 'refill' ? ''
        : `<span class="dots">${Array.from({ length: PERK_MAX }, (_, j) =>
          `<i class="${j < cur ? 'on' : j < next ? 'next' : ''}"></i>`).join('')}</span>`;
      return `<button class="btn card" type="button" data-i="${i}" style="--i:${i}">
        ${img(perkIcon(k))}
        <span class="txt"><b>${t(`perk.${k}` as Key)}</b><small>${desc}</small></span>
        ${dots}<kbd>${i + 1}</kbd></button>`;
    }).join('');
    const mode = this.rerollMode();
    const reroll = mode
      ? `<div class="row"><button class="btn" data-a="reroll" type="button">${
        t(mode === 'ad' ? 'lvl.rerollAd' : 'lvl.reroll')}</button></div><p class="tapnote note" hidden></p>`
      : '';
    this.el.innerHTML = `<div class="panel">
      <h2>${t('lvl.title', { n: level })}</h2>
      <p>${t('lvl.pick')}</p>
      <div class="cards">${cards}</div>${reroll}</div>`;
    this.el.hidden = false;
  }

  close(): void { this.el.hidden = true; }
}
