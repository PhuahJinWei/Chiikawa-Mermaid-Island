import { t } from '../i18n/I18n';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Someone on the "where is everyone" page: their name, the place they are in, what they are doing, and how
 * fond of you they are, in hearts out of five (see Life.hearts). */
export interface Whereabout {
  name: string;
  place: string;
  doing: string;
  hearts?: number;
}

const HEARTS = 5;

/** A photo in the album: its picture's address (an object URL) and when it was taken. */
export interface AlbumPhoto {
  id: number;
  url: string;
  label: string;
}

/**
 * Your notebook (the user, 2026-10-22: a page of where everyone is): opened from its button by the pouch's,
 * on two pages: everyone (who is where, doing what, the islanders counted by what they do) and the album of
 * the photos you have taken, each opened to save, share or throw away; and the sound, on or off.
 */
export class Notebook {
  /** Asked for each time the everyone page shows, and every second while it does. */
  onPeople: () => { cast: Whereabout[]; islanders: string } = () => ({ cast: [], islanders: '' });
  /** Asked for when the album page shows. */
  onAlbum: () => Promise<AlbumPhoto[]> = async () => [];
  onDelete: (id: number) => void = () => {};
  onSound: (on: boolean) => void = () => {};

  private readonly root = el('div', 'notebook');
  private readonly card = el('div', 'notebook-card');
  private readonly tabs = el('div', 'notebook-tabs');
  private readonly peopleTab = el('button', 'notebook-tab');
  private readonly albumTab = el('button', 'notebook-tab');
  private readonly body = el('div', 'notebook-body');
  private readonly soundButton = el('button', 'notebook-sound');
  private readonly viewer = el('div', 'photo-viewer');
  private page: 'people' | 'album' = 'people';
  private timer = 0;
  private sound = true;
  private urls: string[] = [];

  constructor(ui: HTMLElement) {
    const head = el('div', 'notebook-head');
    const close = el('button', 'panel-close', '×');
    close.type = 'button';
    close.setAttribute('aria-label', t('panel.close'));
    close.addEventListener('click', () => this.close());
    for (const tab of [this.peopleTab, this.albumTab]) tab.type = 'button';
    this.peopleTab.textContent = t('note.people');
    this.albumTab.textContent = t('note.album');
    this.peopleTab.addEventListener('click', () => this.show('people'));
    this.albumTab.addEventListener('click', () => this.show('album'));
    this.tabs.append(this.peopleTab, this.albumTab);
    head.append(this.tabs, close);
    this.soundButton.type = 'button';
    this.soundButton.addEventListener('click', () => {
      this.setSound(!this.sound);
      this.onSound(this.sound);
    });
    this.card.append(head, this.body, this.soundButton);
    this.root.append(this.card, this.viewer);
    this.root.hidden = true;
    this.viewer.hidden = true;
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close();
    });
    ui.append(this.root);
    this.setSound(true);
  }

  get open(): boolean {
    return !this.root.hidden;
  }

  toggle(): void {
    if (this.open) this.close();
    else this.show(this.page);
  }

  setSound(on: boolean): void {
    this.sound = on;
    this.soundButton.textContent = t(on ? 'note.soundOn' : 'note.soundOff');
    this.soundButton.classList.toggle('off', !on);
  }

  close(): void {
    this.root.hidden = true;
    this.viewer.hidden = true;
    window.clearInterval(this.timer);
    this.dropUrls();
  }

  /** Opens a page of the notebook. */
  show(page: 'people' | 'album'): void {
    this.page = page;
    this.root.hidden = false;
    this.peopleTab.classList.toggle('active', page === 'people');
    this.albumTab.classList.toggle('active', page === 'album');
    window.clearInterval(this.timer);
    if (page === 'people') {
      this.drawPeople();
      this.timer = window.setInterval(() => this.drawPeople(), 1000);
    } else {
      void this.drawAlbum();
    }
  }

  private drawPeople(): void {
    const { cast, islanders } = this.onPeople();
    const list = el('div', 'people');
    for (const who of cast) {
      const row = el('div', 'people-row');
      const name = el('div', 'people-name', who.name);
      if (who.hearts !== undefined) {
        const n = Math.max(0, Math.min(HEARTS, who.hearts));
        name.append(el('div', 'people-hearts', '♥'.repeat(n) + '♡'.repeat(HEARTS - n)));
      }
      row.append(name, el('div', 'people-place', who.place), el('div', 'people-doing', who.doing));
      list.append(row);
    }
    const rest = el('div', 'people-islanders', islanders);
    this.body.replaceChildren(list, rest);
  }

  private dropUrls(): void {
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls = [];
  }

  private async drawAlbum(): Promise<void> {
    this.dropUrls();
    const photos = await this.onAlbum();
    this.urls = photos.map((p) => p.url);
    if (photos.length === 0) {
      this.body.replaceChildren(el('div', 'album-empty', t('note.albumEmpty')));
      return;
    }
    const grid = el('div', 'album');
    for (const photo of photos) {
      const thumb = el('button', 'album-photo');
      thumb.type = 'button';
      thumb.style.backgroundImage = `url(${photo.url})`;
      thumb.setAttribute('aria-label', photo.label);
      thumb.addEventListener('click', () => this.view(photo));
      grid.append(thumb);
    }
    this.body.replaceChildren(grid);
  }

  /** A photo opened large: to save, share or throw away. */
  private view(photo: AlbumPhoto): void {
    const picture = el('img', 'photo-large');
    picture.src = photo.url;
    picture.alt = photo.label;
    const buttons = el('div', 'photo-buttons');
    const save = el('a', 'photo-button', t('note.save'));
    save.href = photo.url;
    save.download = `mermaid-island-${photo.id}.jpg`;
    const share = el('button', 'photo-button', t('note.share'));
    share.type = 'button';
    share.hidden = !('share' in navigator);
    share.addEventListener('click', async () => {
      try {
        const blob = await (await fetch(photo.url)).blob();
        const file = new File([blob], `mermaid-island-${photo.id}.jpg`, { type: 'image/jpeg' });
        await navigator.share({ files: [file], title: t('app.title') });
      } catch {
        // Not shared (no sharing here, or put away): nothing to do.
      }
    });
    const remove = el('button', 'photo-button', t('note.delete'));
    remove.type = 'button';
    remove.addEventListener('click', () => {
      this.onDelete(photo.id);
      this.viewer.hidden = true;
      window.setTimeout(() => void this.drawAlbum(), 100);
    });
    const back = el('button', 'photo-button', t('note.back'));
    back.type = 'button';
    back.addEventListener('click', () => (this.viewer.hidden = true));
    buttons.append(save, share, remove, back);
    const caption = el('div', 'photo-caption', photo.label);
    this.viewer.replaceChildren(picture, caption, buttons);
    this.viewer.hidden = false;
  }
}
