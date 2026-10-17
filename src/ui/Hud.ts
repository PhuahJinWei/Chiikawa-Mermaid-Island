import { t } from '../i18n/I18n';
import type { JoystickView } from '../core/Input';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

/** Title, frame stats, the floating joystick, the jump button and the test toggle. */
export class Hud implements JoystickView {
  onJump: () => void = () => {};
  onTest: () => void = () => {};

  private readonly title = el('div', 'hud-title');
  private readonly stats = el('div', 'hud-stats');
  private readonly testButton = el('button', 'hud-test');
  private readonly joyBase = el('div', 'joy-base');
  private readonly joyKnob = el('div', 'joy-knob');
  private readonly jumpButton = el('button', 'jump-btn');
  private readonly hint = el('div', 'hud-hint');
  private readonly place = el('div', 'hud-place');
  private placeTimer = 0;
  private readonly loading = el('div', 'loading');

  constructor(ui: HTMLElement) {
    const root = el('div', 'hud');
    const top = el('div', 'hud-top');
    const titleBox = el('div', 'hud-title-box');
    titleBox.append(this.title, this.stats);
    top.append(titleBox, this.testButton);
    this.joyBase.append(this.joyKnob);
    root.append(top, this.place, this.joyBase, this.jumpButton, this.hint, this.loading);
    ui.append(root);

    this.testButton.type = 'button';
    this.jumpButton.type = 'button';
    this.testButton.addEventListener('click', () => this.onTest());
    this.jumpButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.onJump();
    });
    window.addEventListener('resize', () => this.hide());
    this.refresh();
    this.hide();
  }

  refresh(): void {
    this.title.textContent = t('app.title');
    this.testButton.textContent = t('hud.test');
    this.jumpButton.textContent = t('hud.jump');
    this.hint.textContent = t('hud.hint');
    if (!this.loading.classList.contains('error')) this.loading.textContent = t('app.loading');
  }

  show(x: number, y: number): void {
    this.joyBase.classList.add('active');
    this.joyBase.style.transform = `translate(${x}px, ${y}px)`;
    this.joyKnob.style.transform = 'translate(-50%, -50%)';
  }

  move(dx: number, dy: number): void {
    this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  /** Rest the joystick ring in the bottom-left corner as a hint of where to touch. */
  hide(): void {
    this.joyBase.classList.remove('active');
    this.joyBase.style.transform = `translate(92px, ${window.innerHeight - 150}px)`;
    this.joyKnob.style.transform = 'translate(-50%, -50%)';
  }

  hideHint(): void {
    this.hint.classList.add('gone');
  }

  /** Shows a hint in the hint's place, or hides it again with null. */
  showHint(text: string | null): void {
    if (text === null) {
      this.hideHint();
      return;
    }
    this.hint.textContent = text;
    this.hint.classList.remove('gone');
  }

  setControlsVisible(on: boolean): void {
    this.jumpButton.hidden = !on;
    this.joyBase.hidden = !on;
  }

  /** The name of the place just walked into, showing for a moment under the title. */
  showPlace(name: string): void {
    this.place.textContent = name;
    this.place.classList.add('shown');
    window.clearTimeout(this.placeTimer);
    this.placeTimer = window.setTimeout(() => this.place.classList.remove('shown'), 2600);
  }

  setStats(text: string): void {
    this.stats.textContent = text;
  }

  doneLoading(): void {
    this.loading.remove();
  }

  showError(): void {
    this.loading.classList.add('error');
    this.loading.textContent = t('app.error');
  }
}
