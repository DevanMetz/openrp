import { CHAT_RANGES } from '../shared/catalog.ts';

const controls = (rows: [string, string][]) =>
  rows
    .map(
      ([key, description]) => `<div class="control-row"><kbd>${key}</kbd><span>${description}</span></div>`,
    )
    .join('');

const commands = (rows: [string, string][]) =>
  `<dl class="guide-commands">${rows.map(([command, description]) => `<div><dt><code>${command}</code></dt><dd>${description}</dd></div>`).join('')}</dl>`;

const topic = (id: string, title: string, description: string, content: string) =>
  `<details class="guide-topic" id="guide-${id}"><summary id="guide-${id}-summary"><span><strong>${title}</strong><small>${description}</small></span><span class="guide-toggle" aria-hidden="true">+</span></summary><div class="guide-topic-body">${content}</div></details>`;

export function guideHtml(playing: boolean): string {
  return `<div class="section-heading"><span class="eyebrow">THE FIELD GUIDE</span><h2>Make the city yours.</h2><p>A social sandbox. Choose a role, build a home and meet the neighbours.</p></div>
    <section class="guide-first" aria-labelledby="guide-first-title"><h3 id="guide-first-title">Your first five minutes</h3><ol class="guide-steps">
      <li><span class="guide-step-number" aria-hidden="true">01</span><div><h4>Choose your role</h4><p>Open <kbd>F4</kbd> to explore jobs and their pay. Start a business, serve the city or make your own way.</p></div></li>
      <li><span class="guide-step-number" aria-hidden="true">02</span><div><h4>Find your place</h4><p>Look at an unowned door and press <kbd>C</kbd> to buy it. Open <kbd>Q</kbd> to furnish it with props.</p></div></li>
      <li><span class="guide-step-number" aria-hidden="true">03</span><div><h4>Say hello</h4><p>Press <kbd>Y</kbd> to talk nearby. Use <code>/ooc</code> for the whole city, or enable voice in Settings.</p></div></li>
    </ol><div class="guide-actions">${playing ? '<button data-menu="jobs">Explore jobs <span aria-hidden="true">↗</span></button><button data-menu="build">Browse props <span aria-hidden="true">↗</span></button>' : '<span>Join the city to choose a job and start building.</span>'}<button data-menu="settings">Voice &amp; settings <span aria-hidden="true">↗</span></button></div></section>
    <div class="guide-reference"><h3>Keep this guide handy</h3><p>Press <kbd>F1</kbd> any time. Open a topic below for the full reference.</p></div>
    ${topic(
      'controls',
      'Controls & building',
      'Movement, equipment, menus and your Physics Gun',
      `<div class="guide-columns"><section><h4>On the streets</h4>${controls([
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
      ])}</section><section><h4>Menus & communication</h4>${controls([
        ['F4', 'Jobs, shop, pocket and roleplay'],
        ['Q', 'Props & tools'],
        ['F1', 'Field guide'],
        ['TAB', 'Player list'],
        ['Y / ENTER', 'Text chat'],
        ['HOLD V', 'Proximity voice (enable mic in Settings)'],
        ['ESC', 'Close menu / release mouse'],
      ])}</section></div><h4>Build with your Physics Gun</h4><p>Open <kbd>Q</kbd> to spawn a prop. Equip your Physics Gun, hold LMB to grab your object, then RMB to freeze it. Scroll changes reach; <kbd>R</kbd> rotates. The Tool Gun can freeze, remove, paint or make a fading door. <kbd>F</kbd> opens your fading doors for six seconds; <kbd>Z</kbd> undoes your most recent prop.</p><p class="guide-note">If your browser cannot capture the mouse, hold right mouse and drag to look. Use Alt + left click for alternate use. Multiplayer continues while menus are open.</p>`,
    )}
    ${topic(
      'chat',
      'Talk & trade',
      'Chat ranges, private messages, radio and money',
      `<p>Press <kbd>Y</kbd> or <kbd>Enter</kbd> to type. Ordinary chat reaches ${CHAT_RANGES.local} metres; walls do not block text chat.</p>${commands(
        [
          ['/ooc message', 'Talk to the whole server.'],
          ['/w message · /whisper message', `Whisper to players within ${CHAT_RANGES.whisper} metres.`],
          ['/y message · /yell message', `Call out to players within ${CHAT_RANGES.yell} metres.`],
          ['/me action', 'Describe an action to nearby players.'],
          [
            '/pm "Full Name" message',
            'Message one connected resident by exact name (quote names containing spaces) or player ID. Only the sender and recipient receive it; moderation logs record the message and recipient. No offline delivery.',
          ],
          [
            '/channel 0–100 · /channel off',
            'Tune text radio or turn it off. /channel alone shows your tuning. Everyone starts on channel 1 when joining; tuning is temporary.',
          ],
          [
            '/radio message',
            'Reach anyone tuned to your channel across the city. These are open channels, and messages are logged for moderation. Text radio is separate from proximity voice.',
          ],
          ['/g message', 'Speak to your job group.'],
          ['/advert message', 'Advertise your business for $50.'],
          ['/give 100', 'Give money to the nearby player you’re looking at.'],
          ['/dropmoney 100', 'Drop cash for someone to collect.'],
          [
            '/dropweapon',
            'Drop your equipped personal firearm with its ammunition. Job-issued equipment cannot be dropped. E picks up a dropped firearm.',
          ],
          [
            '/job Your title',
            'Set a custom roleplay title without changing jobs. Use /job alone to reset it.',
          ],
          ['/rpname First Last', 'Change your roleplay name.'],
        ],
      )}`,
    )}
    ${topic(
      'law',
      'Law & order',
      'Resident actions, policing and mayor commands',
      `<p>Open <kbd>F4</kbd> → City laws to read the district’s current rules. Point at a resident and press <kbd>C</kbd> for available actions.</p>${commands(
        [
          [
            '/demote Full Name reason',
            'Start a public demotion vote. A majority of residents must agree. Passed votes remove the role for five minutes.',
          ],
          ['/wanted Full Name reason', 'Government: mark a suspect wanted, then use the arrest baton.'],
          ['/unwanted Full Name', 'Clear a suspect’s wanted status.'],
          [
            '/warrant Full Name reason',
            'Mayor or Chief: authorize a search. Officers can then ram the owner’s door.',
          ],
          ['/unwarrant Full Name', 'Mayor or Chief: revoke a search warrant.'],
          ['/license Full Name · /unlicense Full Name', 'Mayor: grant or revoke a civilian gun license.'],
          ['/addlaw text · /removelaw 1', 'Mayor: edit city laws.'],
          [
            '/broadcast message',
            'Mayor: address the entire server. Unavailable while dead or in custody; broadcasts are logged with other text chat.',
          ],
          ['/lockdown · /unlockdown', 'Mayor: start or end a city curfew.'],
        ],
      )}`,
    )}
    ${topic('home', 'Homes & belongings', 'Apartment locations, ownership and saved characters', `<h4>Find a home</h4><p>West Alder has Alder Court and Mercer Court; Canal Quarter has Linden House and Canal House. Each has three walkable floors and two apartments per floor, with a living room/kitchen, bedroom and bathroom in every unit. Lobbies and stairs are shared. Look at a private unit door and press <kbd>C</kbd> to buy it.</p><p>Foundry Ward and Southbank have four businesses with connected rooms. A gun shop or kitchen earns customers; money printers earn cash but are illegal under the default city laws.</p><h4>Keep your resident</h4><p><kbd>F4</kbd> → Account creates a username/password account and keeps your current guest’s belongings. Sign in on another browser to recover your inventory, props and property. Guests can return using their saved browser identity.</p><h4>Carry your props</h4><p>Point at your object and press <kbd>C</kbd> to pocket eligible items. Open <kbd>F4</kbd> → Pocket to place them again.</p>`)}
    ${topic('friends', 'Play with friends', 'Joining the same server and using proximity voice', `<p>Everyone connects to the same server address. On a LAN, share the host computer’s IP and port. A private browser window creates a separate test identity.</p><h4>Speak nearby</h4><p>Enable your microphone in Settings, return to the streets, then hold <kbd>V</kbd> to talk. Release it to stop. Proximity voice is optional and requires HTTPS (or localhost); headphones help prevent echo.</p><p class="guide-note">This is an early browser implementation. Maps, characters and sounds are original; Source engine assets and vehicles are not included.</p>`)}
  `;
}
