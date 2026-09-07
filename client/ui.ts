import {
  CHAT_RANGES,
  GIVE_RANGE,
  GOVERNMENT,
  JOBS,
  MAX_PROPS,
  MAX_TRANSFER,
  POCKET_CAPACITY,
  PROPS,
  SHOP,
  VERSION,
  WEAPONS,
} from '../shared/catalog.ts';
import { BUILDINGS, districtAt } from '../shared/map.ts';
import { distance, eyes } from '../shared/movement.ts';
import type { GameEvent, JobId, Player, Snapshot } from '../shared/types.ts';
import type { VoiceStatus } from './voice.ts';

export const escape = (text: unknown): string =>
  String(text ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
const money = (n: number) => `$${Math.floor(n).toLocaleString('en-US')}`;
export interface AimTarget {
  kind: 'door' | 'entity' | 'player';
  id: string;
  title: string;
  detail: string;
  hint: string;
}
export interface Settings {
  volume: number;
  voiceVolume: number;
  sensitivity: number;
  fov: number;
  quality: 'low' | 'high';
}
const icons: Record<string, string> = {
  jobs: '◎',
  shop: '▣',
  laws: '≡',
  players: '♙',
  help: '?',
  settings: '⚙',
  build: '⊞',
  context: '◇',
  account: '◈',
  pocket: '▱',
};
export class UI {
  root: HTMLElement;
  menu = '';
  state?: Snapshot;
  player?: Player;
  selectedJob: JobId = 'citizen';
  aim?: AimTarget;
  contextTarget?: AimTarget;
  playing = false;
  chatOpen = false;
  settings: Settings;
  serverName = 'OpenRP | Union District';
  lastMenuKey = '';
  username?: string;
  accountBusy = false;
  voice: VoiceStatus = {
    connected: false,
    microphone: 'off',
    talking: false,
    deafened: false,
    level: 0,
    speakers: [],
    muted: new Set(),
  };
  private lastVoiceKey = '';
  onVoice: (command: 'mic' | 'deafen' | 'mute', id?: string) => void = () => {};
  onConnect: (name: string, password: string, account?: boolean) => void = () => {};
  onAccount: (action: 'login' | 'register', username: string, password: string) => void = () => {};
  onSignOut: () => void = () => {};
  onAction: (action: string, target?: string, value?: string | number | boolean) => void = () => {};
  onChat: (text: string) => void = () => {};
  onResume: () => void = () => {};
  onMenu: () => void = () => {};
  onSettings: () => void = () => {};
  constructor() {
    try {
      this.settings = {
        volume: 0.45,
        voiceVolume: 0.8,
        sensitivity: 1,
        fov: 80,
        quality: 'high',
        ...JSON.parse(localStorage.getItem('openrp-settings') ?? '{}'),
      };
    } catch {
      this.settings = { volume: 0.45, voiceVolume: 0.8, sensitivity: 1, fov: 80, quality: 'high' };
    }
    this.root = document.getElementById('app')!;
    this.root.innerHTML = `
      <div id="viewport" aria-label="Union District 3D game"></div>
      <div class="film-grain" aria-hidden="true"></div>
      <section id="entry" class="entry">
        <header class="entry-header"><div class="brandmark">R<span>●</span></div><div class="entry-edition">OPEN SOURCE<br><b>CITY ROLEPLAY</b></div><div class="version">ALPHA ${VERSION}</div></header>
        <div class="entry-panel"><div class="eyebrow"><span class="status-dot"></span> UNION DISTRICT / MULTIPLAYER</div><h1>OPEN<span>RP</span><span class="title-period">.</span></h1><p class="entry-tagline">Another city. Your own story.</p><p class="entry-free">FREE TO PLAY · NO DOWNLOAD · PUBLIC ALPHA</p>
          <div class="entry-rule"></div><div class="entry-tabs"><button data-action="entry-login" aria-pressed="true">Sign in</button><button data-action="entry-register" aria-pressed="false">Create account</button><button data-action="entry-guest" aria-pressed="false">Guest</button></div><div id="password-row" hidden><label class="field-label" for="server-password">SERVER PASSWORD</label><input id="server-password" type="password" autocomplete="current-password"></div><div id="account-content">${this.accountForm('login', 'entry')}</div><form id="join-form" hidden><label class="field-label" for="player-name">YOUR ROLEPLAY NAME</label><input id="player-name" name="name" minlength="2" maxlength="24" required autocomplete="nickname" placeholder="Choose a name" value="${escape(localStorage.getItem('openrp-name') ?? '')}"><button id="join-button" class="primary join-button" type="submit"><span>Enter as guest</span><span>↗</span></button><p class="account-help">Create an account later to keep this guest's belongings across browsers.</p></form>
          <p class="entry-consent">By joining, follow the <a href="/rules.html" target="_blank" rel="noopener">community rules</a>. Text chat is logged. <a href="/rules.html#privacy" target="_blank" rel="noopener">Privacy</a> · <a href="https://github.com/DevanMetz/openrp" target="_blank" rel="noopener">Source</a></p><p id="join-status" class="entry-status" role="status">Connecting to the district…</p><div class="entry-options"><button data-menu="help">How to play <span>↗</span></button><button data-menu="settings">Settings <span>⚙</span></button></div>
        </div>
        <div class="entry-location"><span class="location-line"></span><span>01 / UNION SQUARE<small>A city with room for you.</small></span></div>
        <footer class="entry-footer"><span>JOBS. PROPERTY. PHYSICS. POSSIBILITIES.</span><span>DESKTOP · KEYBOARD & MOUSE</span></footer>
      </section>
      <div id="hud" hidden>
        <div class="hud-top"><div class="district-label"><span class="status-dot"></span><span id="district">Union Square</span><small>UNION DISTRICT</small></div><div class="server-chip"><span id="online">ONLINE</span><i></i><span id="ping">— ms</span></div></div>
        <div id="voice-hud" class="voice-hud"><button data-menu="settings" aria-label="Voice settings"><kbd>V</kbd><span id="voice-hint">Enable microphone</span><span class="voice-meter"><i id="voice-level"></i></span></button><div id="voice-speakers" hidden></div></div>
        <div id="lockdown" hidden>⚠ CITY LOCKDOWN <span>Return to your property. Follow Civil Protection instructions.</span></div>
        <div id="vote-banner" hidden></div>
        <div id="crosshair"><i></i><i></i><i></i><i></i><b></b></div><div id="hitmarker" hidden>×</div>
        <div id="target" hidden><div id="target-title"></div><div id="target-detail"></div><div id="target-hint"></div></div>
        <div id="progress" hidden><span></span><progress max="1" value="0"></progress></div>
        <div class="hud-bottom"><section class="vitals"><div class="identity"><span id="job-marker"></span><span id="hud-name">Citizen</span><small id="hud-job">Citizen</small></div><div class="wallet"><span id="money">$1,500</span><div><span id="salary">+$45</span><small id="payday">PAYDAY IN 60s</small></div></div><div class="bars"><div class="bar-item"><span>+</span><div><i id="health-bar"></i></div><b id="health">100</b></div><div class="bar-item armor"><span>◇</span><div><i id="armor-bar"></i></div><b id="armor">0</b></div><div class="bar-item hunger"><span>◒</span><div><i id="hunger-bar"></i></div><b id="hunger">100</b></div></div><div id="status-flags"></div></section>
          <div class="quick-keys"><button data-menu="jobs"><kbd>F4</kbd> Roleplay</button><button data-menu="build"><kbd>Q</kbd> Build</button><button data-menu="help"><kbd>F1</kbd> Help</button></div>
          <section class="weapon-hud"><div id="weapon-name">KEYS</div><div id="ammo"></div><small id="weapon-tip">LMB use · RMB lock</small></section>
        </div>
        <div class="minimap-wrap"><canvas id="minimap" width="300" height="240" aria-label="District minimap"></canvas><span>N ↑</span></div>
        <div id="weapon-strip"></div><div id="chat" class="chat"><div id="chat-lines" aria-live="polite"></div><form id="chat-form" hidden><span id="chat-channel">LOCAL</span><input id="chat-input" maxlength="240" autocomplete="off" aria-label="Chat message" placeholder="Message nearby players, or /ooc for everyone"><kbd>↵</kbd></form></div>
        <div id="death" hidden></div><div id="damage" aria-hidden="true"></div>
      </div>
      <div id="notices" aria-live="polite"></div>
      <div id="overlay" class="overlay" hidden><section class="modal" role="dialog" aria-modal="true" aria-label="Game menu"><header class="modal-top"><div class="mini-brand">OPEN<span>RP</span></div><span id="modal-subtitle">UNION DISTRICT</span><button id="close-menu" class="close-button" aria-label="Close menu">✕ <kbd>ESC</kbd></button></header><div class="modal-body"><nav id="menu-nav"></nav><main id="menu-content"></main></div><footer class="modal-footer"><span id="menu-footer">Your city. Your rules.</span><span>OPENRP ${VERSION}</span></footer></section></div>`;
    this.root.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>(
        '[data-menu], [data-action], [data-job]',
      );
      if (!button || (button instanceof HTMLButtonElement && button.disabled)) return;
      if (button.dataset.menu) this.open(button.dataset.menu);
      if (button.dataset.job) {
        this.selectedJob = button.dataset.job as JobId;
        this.renderMenu();
      }
      if (button.dataset.action)
        this.clickAction(button.dataset.action, button.dataset.target ?? '', button.dataset.value);
    });
    this.el('close-menu').addEventListener('click', () => this.close());
    this.root.addEventListener('submit', (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.dataset.account) return;
      event.preventDefault();
      if (this.accountBusy || !form.reportValidity()) return;
      const username = (form.elements.namedItem('username') as HTMLInputElement).value;
      const password = form.elements.namedItem('password') as HTMLInputElement;
      this.onAccount(form.dataset.account as 'login' | 'register', username, password.value);
      password.value = '';
    });
    this.el('join-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const name = this.input('player-name').value.trim();
      if (name.length < 2) return;
      this.onConnect(name, this.input('server-password').value);
    });
    this.input('chat-input').addEventListener('input', () => this.updateChatChannel());
    this.el('chat-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const input = this.input('chat-input');
      if (input.value.trim()) this.onChat(input.value.trim());
      input.value = '';
      this.closeChat();
    });
    this.el('menu-content').addEventListener('input', (event) => {
      const input = event.target as HTMLInputElement;
      const key = input.dataset.setting as keyof Settings | undefined;
      if (!key) return;
      if (key === 'quality') this.settings.quality = input.value as Settings['quality'];
      else this.settings[key] = Number(input.value);
      localStorage.setItem('openrp-settings', JSON.stringify(this.settings));
      this.onSettings();
      const out = input.parentElement?.querySelector('output');
      if (out)
        out.textContent =
          key === 'volume' || key === 'voiceVolume'
            ? `${Math.round(this.settings[key] * 100)}%`
            : String(this.settings[key]);
    });
    this.el('menu-content').addEventListener('submit', (event) => {
      event.preventDefault();
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !form.dataset.residentAction) return;
      const target = this.state?.players.find((p) => p.id === form.dataset.target);
      if (!target || !this.player || this.player.deadUntil || this.player.arrestedUntil) {
        this.notice('This resident action is no longer available.', 'error');
        this.renderMenu();
        return;
      }
      if (!form.reportValidity()) return;
      const input = form.querySelector<HTMLInputElement>('input')!;
      const action = form.dataset.residentAction;
      this.onAction(action, target.id, action === 'give' ? Number(input.value) : input.value.trim());
    });
  }
  el(id: string): HTMLElement {
    return document.getElementById(id)!;
  }
  accountForm(action: 'login' | 'register', scope: string): string {
    const saved = localStorage.getItem('openrp-account');
    return `${action === 'login' && saved && localStorage.getItem('openrp-account-token') ? `<button class="account-resume" data-action="account-resume">Continue as ${escape(saved)} ↗</button>` : ''}<form class="account-form" data-account="${action}"><label class="field-label" for="account-${scope}-username">USERNAME</label><input id="account-${scope}-username" name="username" autocomplete="username" minlength="3" maxlength="24" pattern="[A-Za-z0-9][A-Za-z0-9_.\\-]{2,23}" required placeholder="Your username" value="${escape(action === 'login' ? (saved ?? '') : '')}"><label class="field-label" for="account-${scope}-password">PASSWORD</label><input id="account-${scope}-password" name="password" type="password" autocomplete="${action === 'register' ? 'new-password' : 'current-password'}" minlength="15" maxlength="128" required placeholder="${action === 'register' ? 'A passphrase of 15+ characters' : 'Your password'}"><p class="account-help">${action === 'register' ? 'Only a username and password. Your current guest’s belongings come with you.' : 'Restore your inventory, props and properties on any browser.'}</p><button class="primary join-button" type="submit" ${this.accountBusy ? 'disabled' : ''}>${action === 'register' ? 'Create account & enter' : 'Sign in'} <span>↗</span></button></form>`;
  }
  entryMode(mode: 'login' | 'register' | 'guest'): void {
    this.el('join-form').hidden = mode !== 'guest';
    this.el('account-content').hidden = mode === 'guest';
    if (mode !== 'guest') this.el('account-content').innerHTML = this.accountForm(mode, 'entry');
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('.entry-tabs button'))
      button.setAttribute('aria-pressed', String(button.dataset.action === `entry-${mode}`));
  }
  setAccountBusy(busy: boolean): void {
    this.accountBusy = busy;
    for (const button of this.root.querySelectorAll<HTMLButtonElement>(
      '.account-form button, .entry-tabs button, .account-resume',
    ))
      button.disabled = busy;
  }
  input(id: string): HTMLInputElement {
    return document.getElementById(id) as HTMLInputElement;
  }
  text(id: string, value: string): void {
    this.el(id).textContent = value;
  }
  status(text: string, busy = false): void {
    this.text('join-status', text);
    (this.el('join-button') as HTMLButtonElement).disabled = busy;
    this.setAccountBusy(busy);
  }
  connected(): void {
    this.playing = true;
    this.el('entry').hidden = true;
    this.el('hud').hidden = false;
    document.body.classList.add('playing');
    this.close(false);
  }
  disconnected(reason: string): void {
    this.playing = false;
    this.el('entry').hidden = false;
    this.el('hud').hidden = true;
    document.body.classList.remove('playing');
    this.close(false);
    this.status(reason);
  }
  open(menu: string, target?: AimTarget): void {
    if (this.menu === menu && !target) {
      this.close();
      return;
    }
    this.closeChat(false);
    this.menu = menu;
    if (menu === 'context') this.contextTarget = target ?? this.aim;
    this.el('overlay').hidden = false;
    this.onMenu();
    this.renderMenu();
  }
  close(resume = true): void {
    this.menu = '';
    this.el('overlay').hidden = true;
    if (resume && this.playing) this.onResume();
  }
  openChat(): void {
    if (!this.playing || this.menu) return;
    this.chatOpen = true;
    this.updateChatChannel();
    this.el('chat-form').hidden = false;
    this.el('chat').classList.add('active');
    this.onMenu();
    setTimeout(() => this.input('chat-input').focus(), 0);
  }
  updateChatChannel(): void {
    const command = this.input('chat-input').value.trim().split(/\s+/)[0].toLowerCase();
    const labels: Record<string, string> = {
      '/w': `WHISPER · ${CHAT_RANGES.whisper}m`,
      '/whisper': `WHISPER · ${CHAT_RANGES.whisper}m`,
      '/y': `YELL · ${CHAT_RANGES.yell}m`,
      '/yell': `YELL · ${CHAT_RANGES.yell}m`,
      '/ooc': 'OOC',
      '//': 'OOC',
      '/g': 'GROUP',
      '/ad': 'AD · $50',
      '/advert': 'AD · $50',
      '/me': `ACTION · ${CHAT_RANGES.local}m`,
    };
    this.text(
      'chat-channel',
      labels[command] ?? (command.startsWith('/') ? 'COMMAND' : `LOCAL · ${CHAT_RANGES.local}m`),
    );
  }
  closeChat(resume = true): void {
    this.chatOpen = false;
    this.el('chat-form').hidden = true;
    this.el('chat').classList.remove('active');
    this.input('chat-input').blur();
    if (resume && this.playing && !this.menu) this.onResume();
  }
  notice(text: string, tone = 'info'): void {
    const item = document.createElement('div');
    item.className = `notice ${tone}`;
    item.textContent = text;
    this.el('notices').appendChild(item);
    while (this.el('notices').children.length > 5) this.el('notices').firstChild?.remove();
    setTimeout(() => item.remove(), 6000);
  }
  chat(event: Extract<GameEvent, { type: 'chat' }>): void {
    const line = document.createElement('div');
    line.className = `chat-line ${event.channel}`;
    const name = document.createElement('strong');
    name.textContent = `${event.channel === 'whisper' ? '[WHISPER] ' : event.channel === 'yell' ? '[YELL] ' : event.channel === 'ooc' ? '[OOC] ' : event.channel === 'advert' ? '[AD] ' : event.channel === 'group' ? '[GROUP] ' : event.channel === 'me' ? '* ' : ''}${event.name}${event.channel === 'me' ? ' ' : ': '}`;
    if (event.color && /^#[a-fA-F0-9]{6}$/.test(event.color)) name.style.color = event.color;
    line.append(name, document.createTextNode(event.text));
    this.el('chat-lines').append(line);
    while (this.el('chat-lines').children.length > 60) this.el('chat-lines').firstChild?.remove();
    this.el('chat-lines').scrollTop = 100000;
    setTimeout(() => line.classList.add('old'), 18000);
  }
  update(state: Snapshot, p: Player, ping: number): void {
    this.state = state;
    this.player = p;
    const job = JOBS[p.job];
    this.text('district', districtAt(p.x, p.z, p.y));
    this.text('online', `${state.players.length} ONLINE`);
    this.text('ping', `${ping} ms`);
    this.text('hud-name', p.name);
    this.text('hud-job', job.name);
    this.el('job-marker').style.background = job.color;
    this.text('money', money(p.money));
    this.text('salary', `+${money(job.salary)}`);
    this.text('payday', `PAYDAY IN ${Math.max(0, Math.ceil((state.nextSalary - state.time) / 1000))}s`);
    for (const field of ['health', 'armor', 'hunger'] as const) {
      this.text(field, String(Math.ceil(p[field])));
      this.el(`${field}-bar`).style.width = `${p[field]}%`;
    }
    this.text('weapon-name', WEAPONS[p.weapon].name.toUpperCase());
    this.el('ammo').innerHTML = WEAPONS[p.weapon].magazine
      ? `${p.ammo[p.weapon] ?? 0}<span>/ ${p.reserve[p.weapon] ?? 0}</span>`
      : '';
    this.text(
      'weapon-tip',
      p.reloadUntil
        ? 'RELOADING…'
        : p.holding
          ? 'RMB freeze · Scroll distance · R rotate'
          : p.weapon === 'keys'
            ? 'LMB use · RMB lock'
            : p.weapon === 'physgun'
              ? 'Hold LMB grab · RMB freeze'
              : p.weapon === 'medkit'
                ? 'LMB heal others · RMB heal self'
                : p.weapon === 'toolgun'
                  ? 'Choose a tool in Q · LMB apply'
                  : WEAPONS[p.weapon].magazine
                    ? 'LMB fire · R reload'
                    : 'LMB use',
    );
    this.el('lockdown').hidden = !state.lockdown;
    this.el('status-flags').innerHTML =
      `${p.wantedUntil > state.time ? `<span class="flag danger" title="${escape(p.wantedReason)}">WANTED · ${Math.ceil((p.wantedUntil - state.time) / 1000)}s</span>` : ''}${p.warrantUntil > state.time ? `<span class="flag danger">SEARCH WARRANT · ${Math.ceil((p.warrantUntil - state.time) / 1000)}s</span>` : ''}${p.arrestedUntil ? `<span class="flag">IN CUSTODY · ${Math.max(0, Math.ceil((p.arrestedUntil - state.time) / 1000))}s</span>` : ''}${p.license ? '<span class="flag">GUN LICENSE</span>' : ''}`;
    this.el('death').hidden = !p.deadUntil;
    if (p.deadUntil)
      this.el('death').innerHTML =
        `<div class="eyebrow">YOUR STORY CONTINUES</div><strong>You died.</strong><span>Returning to Union Square in ${Math.max(0, Math.ceil((p.deadUntil - state.time) / 1000))} seconds</span>`;
    const v = state.vote;
    this.el('vote-banner').hidden = !v;
    if (v)
      this.text(
        'vote-banner',
        `VOTE: ${v.kind === 'demote' ? 'Demote ' : ''}${v.candidateName} ${v.kind === 'demote' ? 'from' : 'for'} ${JOBS[v.job].name} · F4 to vote · ${Math.max(0, Math.ceil((v.end - state.time) / 1000))}s`,
      );
    for (const countdown of document.querySelectorAll('[data-vote-countdown]'))
      countdown.textContent = `${Math.max(0, Math.ceil(((v?.end ?? state.time) - state.time) / 1000))}s left`;
    const strip = p.weapons
      .map(
        (w, i) =>
          `<span class="${w === p.weapon ? 'selected' : ''}"><kbd>${i + 1}</kbd>${WEAPONS[w].short}</span>`,
      )
      .join('');
    if (this.el('weapon-strip').innerHTML !== strip) this.el('weapon-strip').innerHTML = strip;
    const residentMenu = this.menu === 'context' && this.contextTarget?.kind === 'player';
    const resident = residentMenu ? state.players.find((v) => v.id === this.contextTarget?.id) : undefined;
    const giveNearby = resident && distance(eyes(p), eyes(resident)) <= GIVE_RANGE;
    const menuKey = JSON.stringify([
      p.job,
      p.money,
      p.weapon,
      p.pocket,
      p.weapons,
      giveNearby,
      state.players.map((v) => [
        v.id,
        v.name,
        v.job,
        v.deadUntil,
        v.arrestedUntil,
        v.wantedUntil,
        v.wantedReason,
        v.warrantUntil,
        v.license,
      ]),
      state.vote,
      state.entities.length,
      state.doors,
      state.laws,
      state.lockdown,
    ]);
    if (
      this.menu &&
      this.lastMenuKey !== menuKey &&
      (residentMenu || !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName ?? ''))
    ) {
      this.lastMenuKey = menuKey;
      // Keep resident details and permissions live without discarding a typed amount or reason.
      const focused = document.activeElement;
      const fields = residentMenu
        ? [...this.el('menu-content').querySelectorAll('input')].map((input) => ({
            id: input.id,
            value: input.value,
            start: input.selectionStart,
            end: input.selectionEnd,
          }))
        : [];
      this.renderMenu();
      for (const field of fields) {
        const input = document.getElementById(field.id) as HTMLInputElement | null;
        if (!input) continue;
        input.value = field.value;
        if (focused?.id === field.id && !input.disabled) {
          input.focus({ preventScroll: true });
          if (field.start !== null && field.end !== null) input.setSelectionRange(field.start, field.end);
        }
      }
    }
    this.drawMap();
  }
  target(target?: AimTarget): void {
    this.aim = target;
    this.el('target').hidden = !target || !!this.menu;
    if (!target) return;
    this.text('target-title', target.title);
    this.text('target-detail', target.detail);
    this.text('target-hint', target.hint);
  }
  updateVoice(voice: VoiceStatus): void {
    this.voice = voice;
    const key = `${this.playing}:${voice.connected}:${voice.microphone}:${voice.talking}:${voice.deafened}:${voice.speakers.map((p) => p.id + p.name).join(',')}:${[...voice.muted].join(',')}`;
    const meter = document.getElementById('voice-level');
    if (meter) meter.style.transform = `scaleX(${voice.level})`;
    if (key === this.lastVoiceKey) return;
    this.lastVoiceKey = key;
    this.refreshVoiceControls();
  }
  private refreshVoiceControls(): void {
    const v = this.voice;
    const hint = !v.connected
      ? 'Voice connecting…'
      : v.deafened
        ? 'Voice muted'
        : v.talking
          ? 'Talking to nearby players'
          : v.microphone === 'ready'
            ? 'Hold V to talk'
            : v.microphone === 'requesting'
              ? 'Allow microphone in browser'
              : v.microphone === 'unsupported'
                ? 'Voice needs HTTPS'
                : 'Enable microphone';
    const label = !this.playing
      ? 'Join to enable microphone'
      : v.microphone === 'ready'
        ? 'Turn microphone off'
        : v.microphone === 'requesting'
          ? 'Cancel microphone request'
          : v.microphone === 'blocked'
            ? 'Retry microphone'
            : 'Enable microphone';
    if (document.getElementById('voice-hint')) this.text('voice-hint', hint);
    document.getElementById('voice-hud')?.classList.toggle('transmitting', v.talking);
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-action="voice-mic"]')) {
      button.textContent = label;
      button.disabled = !this.playing || !v.connected || v.microphone === 'unsupported';
      button.setAttribute('aria-pressed', String(v.microphone === 'ready'));
    }
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-action="voice-deafen"]')) {
      button.textContent = v.deafened ? 'Unmute all voice' : 'Mute all voice';
      button.disabled = !this.playing;
      button.setAttribute('aria-pressed', String(v.deafened));
    }
    const speakers = document.getElementById('voice-speakers');
    if (speakers) {
      speakers.hidden = !v.speakers.length;
      speakers.innerHTML =
        v.speakers
          .slice(0, 4)
          .map(
            (p) =>
              `<button data-action="voice-mute" data-target="${p.id}" aria-label="Mute ${escape(p.name)}"><span class="voice-wave">ııı</span>${escape(p.name)}<small>MUTE</small></button>`,
          )
          .join('') +
        (v.speakers.length > 4
          ? `<small>+${v.speakers.length - 4} nearby speakers · Tab for players</small>`
          : '');
    }
    for (const button of this.root.querySelectorAll<HTMLButtonElement>(
      '#menu-content [data-action="voice-mute"]',
    )) {
      const id = button.dataset.target!;
      const name = this.state?.players.find((p) => p.id === id)?.name ?? 'resident';
      button.textContent = v.muted.has(id) ? 'Unmute' : 'Mute';
      button.setAttribute('aria-label', `${v.muted.has(id) ? 'Unmute' : 'Mute'} ${name}`);
      button.setAttribute('aria-pressed', String(v.muted.has(id)));
    }
    for (const indicator of this.root.querySelectorAll<HTMLElement>('[data-voice-speaker]')) {
      const id = indicator.dataset.voiceSpeaker!;
      const talking = id === this.player?.id ? v.talking : v.speakers.some((p) => p.id === id);
      indicator.textContent = v.muted.has(id) ? 'Voice muted' : talking ? 'Speaking nearby' : '';
    }
  }
  private voiceControls(): string {
    return `<section class="voice-settings"><h3>Proximity voice</h3><p>Enable your microphone, return to the streets, then <kbd>hold V</kbd> to talk. Players within 28 metres can hear you. Release V to stop. Sound follows their position and fades with distance.</p><div class="voice-actions"><button data-action="voice-mic">Enable microphone</button><button data-action="voice-deafen">Mute all voice</button></div><p class="muted">Your mic starts off. Menus, chat, losing focus and respawning stop transmission. Mute individual players in Tab. Headphones help prevent echo.</p></section>`;
  }
  renderMenu(): void {
    const p = this.player,
      s = this.state;
    const pages = this.playing
      ? ['jobs', 'shop', 'pocket', 'build', 'laws', 'players', 'account', 'help', 'settings']
      : ['help', 'settings'];
    this.el('menu-nav').innerHTML = pages
      .map(
        (page) =>
          `<button data-menu="${page}" class="${this.menu === page ? 'active' : ''}"><span>${icons[page]}</span>${{ jobs: 'Jobs', shop: 'Shop', pocket: 'Pocket', build: 'Build', laws: 'City laws', players: 'Players', account: 'Account', help: 'Field guide', settings: 'Settings' }[page]}</button>`,
      )
      .join('');
    this.text(
      'menu-footer',
      p ? `${p.name} · ${JOBS[p.job].name} · ${money(p.money)}` : 'Keyboard & mouse required',
    );
    let html = '';
    if (this.menu === 'pause')
      html = `<div class="section-heading"><span class="eyebrow">UNION DISTRICT</span><h2>You’re still in the city.</h2><p>Multiplayer continues while this menu is open.</p></div><button class="primary" data-action="resume">Return to the streets ↗</button><div class="pause-links"><button data-menu="jobs">Find a job</button><button data-menu="build">Build something</button><button data-menu="help">Read the field guide</button></div><p class="muted">Invite friends with this server address: <code>${escape(location.origin)}</code></p>${this.voiceControls()}`;
    if (this.menu === 'jobs' && p && s) {
      const job = JOBS[this.selectedJob],
        count = s.players.filter((v) => v.job === this.selectedJob).length;
      const full = job.max > 0 && count >= job.max,
        current = p.job === this.selectedJob;
      html = `<div class="section-heading"><span class="eyebrow">MAKE A LIVING</span><h2>Find your place.</h2><p>A uniform opens doors. What you do with it is up to you.</p></div>${this.voteHtml()}<div class="jobs-layout"><div class="job-list">${Object.entries(
        JOBS,
      )
        .map(
          ([id, j]) =>
            `<button class="job-row ${id === this.selectedJob ? 'selected' : ''}" data-job="${id}"><span class="job-swatch" style="--job:${j.color}">${j.name
              .split(' ')
              .map((w) => w[0])
              .join('')
              .slice(
                0,
                2,
              )}</span><span><b>${j.name}</b><small>${j.category}</small></span><em>${s.players.filter((v) => v.job === id).length}/${j.max || '∞'}</em></button>`,
        )
        .join(
          '',
        )}</div><div class="job-detail" style="--job:${job.color}"><div class="job-insignia">${job.name
        .split(' ')
        .map((w) => w[0])
        .join('')
        .slice(
          0,
          2,
        )}</div><span class="eyebrow">${job.category}</span><h3>${job.name}</h3><p>${job.description}</p><div class="job-facts"><div><span>SALARY</span><b>${money(job.salary)}<small> / payday</small></b></div><div><span>POSITIONS</span><b>${count} / ${job.max || 'Unlimited'}</b></div></div><div class="loadout"><span class="field-label">ISSUED EQUIPMENT</span><p>${job.loadout.length ? job.loadout.map((w) => WEAPONS[w].name).join(' · ') : 'Keys · Physics Gun · Tool Gun'}</p></div><button class="primary" data-action="job" data-target="${this.selectedJob}" ${current || full ? 'disabled' : ''}>${current ? 'Your current job' : full ? 'All positions filled' : job.vote && s.players.length > 1 ? 'Start a public vote ↗' : 'Take this job ↗'}</button>${job.vote ? '<small class="muted">Public vote when other players are online.</small>' : ''}</div></div>`;
    }
    if (this.menu === 'pocket' && p) {
      const items = p.pocket ?? [];
      html = `<div class="section-heading"><span class="eyebrow">CARRIED OBJECTS</span><h2>Your pocket.</h2><p>Aim at an object and press C to store it. Your props still count toward the build limit. Businesses stay in the world.</p><b class="balance">${items.length} / ${POCKET_CAPACITY} objects</b></div><p class="muted pocket-note">Contents survive job changes, death and reconnects. Storage and placement are unavailable while dead or in custody.</p><div class="catalog-grid">${items
        .map((e) => {
          const name =
            e.kind === 'weapon' && e.item
              ? WEAPONS[e.item].name
              : (PROPS.find((v) => v.id === e.kind)?.name ?? (e.kind === 'money' ? 'Cash bundle' : 'Food'));
          const detail =
            e.kind === 'weapon'
              ? `${e.loadedAmmo} loaded · ${e.reserveAmmo} reserve`
              : e.kind === 'money'
                ? money(e.cash)
                : `${Math.ceil(e.health)} health`;
          return `<article class="catalog-card pocket-card"><h3>${escape(name)}</h3><p>${detail}</p><button data-action="pocket-drop" data-target="${e.id}" ${p.deadUntil || p.arrestedUntil ? 'disabled' : ''}>Place in front of me</button></article>`;
        })
        .join(
          '',
        )}</div>${items.length ? '' : '<p>Your pocket is empty. Store loose firearms, cash, food or your own unfrozen building props.</p>'}`;
    }
    if (this.menu === 'shop' && p && s)
      html = `<div class="section-heading"><span class="eyebrow">DISTRICT CATALOG</span><h2>Set up shop.</h2><p>Purchased entities appear in front of you. Leave some clear space.</p><b class="balance">${money(p.money)} available</b></div>${WEAPONS[p.weapon].damage ? `<div class="command-field"><span>${WEAPONS[p.weapon].name} · ${p.ammo[p.weapon] ?? 0} loaded / ${p.reserve[p.weapon] ?? 0} reserve</span><button data-action="drop-weapon" ${JOBS[p.job].loadout.includes(p.weapon) ? 'disabled' : ''}>${JOBS[p.job].loadout.includes(p.weapon) ? 'Job-issued equipment' : 'Drop firearm'}</button></div><p class="muted">Dropped firearms keep their ammunition. Anyone nearby can pick them up.</p>` : ''}<div class="catalog-grid">${SHOP.map(
        (item) => {
          const allowed =
            (!item.jobs || item.jobs.includes(p.job)) &&
            !(item.id === 'printer' && GOVERNMENT.includes(p.job));
          const count = s.entities.filter((e) => e.owner === p.id && e.kind === item.kind).length;
          const atLimit = !!item.limit && count >= item.limit;
          return `<article class="catalog-card"><div class="item-sketch ${item.kind ?? item.id}"><span>${{ printer: '▤', microwave: '▣', shipment: '▰', ammo: '▥', armor: '◇', meal: '◒' }[item.kind ?? item.id] ?? '▣'}</span><small>${item.jobs ? item.jobs.map((j) => JOBS[j].name).join(' / ') : item.id === 'printer' ? 'ILLEGAL ENTITY' : 'SUPPLIES'}</small></div><h3>${item.name}</h3><p>${item.description}</p><button data-action="buy" data-target="${item.id}" ${!allowed || atLimit || p.money < item.price ? 'disabled' : ''}><span>${!allowed ? 'Job restricted' : atLimit ? 'Limit reached' : 'Purchase'}</span><b>${money(item.price)}</b></button></article>`;
        },
      ).join('')}</div>`;
    if (this.menu === 'build' && p && s)
      html = `<div class="section-heading"><span class="eyebrow">SANDBOX</span><h2>Make yourself at home.</h2><p>Spawn a prop. Equip your Physics Gun to move it. Right click to freeze.</p><b class="balance">${s.entities.filter((e) => e.owner === p.id && PROPS.some((pr) => pr.id === e.kind)).length + (p.pocket ?? []).filter((e) => PROPS.some((pr) => pr.id === e.kind)).length} / ${MAX_PROPS} props (including pocket)</b></div><div class="prop-grid">${PROPS.map((prop, i) => `<button class="prop-card" data-action="spawn" data-target="${prop.id}"><div class="prop-icon prop-${prop.id}"><span>${['▧', '◉', '▤', '▥', '▰', '⊓', '▥'][i]}</span></div><b>${prop.name}</b><small>FREE · PHYSICS PROP</small></button>`).join('')}</div><div class="tools-heading"><h3>Tool Gun</h3><span>Choose a mode, then left click your prop.</span></div><div class="tool-buttons">${['freeze', 'remove', 'paint', 'fading'].map((tool) => `<button data-action="tool" data-target="${tool}">${{ freeze: '❄ Freeze / unfreeze', remove: '× Remove', paint: '◐ Paint', fading: '◇ Fading door' }[tool]}</button>`).join('')}</div><p class="muted">F opens your fading doors for 6 seconds. Z undoes the last prop. While holding: scroll adjusts distance; R rotates.</p><button class="subtle" data-action="cleanup">Remove all my building props</button>`;
    if (this.menu === 'laws' && s && p)
      html = `<div class="section-heading"><span class="eyebrow">MUNICIPAL NOTICEBOARD</span><h2>The law of the district.</h2><p>Mayor: ${escape(s.players.find((v) => v.job === 'mayor')?.name ?? 'Office vacant')}</p></div><div class="laws-list">${s.laws.map((law, i) => `<div><span>${String(i + 1).padStart(2, '0')}</span><p>${escape(law)}</p></div>`).join('')}</div><p class="muted">${s.lockdown ? 'A citywide lockdown is in effect.' : 'The district is open. No lockdown is in effect.'}</p>${p.job === 'mayor' ? '<div class="command-field"><input id="new-law" maxlength="120" placeholder="Write a new city law" aria-label="New city law"><button data-action="add-law">Add law</button></div><div class="tool-buttons"><button data-action="lockdown">Toggle lockdown</button><button data-action="reset-laws">Restore default laws</button></div>' : ''}${this.voteHtml()}`;
    if (this.menu === 'players' && s)
      html = `<div class="section-heading"><span class="eyebrow">${escape(this.serverName)}</span><h2>The people make the city.</h2><p>${s.players.length} residents connected · Select a name to interact.</p></div><div class="scoreboard"><div class="score-head"><span>RESIDENT</span><span>OCCUPATION</span><span>STATUS</span><span>VOICE</span></div>${s.players.map((v) => `<div class="score-row"><span><i style="background:${JOBS[v.job].color}"></i>${v.id === p?.id ? `${escape(v.name)} <small>YOU</small>` : `<button class="resident-link" data-action="resident" data-target="${v.id}" aria-label="View ${escape(v.name)}">${escape(v.name)} <span aria-hidden="true">↗</span></button>`}</span><span style="color:${JOBS[v.job].color}">${JOBS[v.job].name}</span><span>${v.deadUntil ? 'Respawning' : v.arrestedUntil ? 'In custody' : v.wantedUntil ? 'Wanted' : 'In the district'}<small class="voice-speaking-label" data-voice-speaker="${v.id}"></small></span><span>${v.id === p?.id ? '<small>YOU</small>' : `<button class="voice-mute" data-action="voice-mute" data-target="${v.id}">Mute</button>`}</span></div>`).join('')}</div><p class="muted">Hold V for proximity voice after enabling your microphone in Settings. Mute controls only affect what you hear. Text chat: Y, /ooc for everyone, /g for your job group.</p>`;
    if (this.menu === 'context') html = this.contextHtml();
    if (this.menu === 'account')
      html = this.username
        ? `<div class="section-heading"><span class="eyebrow">YOUR ACCOUNT</span><h2>${escape(this.username)}</h2><p>Your inventory, props and property belong to this account. Sign in with this username and password on another browser to continue.</p></div><button data-action="account-signout">Sign out</button>`
        : `<div class="section-heading"><span class="eyebrow">SAVE YOUR RESIDENT</span><h2>Make yourself at home.</h2><p>Create an account to keep this guest’s inventory, props and property across browsers.</p></div>${this.accountForm('register', 'menu')}<button class="subtle" data-action="account-signout">Return to sign in</button>`;
    if (this.menu === 'help')
      html = `<div class="section-heading"><span class="eyebrow">THE FIELD GUIDE</span><h2>Welcome to the district.</h2><p>DarkRP is a social sandbox. The other players are the story.</p></div><div class="guide-start"><b>Your first five minutes</b><p>Choose a job in F4. Approach a door and press C to buy the property. Furnish your base with Q and the Physics Gun. A printer earns cash; a gun shop or kitchen earns customers. Use Y to introduce yourself.</p></div><div class="guide-start"><b>Find a home</b><p>West Alder has Alder Court and Mercer Court; Canal Quarter has Linden House and Canal House. Each has three walkable floors, two apartments per floor, and a living room/kitchen, bedroom and bathroom in every unit. Lobbies and stairs are shared. Approach a private unit door and press C to buy it. Foundry Ward and Southbank have four new businesses with connected rooms.</p><p>F4 → Account creates a username/password account and keeps your current guest’s belongings. Sign in on another browser to recover your inventory, props and property. Guests can still return using their saved browser identity.</p></div><div class="help-columns"><div><h3>On the streets</h3>${[
        ['W A S D', 'Move'],
        ['MOUSE', 'Look around'],
        ['SPACE', 'Jump'],
        ['SHIFT', 'Sprint'],
        ['CTRL', 'Crouch'],
        ['E', 'Use door, printer or shipment'],
        ['C', 'Resident, property & entity actions'],
        ['1–9 / SCROLL', 'Select equipment'],
        ['LMB / RMB', 'Use / alternate use'],
        ['R', 'Reload / rotate held prop'],
        ['Y / ENTER', 'Text chat'],
        ['HOLD V', 'Proximity voice (enable mic in Settings)'],
        ['TAB', 'Player list'],
        ['ESC', 'Release mouse / pause'],
      ]
        .map(([key, desc]) => `<div class="control-row"><kbd>${key}</kbd><span>${desc}</span></div>`)
        .join(
          '',
        )}<h3>Building</h3><p>Q opens props and tools. Hold LMB with the Physics Gun to grab your object, then RMB to freeze it. Scroll changes reach. R rotates. F activates fading doors. Z undoes your most recent prop.</p></div><div><h3>Talk & trade</h3><div class="commands"><code>/ooc message</code><p>Talk to the whole server.</p><code>/w message · /whisper message</code><p>Whisper to players within ${CHAT_RANGES.whisper} metres.</p><code>/y message · /yell message</code><p>Call out to players within ${CHAT_RANGES.yell} metres. Normal local chat reaches ${CHAT_RANGES.local} metres. Walls do not block text chat.</p><code>/me action</code><p>Describe an action to nearby players.</p><code>/advert message</code><p>Advertise your business for $50.</p><code>/give 100</code><p>Give money to the player you’re looking at.</p><code>/dropweapon</code><p>Drop your equipped personal firearm with its ammunition. Job-issued equipment cannot be dropped. E picks up a dropped firearm.</p><code>/dropmoney 100</code><p>Drop cash for someone to collect.</p><code>/g message</code><p>Speak to your job group.</p><code>/rpname First Last</code><p>Change your roleplay name.</p></div><h3>Law & order</h3><div class="commands"><code>/demote Full Name reason</code><p>Start a public demotion vote. A majority of residents must agree. Passed votes remove the role for five minutes.</p><code>/wanted Full Name reason</code><p>Government: mark a suspect wanted, then use the arrest baton.</p><code>/unwanted Full Name</code><p>Clear a suspect’s wanted status.</p><code>/warrant Full Name reason</code><p>Mayor or Chief: authorize a search. Officers can then ram the owner’s door.</p><code>/unwarrant Full Name</code><p>Mayor or Chief: revoke a search warrant.</p><code>/license Full Name · /unlicense Full Name</code><p>Mayor: grant or revoke a civilian gun license.</p><code>/addlaw text · /removelaw 1</code><p>Mayor: edit city laws.</p><code>/lockdown · /unlockdown</code><p>Mayor: start or end a city curfew.</p></div></div></div><div class="guide-start"><b>Play with friends</b><p>Everyone connects to the same server address. On a LAN, share the host computer’s IP and port. A private browser window creates a separate test identity. This is an early browser implementation: maps, characters and sounds are original; Source engine assets and vehicles are not included. Proximity voice is optional and requires HTTPS (or localhost).</p></div>`;
    if (this.menu === 'settings')
      html = `<div class="section-heading"><span class="eyebrow">MAKE IT YOURS</span><h2>Settings.</h2><p>Saved on this browser.</p></div><div class="settings-list"><label>Sound volume<output>${Math.round(this.settings.volume * 100)}%</output><input aria-label="Sound volume" data-setting="volume" type="range" min="0" max="1" step="0.05" value="${this.settings.volume}"></label><label>Voice volume<output>${Math.round(this.settings.voiceVolume * 100)}%</output><input aria-label="Voice volume" data-setting="voiceVolume" type="range" min="0" max="1" step="0.05" value="${this.settings.voiceVolume}"></label><label>Mouse sensitivity<output>${this.settings.sensitivity}</output><input aria-label="Mouse sensitivity" data-setting="sensitivity" type="range" min="0.2" max="2.5" step="0.1" value="${this.settings.sensitivity}"></label><label>Field of view<output>${this.settings.fov}</output><input aria-label="Field of view" data-setting="fov" type="range" min="65" max="105" step="1" value="${this.settings.fov}"></label><label>Graphics quality<select aria-label="Graphics quality" data-setting="quality"><option value="high" ${this.settings.quality === 'high' ? 'selected' : ''}>High · soft shadows</option><option value="low" ${this.settings.quality === 'low' ? 'selected' : ''}>Low · better performance</option></select></label></div><p class="muted">For smoother play on integrated graphics, choose Low. A mouse and keyboard are required.</p>${this.voiceControls()}`;
    this.el('menu-content').innerHTML = html;
    this.refreshVoiceControls();
  }
  voteHtml(): string {
    const v = this.state?.vote;
    if (!v) return '';
    const playerId = this.player?.id ?? '';
    const voted = v.voted.includes(playerId);
    const eligible = v.eligible.includes(playerId);
    const required = Math.floor(v.eligible.length / 2) + 1;
    return `<div class="vote-card ${v.kind === 'demote' ? 'demotion-vote' : ''}"><div><span class="eyebrow">${v.kind === 'demote' ? 'PUBLIC DEMOTION' : 'JOB ELECTION'}</span><b>${v.kind === 'demote' ? 'Remove ' : ''}${escape(v.candidateName)} ${v.kind === 'demote' ? 'from' : 'as'} ${JOBS[v.job].name}?</b>${v.reason ? `<p class="vote-reason">${escape(v.reason)}</p>` : ''}<span>${v.yes} yes · ${v.no} no · ${required} yes votes required · <span data-vote-countdown>${Math.max(0, Math.ceil((v.end - this.state!.time) / 1000))}s left</span></span><div class="vote-meter" role="meter" aria-label="Yes votes" aria-valuemin="0" aria-valuemax="${required}" aria-valuenow="${Math.min(v.yes, required)}"><i style="width:${Math.min(100, (v.yes / required) * 100)}%"></i></div>${v.kind === 'demote' ? '<span>Passed: return to Citizen; former role blocked for five minutes.</span>' : ''}</div>${!eligible ? '<span class="muted">JOINED AFTER VOTE STARTED</span>' : voted ? '<span class="muted">VOTE RECORDED</span>' : '<button data-action="vote" data-value="yes">Yes</button><button data-action="vote" data-value="no">No</button>'}</div>`;
  }

  contextHtml(): string {
    const t = this.contextTarget,
      p = this.player,
      s = this.state;
    if (!t || !p || !s)
      return '<div class="section-heading"><h2>Look at something first.</h2><p>Stand near a door, player, or shop entity and press C.</p></div>';
    if (t.kind === 'player') return this.residentHtml(t.id);
    let html = `<div class="section-heading"><span class="eyebrow">CONTEXT MENU</span><h2>${escape(t.title)}</h2><p>${escape(t.detail)}</p></div>`;
    if (t.kind === 'door') {
      const d = s.doors.find((v) => v.id === t.id)!;
      const owns = d.owner === p.id || d.coowners.includes(p.id) || (d.group && GOVERNMENT.includes(p.job));
      html += `<div class="context-actions"><button data-action="interact" data-target="${d.id}">${d.open ? 'Close' : 'Open'} door</button>${!d.owner && !d.group && !d.public ? `<button class="primary" data-action="door-buy" data-target="${d.id}" ${p.money < d.price ? 'disabled' : ''}>Buy property · ${money(d.price)}</button>` : ''}${owns && !d.public ? `<button data-action="door-lock" data-target="${d.id}">${d.locked ? 'Unlock' : 'Lock'} door</button>` : ''}</div>`;
      if (d.owner === p.id)
        html += `<div class="command-field"><input id="door-title" maxlength="40" value="${escape(d.name)}" aria-label="Property name"><button data-action="title" data-target="${d.id}">Rename</button></div><h3>Share keys</h3><div class="tool-buttons">${
          [
            ...s.players.filter((v) => v.id !== p.id),
            ...d.coowners
              .filter((id) => !s.players.some((v) => v.id === id))
              .map((id) => ({ id, name: `Offline resident (${id.slice(0, 8)})` })),
          ]
            .map(
              (v) =>
                `<button data-action="coowner" data-target="${d.id}" data-value="${v.id}">${d.coowners.includes(v.id) ? 'Revoke keys: ' : 'Give keys: '}${escape(v.name)}</button>`,
            )
            .join('') || '<p class="muted">Other residents will appear here when they connect.</p>'
        }</div><button class="subtle" data-action="door-sell" data-target="${d.id}">Sell property · ${money(Math.floor(d.price * 0.65))}</button>`;
    } else if (t.kind === 'entity') {
      const e = s.entities.find((v) => v.id === t.id);
      if (!e) return html + '<p>This entity is no longer here.</p>';
      html += `<div class="context-actions"><button class="primary" data-action="interact" data-target="${e.id}">${e.kind === 'weapon' ? 'Pick up firearm' : e.kind === 'shipment' ? `Take weapon${e.owner === p.id ? '' : ` · ${money(e.price)}`}` : e.kind === 'microwave' ? `Buy meal · ${money(e.price)}` : e.kind === 'printer' ? 'Collect earnings / confiscate' : 'Use entity'}</button></div>`;
      if (
        ['weapon', 'food', 'money'].includes(e.kind) ||
        (e.owner === p.id && PROPS.some((v) => v.id === e.kind))
      )
        html += `<button data-action="pocket-store" data-target="${e.id}" ${e.frozen || e.fading || e.heldBy || p.deadUntil || p.arrestedUntil || (p.pocket?.length ?? 0) >= POCKET_CAPACITY ? 'disabled' : ''}>Store in pocket · ${p.pocket?.length ?? 0}/${POCKET_CAPACITY}</button><p class="muted">Release and unfreeze props before storing. Fading props cannot be pocketed.</p>`;
      if (e.owner === p.id && ['shipment', 'microwave'].includes(e.kind))
        html += `<div class="command-field"><input id="entity-price" type="number" min="1" max="50000" value="${e.price}" aria-label="Shop selling price"><button data-action="price" data-target="${e.id}">Set price</button></div>`;
    }
    return html;
  }
  residentHtml(id: string): string {
    const p = this.player!,
      target = this.state?.players.find((v) => v.id === id);
    if (!target)
      return '<div class="section-heading"><span class="eyebrow">RESIDENT</span><h2>This resident has disconnected.</h2><p>Select another resident from the player list.</p></div><button data-menu="players">Back to players</button>';
    const unavailable = !!(p.deadUntil || p.arrestedUntil);
    const nearby = distance(eyes(p), eyes(target)) <= GIVE_RANGE;
    const canGive = nearby && !target.deadUntil && p.money > 0;
    const max = Math.min(MAX_TRANSFER, p.money);
    const reasonForm = (action: 'wanted' | 'warrant', label: string) =>
      `<form class="resident-form" data-resident-action="${action}" data-target="${id}"><label class="field-label" for="resident-${action}">${action === 'wanted' ? 'WANTED' : 'SEARCH WARRANT'} REASON</label><div class="command-field"><input id="resident-${action}" maxlength="90" required pattern=".*\\S.*" placeholder="Describe the roleplay reason" autocomplete="off"><button type="submit">${label}</button></div></form>`;
    return `<div class="section-heading"><span class="eyebrow">RESIDENT</span><h2>${escape(target.name)}</h2><p><span style="color:${JOBS[target.job].color}">${JOBS[target.job].name}</span> · ${target.deadUntil ? 'Respawning' : target.arrestedUntil ? 'In custody' : 'In the district'}</p></div>
      <div class="resident-status" aria-live="polite">${target.wantedUntil ? `<p>Wanted · ${escape(target.wantedReason)}</p>` : ''}${target.warrantUntil ? '<p>Search warrant active</p>' : ''}<p>${target.license ? 'Gun license granted' : 'No gun license'}</p></div>
      ${unavailable ? `<p class="muted">${p.deadUntil ? 'Wait until you respawn' : 'Wait until you leave custody'} to use resident actions.</p>` : ''}
      <fieldset class="resident-actions" ${unavailable || target.id === p.id ? 'disabled' : ''}>
        <section><h3>Give money</h3><p class="muted">${target.deadUntil ? 'This resident must respawn before receiving money.' : !nearby ? 'Move within 3.5 metres of this resident to give money.' : 'Stay close with a clear view of this resident.'} Your wallet: ${money(p.money)}.</p>
          <form class="resident-form" data-resident-action="give" data-target="${id}"><label class="field-label" for="resident-amount">AMOUNT IN DOLLARS</label><div class="command-field"><input id="resident-amount" type="number" min="1" max="${max}" step="1" required placeholder="100" autocomplete="off" ${canGive ? '' : 'disabled'}><button class="primary" type="submit" ${canGive ? '' : 'disabled'}>Give money</button></div></form>
        </section>
        ${GOVERNMENT.includes(p.job) ? `<section><h3>Government actions</h3>${!GOVERNMENT.includes(target.job) ? reasonForm('wanted', target.wantedUntil ? 'Update wanted status' : 'Mark wanted') : '<p class="muted">Government staff cannot be marked wanted.</p>'}${target.wantedUntil ? `<button data-action="unwanted" data-target="${id}">Clear wanted status</button>` : ''}${['chief', 'mayor'].includes(p.job) ? reasonForm('warrant', target.warrantUntil ? 'Renew warrant' : 'Issue warrant') + (target.warrantUntil ? `<button data-action="unwarrant" data-target="${id}">Revoke search warrant</button>` : '') : ''}${p.job === 'mayor' ? (GOVERNMENT.includes(target.job) ? '<p class="muted">Gun license supplied by government role.</p>' : `<button data-action="${target.license ? 'unlicense' : 'license'}" data-target="${id}">${target.license ? 'Revoke gun license' : 'Grant gun license'}</button>`) : ''}</section>` : ''}
        ${target.job !== 'citizen' ? `<section><h3>Request demotion</h3><p class="muted">Residents vote on whether this player should lose their job. Give a specific roleplay reason.</p><div class="command-field"><input id="demotion-reason" maxlength="90" placeholder="Reason for demotion" aria-label="Reason for demotion"><button data-action="demotion" data-target="${id}" ${this.state?.vote ? 'disabled' : ''}>Start vote</button></div>${this.state?.vote ? '<p class="muted">A public vote is already running.</p>' : ''}</section>` : ''}
      </fieldset>
      <div class="context-actions"><button data-menu="players">Back to players</button><button class="voice-mute" data-action="voice-mute" data-target="${id}">Mute</button><small data-voice-speaker="${id}"></small></div>`;
  }
  clickAction(action: string, target: string, value?: string): void {
    if (action === 'entry-login' || action === 'entry-register' || action === 'entry-guest') {
      this.entryMode(action.slice(6) as 'login' | 'register' | 'guest');
      return;
    }
    if (action === 'account-resume') {
      this.onConnect('', this.input('server-password').value, true);
      return;
    }
    if (action === 'account-signout') {
      this.onSignOut();
      return;
    }
    if (action === 'resident') {
      const resident = this.state?.players.find((p) => p.id === target);
      if (resident)
        this.open('context', { kind: 'player', id: target, title: resident.name, detail: '', hint: '' });
      return;
    }
    if (action === 'resume') {
      this.close();
      return;
    }
    if (action === 'voice-mic') {
      this.onVoice('mic');
      return;
    }
    if (action === 'voice-deafen') {
      this.onVoice('deafen');
      return;
    }
    if (action === 'voice-mute') {
      this.onVoice('mute', target);
      return;
    }
    if (action === 'vote') this.onAction('vote', undefined, value === 'yes');
    else if (action === 'demotion') this.onAction('demote', target, this.input('demotion-reason').value);
    else if (action === 'title') this.onAction('door-title', target, this.input('door-title').value);
    else if (action === 'coowner') this.onAction('door-coowner', target, value);
    else if (action === 'price') this.onAction('price', target, Number(this.input('entity-price').value));
    else if (action === 'add-law') {
      this.onChat(`/addlaw ${this.input('new-law').value}`);
      this.input('new-law').value = '';
    } else if (action === 'lockdown') this.onChat(this.state?.lockdown ? '/unlockdown' : '/lockdown');
    else if (action === 'reset-laws') this.onChat('/resetlaws');
    else {
      this.onAction(action, target);
      if (
        ['spawn', 'buy', 'job', 'tool', 'interact', 'drop-weapon', 'pocket-store', 'pocket-drop'].includes(
          action,
        )
      )
        this.close();
    }
  }
  drawMap(): void {
    const p = this.player,
      s = this.state;
    if (!p || !s) return;
    const canvas = this.el('minimap') as HTMLCanvasElement,
      ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 300, 240);
    ctx.fillStyle = '#192423';
    ctx.fillRect(0, 0, 300, 240);
    ctx.save();
    ctx.translate(150, 120);
    const scale = 2.1;
    for (const b of BUILDINGS) {
      const side = Math.abs(Math.sin(b.rotation)) > 0.5,
        w = side ? b.d : b.w,
        d = side ? b.w : b.d;
      ctx.fillStyle = '#45514a';
      ctx.fillRect((b.x - p.x - w / 2) * scale, (b.z - p.z - d / 2) * scale, w * scale, d * scale);
      ctx.strokeStyle = '#667062';
      ctx.lineWidth = 1;
      ctx.strokeRect((b.x - p.x - w / 2) * scale, (b.z - p.z - d / 2) * scale, w * scale, d * scale);
    }
    ctx.fillStyle = '#728676';
    ctx.fillRect((-2.8 - p.x) * scale, (6.2 - p.z) * scale, 5.6 * scale, 5.6 * scale);
    for (const d of s.doors) {
      ctx.fillStyle = d.owner === p.id ? '#e3b777' : '#79846b';
      ctx.fillRect((d.x - p.x) * scale - 2, (d.z - p.z) * scale - 2, 4, 4);
    }
    for (const other of s.players)
      if (other.id !== p.id && Math.hypot(other.x - p.x, other.z - p.z) < 28) {
        ctx.fillStyle = JOBS[other.job].color;
        ctx.beginPath();
        ctx.arc((other.x - p.x) * scale, (other.z - p.z) * scale, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    ctx.rotate(-p.yaw);
    ctx.fillStyle = '#ead7a6';
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 5);
    ctx.lineTo(0, 2);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
