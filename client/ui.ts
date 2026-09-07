import { GOVERNMENT, JOBS, MAX_PROPS, PROPS, SHOP, VERSION, WEAPONS } from '../shared/catalog.ts';
import { BUILDINGS, districtAt } from '../shared/map.ts';
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
  onConnect: (name: string, password: string) => void = () => {};
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
          <div class="entry-rule"></div><form id="join-form"><label class="field-label" for="player-name">YOUR ROLEPLAY NAME</label><input id="player-name" name="name" minlength="2" maxlength="24" required autocomplete="nickname" placeholder="Choose a name" value="${escape(localStorage.getItem('openrp-name') ?? '')}"><div id="password-row" hidden><label class="field-label" for="server-password">SERVER PASSWORD</label><input id="server-password" type="password" autocomplete="current-password"></div><button id="join-button" class="primary join-button" type="submit"><span>Enter the district</span><span>↗</span></button></form>
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
        <div id="weapon-strip"></div><div id="chat" class="chat"><div id="chat-lines" aria-live="polite"></div><form id="chat-form" hidden><span>LOCAL</span><input id="chat-input" maxlength="240" autocomplete="off" aria-label="Chat message" placeholder="Message nearby players, or /ooc for everyone"><kbd>↵</kbd></form></div>
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
    this.el('join-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const name = this.input('player-name').value.trim();
      if (name.length < 2) return;
      this.onConnect(name, this.input('server-password').value);
    });
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
  }
  el(id: string): HTMLElement {
    return document.getElementById(id)!;
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
  open(menu: string): void {
    if (this.menu === menu) {
      this.close();
      return;
    }
    this.closeChat(false);
    this.menu = menu;
    if (menu === 'context') this.contextTarget = this.aim;
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
    this.el('chat-form').hidden = false;
    this.el('chat').classList.add('active');
    this.onMenu();
    setTimeout(() => this.input('chat-input').focus(), 0);
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
    name.textContent = `${event.channel === 'ooc' ? '[OOC] ' : event.channel === 'advert' ? '[AD] ' : event.channel === 'group' ? '[GROUP] ' : event.channel === 'me' ? '* ' : ''}${event.name}${event.channel === 'me' ? ' ' : ': '}`;
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
    this.text('district', districtAt(p.x, p.z));
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
      `${p.wantedUntil ? '<span class="flag danger">WANTED</span>' : ''}${p.arrestedUntil ? `<span class="flag">IN CUSTODY · ${Math.max(0, Math.ceil((p.arrestedUntil - state.time) / 1000))}s</span>` : ''}${p.license ? '<span class="flag">GUN LICENSE</span>' : ''}`;
    this.el('death').hidden = !p.deadUntil;
    if (p.deadUntil)
      this.el('death').innerHTML =
        `<div class="eyebrow">YOUR STORY CONTINUES</div><strong>You died.</strong><span>Returning to Union Square in ${Math.max(0, Math.ceil((p.deadUntil - state.time) / 1000))} seconds</span>`;
    const v = state.vote;
    this.el('vote-banner').hidden = !v;
    if (v)
      this.text(
        'vote-banner',
        `VOTE: ${state.players.find((vp) => vp.id === v.candidate)?.name ?? 'Citizen'} for ${JOBS[v.job].name} · F4 to vote · ${Math.max(0, Math.ceil((v.end - state.time) / 1000))}s`,
      );
    const strip = p.weapons
      .map(
        (w, i) =>
          `<span class="${w === p.weapon ? 'selected' : ''}"><kbd>${i + 1}</kbd>${WEAPONS[w].short}</span>`,
      )
      .join('');
    if (this.el('weapon-strip').innerHTML !== strip) this.el('weapon-strip').innerHTML = strip;
    const menuKey = `${p.job}:${p.money}:${p.weapons.join(',')}:${state.players.map((v) => v.id + v.job).join(',')}:${state.vote?.id}:${state.vote?.yes}:${state.vote?.no}:${state.entities.length}:${JSON.stringify(state.doors)}:${state.laws.join('|')}`;
    if (
      this.menu &&
      this.lastMenuKey !== menuKey &&
      !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName ?? '')
    ) {
      this.lastMenuKey = menuKey;
      this.renderMenu();
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
      '.scoreboard [data-action="voice-mute"]',
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
      ? ['jobs', 'shop', 'build', 'laws', 'players', 'help', 'settings']
      : ['help', 'settings'];
    this.el('menu-nav').innerHTML = pages
      .map(
        (page) =>
          `<button data-menu="${page}" class="${this.menu === page ? 'active' : ''}"><span>${icons[page]}</span>${{ jobs: 'Jobs', shop: 'Shop', build: 'Build', laws: 'City laws', players: 'Players', help: 'Field guide', settings: 'Settings' }[page]}</button>`,
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
    if (this.menu === 'shop' && p && s)
      html = `<div class="section-heading"><span class="eyebrow">DISTRICT CATALOG</span><h2>Set up shop.</h2><p>Purchased entities appear in front of you. Leave some clear space.</p><b class="balance">${money(p.money)} available</b></div><div class="catalog-grid">${SHOP.map(
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
      html = `<div class="section-heading"><span class="eyebrow">SANDBOX</span><h2>Make yourself at home.</h2><p>Spawn a prop. Equip your Physics Gun to move it. Right click to freeze.</p><b class="balance">${s.entities.filter((e) => e.owner === p.id && PROPS.some((pr) => pr.id === e.kind)).length} / ${MAX_PROPS} props</b></div><div class="prop-grid">${PROPS.map((prop, i) => `<button class="prop-card" data-action="spawn" data-target="${prop.id}"><div class="prop-icon prop-${prop.id}"><span>${['▧', '◉', '▤', '▥', '▰', '⊓', '▥'][i]}</span></div><b>${prop.name}</b><small>FREE · PHYSICS PROP</small></button>`).join('')}</div><div class="tools-heading"><h3>Tool Gun</h3><span>Choose a mode, then left click your prop.</span></div><div class="tool-buttons">${['freeze', 'remove', 'paint', 'fading'].map((tool) => `<button data-action="tool" data-target="${tool}">${{ freeze: '❄ Freeze / unfreeze', remove: '× Remove', paint: '◐ Paint', fading: '◇ Fading door' }[tool]}</button>`).join('')}</div><p class="muted">F opens your fading doors for 6 seconds. Z undoes the last prop. While holding: scroll adjusts distance; R rotates.</p><button class="subtle" data-action="cleanup">Remove all my building props</button>`;
    if (this.menu === 'laws' && s && p)
      html = `<div class="section-heading"><span class="eyebrow">MUNICIPAL NOTICEBOARD</span><h2>The law of the district.</h2><p>Mayor: ${escape(s.players.find((v) => v.job === 'mayor')?.name ?? 'Office vacant')}</p></div><div class="laws-list">${s.laws.map((law, i) => `<div><span>${String(i + 1).padStart(2, '0')}</span><p>${escape(law)}</p></div>`).join('')}</div><p class="muted">${s.lockdown ? 'A citywide lockdown is in effect.' : 'The district is open. No lockdown is in effect.'}</p>${p.job === 'mayor' ? '<div class="command-field"><input id="new-law" maxlength="120" placeholder="Write a new city law" aria-label="New city law"><button data-action="add-law">Add law</button></div><div class="tool-buttons"><button data-action="lockdown">Toggle lockdown</button><button data-action="reset-laws">Restore default laws</button></div>' : ''}${this.voteHtml()}`;
    if (this.menu === 'players' && s)
      html = `<div class="section-heading"><span class="eyebrow">${escape(this.serverName)}</span><h2>The people make the city.</h2><p>${s.players.length} residents connected</p></div><div class="scoreboard"><div class="score-head"><span>RESIDENT</span><span>OCCUPATION</span><span>STATUS</span><span>VOICE</span></div>${s.players.map((v) => `<div class="score-row"><span><i style="background:${JOBS[v.job].color}"></i>${escape(v.name)}${v.id === p?.id ? ' <small>YOU</small>' : ''}</span><span style="color:${JOBS[v.job].color}">${JOBS[v.job].name}</span><span>${v.deadUntil ? 'Respawning' : v.arrestedUntil ? 'In custody' : v.wantedUntil ? 'Wanted' : 'In the district'}<small class="voice-speaking-label" data-voice-speaker="${v.id}"></small></span><span>${v.id === p?.id ? '<small>YOU</small>' : `<button class="voice-mute" data-action="voice-mute" data-target="${v.id}">Mute</button>`}</span></div>`).join('')}</div><p class="muted">Hold V for proximity voice after enabling your microphone in Settings. Mute controls only affect what you hear. Text chat: Y, /ooc for everyone, /g for your job group.</p>`;
    if (this.menu === 'context') html = this.contextHtml();
    if (this.menu === 'help')
      html = `<div class="section-heading"><span class="eyebrow">THE FIELD GUIDE</span><h2>Welcome to the district.</h2><p>DarkRP is a social sandbox. The other players are the story.</p></div><div class="guide-start"><b>Your first five minutes</b><p>Choose a job in F4. Approach a door and press C to buy the property. Furnish your base with Q and the Physics Gun. A printer earns cash; a gun shop or kitchen earns customers. Use Y to introduce yourself.</p></div><div class="help-columns"><div><h3>On the streets</h3>${[
        ['W A S D', 'Move'],
        ['MOUSE', 'Look around'],
        ['SPACE', 'Jump'],
        ['SHIFT', 'Sprint'],
        ['CTRL', 'Crouch'],
        ['E', 'Use door, printer or shipment'],
        ['C', 'Property & entity actions'],
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
        )}<h3>Building</h3><p>Q opens props and tools. Hold LMB with the Physics Gun to grab your object, then RMB to freeze it. Scroll changes reach. R rotates. F activates fading doors. Z undoes your most recent prop.</p></div><div><h3>Talk & trade</h3><div class="commands"><code>/ooc message</code><p>Talk to the whole server.</p><code>/me action</code><p>Describe an action to nearby players.</p><code>/advert message</code><p>Advertise your business for $50.</p><code>/give 100</code><p>Give money to the player you’re looking at.</p><code>/dropmoney 100</code><p>Drop cash for someone to collect.</p><code>/g message</code><p>Speak to your job group.</p><code>/rpname First Last</code><p>Change your roleplay name.</p></div><h3>Law & order</h3><div class="commands"><code>/wanted Full Name reason</code><p>Government: mark a suspect wanted, then use the arrest baton.</p><code>/unwanted Full Name</code><p>Clear a suspect’s wanted status.</p><code>/warrant Full Name reason</code><p>Mayor or Chief: authorize a search. Officers can then ram the owner’s door.</p><code>/license Full Name</code><p>Mayor: grant a gun license.</p><code>/addlaw text · /removelaw 1</code><p>Mayor: edit city laws.</p><code>/lockdown · /unlockdown</code><p>Mayor: start or end a city curfew.</p></div></div></div><div class="guide-start"><b>Play with friends</b><p>Everyone connects to the same server address. On a LAN, share the host computer’s IP and port. A private browser window creates a separate test identity. This is an early browser implementation: maps, characters and sounds are original; Source engine assets and vehicles are not included. Proximity voice is optional and requires HTTPS (or localhost).</p></div>`;
    if (this.menu === 'settings')
      html = `<div class="section-heading"><span class="eyebrow">MAKE IT YOURS</span><h2>Settings.</h2><p>Saved on this browser.</p></div><div class="settings-list"><label>Sound volume<output>${Math.round(this.settings.volume * 100)}%</output><input aria-label="Sound volume" data-setting="volume" type="range" min="0" max="1" step="0.05" value="${this.settings.volume}"></label><label>Voice volume<output>${Math.round(this.settings.voiceVolume * 100)}%</output><input aria-label="Voice volume" data-setting="voiceVolume" type="range" min="0" max="1" step="0.05" value="${this.settings.voiceVolume}"></label><label>Mouse sensitivity<output>${this.settings.sensitivity}</output><input aria-label="Mouse sensitivity" data-setting="sensitivity" type="range" min="0.2" max="2.5" step="0.1" value="${this.settings.sensitivity}"></label><label>Field of view<output>${this.settings.fov}</output><input aria-label="Field of view" data-setting="fov" type="range" min="65" max="105" step="1" value="${this.settings.fov}"></label><label>Graphics quality<select aria-label="Graphics quality" data-setting="quality"><option value="high" ${this.settings.quality === 'high' ? 'selected' : ''}>High · soft shadows</option><option value="low" ${this.settings.quality === 'low' ? 'selected' : ''}>Low · better performance</option></select></label></div><p class="muted">For smoother play on integrated graphics, choose Low. A mouse and keyboard are required.</p>${this.voiceControls()}`;
    this.el('menu-content').innerHTML = html;
    this.refreshVoiceControls();
  }
  voteHtml(): string {
    const v = this.state?.vote;
    if (!v) return '';
    const voted = v.voted.includes(this.player?.id ?? '');
    return `<div class="vote-card"><div><b>${escape(this.state?.players.find((p) => p.id === v.candidate)?.name)} for ${JOBS[v.job].name}</b><span>${v.yes} yes · ${v.no} no · ${Math.max(0, Math.ceil((v.end - this.state!.time) / 1000))} seconds left</span></div>${voted ? '<span class="muted">VOTE RECORDED</span>' : '<button data-action="vote" data-value="yes">Yes</button><button data-action="vote" data-value="no">No</button>'}</div>`;
  }
  contextHtml(): string {
    const t = this.contextTarget,
      p = this.player,
      s = this.state;
    if (!t || !p || !s)
      return '<div class="section-heading"><h2>Look at something first.</h2><p>Stand near a door, player, or shop entity and press C.</p></div>';
    let html = `<div class="section-heading"><span class="eyebrow">CONTEXT MENU</span><h2>${escape(t.title)}</h2><p>${escape(t.detail)}</p></div>`;
    if (t.kind === 'door') {
      const d = s.doors.find((v) => v.id === t.id)!;
      const owns = d.owner === p.id || d.coowners.includes(p.id) || (d.group && GOVERNMENT.includes(p.job));
      html += `<div class="context-actions"><button data-action="interact" data-target="${d.id}">${d.open ? 'Close' : 'Open'} door</button>${!d.owner && !d.group ? `<button class="primary" data-action="door-buy" data-target="${d.id}" ${p.money < d.price ? 'disabled' : ''}>Buy property · ${money(d.price)}</button>` : ''}${owns ? `<button data-action="door-lock" data-target="${d.id}">${d.locked ? 'Unlock' : 'Lock'} door</button>` : ''}</div>`;
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
      html += `<div class="context-actions"><button class="primary" data-action="interact" data-target="${e.id}">${e.kind === 'shipment' ? `Take weapon${e.owner === p.id ? '' : ` · ${money(e.price)}`}` : e.kind === 'microwave' ? `Buy meal · ${money(e.price)}` : e.kind === 'printer' ? 'Collect earnings / confiscate' : 'Use entity'}</button></div>`;
      if (e.owner === p.id && ['shipment', 'microwave'].includes(e.kind))
        html += `<div class="command-field"><input id="entity-price" type="number" min="1" max="50000" value="${e.price}" aria-label="Shop selling price"><button data-action="price" data-target="${e.id}">Set price</button></div>`;
    } else
      html +=
        '<p>Use /give with this player in your crosshair to transfer cash. Government commands use the full name shown above.</p>';
    return html;
  }
  clickAction(action: string, target: string, value?: string): void {
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
      if (['spawn', 'buy', 'job', 'tool', 'interact'].includes(action)) this.close();
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
