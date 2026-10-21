import { t, type StringKey } from '../i18n/I18n';
import { CHARACTER_IDS, EXPRESSION_IDS, type CharacterId, type ExpressionId } from '../characters/types';
import { ACTION_IDS, type ActionId } from '../characters/Actions';
import { DEFINITIONS } from '../characters/definitions';
import { SIREN_MOODS, type SirenMood } from '../characters/Siren';

export interface TestPanelState {
  character: CharacterId;
  lineup: boolean;
  outfit: boolean;
  /** Whether the follow camera looks on from behind instead of out of the character's eyes. */
  thirdPerson: boolean;
  expression: ExpressionId | null;
  clockRunning: boolean;
  freeCamera: boolean;
  /** Whether the calm water mirrors what stands by it; null where it cannot (the toon look). */
  reflections: boolean | null;
  /** The Siren's mood in the forbidden cave; null until she has loaded (or where there is no cave). */
  siren: SirenMood | null;
}

/** The test panel's times of day: dawn, midday, dusk and night, in hours past midnight. */
const TIMES: [StringKey, number][] = [
  ['time.morning', 6.3],
  ['time.noon', 12],
  ['time.evening', 18.1],
  ['time.night', 22],
];

export interface TestPanelHandlers {
  selectCharacter(id: CharacterId): void;
  toggleLineup(): void;
  toggleOutfit(): void;
  resetCamera(): void;
  toggleThirdPerson(): void;
  action(id: ActionId | 'jump'): void;
  expression(id: ExpressionId | null): void;
  setTime(hours: number): void;
  toggleClock(): void;
  toggleFreeCamera(): void;
  moveHere(): void;
  toggleReflections(): void;
  /** Calms the Siren or rouses her. */
  sirenMood(mood: SirenMood): void;
  /** Takes you to the forbidden cave's ledge, before the Siren. */
  visitSiren(): void;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch);

/** Bottom sheet for trying every action and expression on the phone. */
export class TestPanel {
  onToggle: (open: boolean) => void = () => {};
  private readonly el = document.createElement('div');
  private info: HTMLElement | null = null;
  private infoText = '';
  private open = false;

  constructor(
    ui: HTMLElement,
    private readonly handlers: TestPanelHandlers,
    private readonly state: () => TestPanelState,
  ) {
    this.el.className = 'panel';
    this.el.setAttribute('role', 'dialog');
    this.el.addEventListener('click', this.onClick);
    this.el.addEventListener('pointerdown', (e) => e.stopPropagation());
    ui.append(this.el);
    this.render();
  }

  toggle(force?: boolean): void {
    this.open = force ?? !this.open;
    this.el.classList.toggle('open', this.open);
    if (this.open) this.render();
    this.onToggle(this.open);
  }

  setInfo(text: string): void {
    this.infoText = text;
    if (this.info) this.info.textContent = text;
  }

  render(): void {
    const s = this.state();
    const scroll = this.el.scrollTop;
    const chip = (attr: string, value: string, label: string, active = false) =>
      `<button type="button" class="chip${active ? ' active' : ''}" data-${attr}="${value}">${escapeHtml(label)}</button>`;
    const section = (titleKey: StringKey, chips: string) =>
      `<section><h3>${escapeHtml(t(titleKey))}</h3><div class="chips">${chips}</div></section>`;

    this.el.innerHTML = [
      `<div class="panel-head"><h2>${escapeHtml(t('panel.title'))}</h2>` +
        `<button type="button" class="panel-close" data-close="1" aria-label="${escapeHtml(t('panel.close'))}">×</button></div>`,
      section(
        'panel.characters',
        CHARACTER_IDS.map((id) => chip('char', id, t(DEFINITIONS[id].nameKey), id === s.character)).join(''),
      ),
      section(
        'panel.view',
        chip('lineup', '1', t('panel.lineup'), s.lineup) +
          chip('outfit', '1', t('panel.outfit'), s.outfit) +
          chip('reset', '1', t('panel.resetCamera')) +
          chip('third', '1', t('panel.thirdPerson'), s.thirdPerson) +
          chip('freecam', '1', t('panel.freeCamera'), s.freeCamera) +
          (s.freeCamera ? chip('movehere', '1', t('panel.moveHere')) : '') +
          (s.reflections !== null ? chip('reflect', '1', t('panel.reflections'), s.reflections) : ''),
      ),
      section(
        'panel.time',
        TIMES.map(([key, hours]) => chip('time', String(hours), t(key))).join('') +
          chip('clock', '1', t('time.stop'), !s.clockRunning),
      ),
      section(
        'panel.actions',
        chip('action', 'jump', t('action.jump')) +
          ACTION_IDS.map((a) => chip('action', a, t(`action.${a}` as StringKey))).join(''),
      ),
      section(
        'panel.expressions',
        chip('expr', 'auto', t('expr.auto'), s.expression === null) +
          EXPRESSION_IDS.map((e) => chip('expr', e, t(`expr.${e}` as StringKey), s.expression === e)).join(''),
      ),
      s.siren === null
        ? ''
        : section(
            'panel.siren',
            SIREN_MOODS.map((m) => chip('siren', m, t(`siren.${m}` as StringKey), s.siren === m)).join('') +
              chip('visit', '1', t('siren.visit')),
          ),
      `<section><h3>${escapeHtml(t('panel.info'))}</h3><div class="info" data-info></div></section>`,
    ].join('');
    this.info = this.el.querySelector('[data-info]');
    if (this.info) this.info.textContent = this.infoText;
    this.el.scrollTop = scroll;
  }

  private onClick = (e: MouseEvent) => {
    const button = (e.target as HTMLElement).closest('button');
    if (!button) return;
    const d = button.dataset;
    if (d.close) this.toggle(false);
    else if (d.char) this.handlers.selectCharacter(d.char as CharacterId);
    else if (d.lineup) this.handlers.toggleLineup();
    else if (d.outfit) this.handlers.toggleOutfit();
    else if (d.reset) this.handlers.resetCamera();
    else if (d.third) this.handlers.toggleThirdPerson();
    else if (d.freecam) this.handlers.toggleFreeCamera();
    else if (d.movehere) this.handlers.moveHere();
    else if (d.reflect) this.handlers.toggleReflections();
    else if (d.time) this.handlers.setTime(Number(d.time));
    else if (d.clock) this.handlers.toggleClock();
    else if (d.action) this.handlers.action(d.action as ActionId | 'jump');
    else if (d.expr) this.handlers.expression(d.expr === 'auto' ? null : (d.expr as ExpressionId));
    else if (d.siren) this.handlers.sirenMood(d.siren as SirenMood);
    else if (d.visit) this.handlers.visitSiren();
    if (!d.close) this.render();
  };
}
