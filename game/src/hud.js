// hud.js — every DOM element the player sees. The sim never touches the DOM;
// it calls these setters, and this module owns the markup updates.
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE, TEAM_NAME } from './state.js';

export function createHud(state, callbacks) {
  const $ = (id) => document.getElementById(id);
  const els = {
    healthNum: $('health-num'),
    healthFill: $('health-fill'),
    armorNum: $('armor-num'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    ammoLabel: $('ammo-label'),
    money: $('money'),
    timer: $('timer'),
    scoreEmber: $('score-ember'),
    scoreSlag: $('score-slag'),
    aliveEmber: $('alive-ember'),
    aliveSlag: $('alive-slag'),
    roundNum: $('round-num'),
    killfeed: $('killfeed'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    bombStatus: $('bomb-status'),
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    damage: $('damage'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'),
    playBtn: $('play-btn'),
    buyMenu: $('buy-menu'),
    buyMoney: $('buy-money'),
    endOverlay: $('end-overlay'),
    endTitle: $('end-title'),
    endSub: $('end-sub'),
    endBtn: $('end-btn'),
    weaponName: $('weapon-name'),
    grenadeCount: $('grenade-count'),
    hint: $('hint'),
  };

  let bannerT = 0;
  let hitT = 0;

  function setHealth(hp, armor) {
    els.healthNum.textContent = Math.ceil(hp);
    els.healthFill.style.width = Math.max(0, hp) + '%';
    els.healthFill.style.background = hp > 50 ? '#e8722a' : hp > 25 ? '#d8a31e' : '#c0392b';
    els.armorNum.textContent = Math.ceil(armor);
  }

  function setAmmo(mag, reserve, label) {
    els.ammoMag.textContent = mag;
    els.ammoReserve.textContent = '/ ' + reserve;
    els.ammoLabel.textContent = label;
  }

  function setMoney(m) { els.money.textContent = '$' + m; }
  function setTimer(t) {
    const s = Math.max(0, Math.ceil(t));
    els.timer.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    els.timer.style.color = s <= 10 && state.phase === 'live' ? '#c0392b' : '#e9e6df';
  }
  function setScore() {
    els.scoreEmber.textContent = state.score[0];
    els.scoreSlag.textContent = state.score[1];
    els.roundNum.textContent = 'ROUND ' + state.round;
  }
  function setAlive(ember, slag) {
    els.aliveEmber.textContent = '●'.repeat(ember) + '○'.repeat(5 - ember);
    els.aliveSlag.textContent = '●'.repeat(slag) + '○'.repeat(5 - slag);
  }
  function setWeaponName(name, grenades) {
    els.weaponName.textContent = name;
    els.grenadeCount.textContent = grenades > 0 ? '◉ ' + grenades : '';
  }

  function setCrosshair(spread) {
    // Spread in radians -> pixels of crosshair gap.
    const gap = 4 + spread * 900;
    els.crosshair.style.setProperty('--gap', gap.toFixed(1) + 'px');
  }

  function hitMarker(kill) {
    els.hitmarker.classList.add('on');
    if (kill) els.hitmarker.classList.add('kill');
    hitT = kill ? 0.25 : 0.12;
  }

  function damageFlash() {
    els.damage.style.opacity = '0.55';
    window.setTimeout(() => { els.damage.style.opacity = '0'; }, 120);
  }

  function addFeed(text, team) {
    const div = document.createElement('div');
    div.className = 'feed-item';
    div.style.color = team === 0 ? '#e8722a' : team === 1 ? '#2aa8a0' : '#98a0a8';
    div.textContent = text;
    els.killfeed.prepend(div);
    while (els.killfeed.children.length > 5) els.killfeed.lastChild.remove();
    window.setTimeout(() => { if (div.parentNode) div.remove(); }, 6000);
  }

  function showBanner(title, sub, ttl = 3) {
    els.bannerTitle.textContent = title;
    els.bannerSub.textContent = sub || '';
    els.banner.classList.remove('hidden');
    bannerT = ttl;
  }
  function hideBanner() { els.banner.classList.add('hidden'); }

  function showOverlay(kind) {
    els.buyMenu.classList.add('hidden');
    els.endOverlay.classList.add('hidden');
    els.overlay.classList.remove('hidden');
    if (kind === 'start') {
      els.overlayTitle.textContent = 'FOUNDRY YARD';
      els.overlayCopy.textContent = 'Five on five. Plant the charge at the Furnace or wipe out Slag. ' +
        'Money buys guns between rounds — stopping to aim beats spraying.';
      els.playBtn.textContent = 'Click to play';
    } else if (kind === 'paused') {
      els.overlayTitle.textContent = 'PAUSED';
      els.overlayCopy.textContent = 'Click to keep playing. The round clock is still running.';
      els.playBtn.textContent = 'Resume';
    } else if (kind === 'resume') {
      // Lock lost outside the live round (round end, or buy phase with the
      // menu already closed): same button, copy that fits any phase.
      els.overlayTitle.textContent = 'PAUSED';
      els.overlayCopy.textContent = 'Your mouse is unlocked. Click to lock it and keep playing.';
      els.playBtn.textContent = 'Click to resume';
    } else if (kind === 'dead') {
      els.overlayTitle.textContent = 'YOU ARE DOWN';
      els.overlayCopy.textContent = 'Your squad fights on. Click to spectate from your position.';
      els.playBtn.textContent = 'Spectate';
    }
  }
  function hideOverlay() { els.overlay.classList.add('hidden'); }

  function showBuy() {
    els.overlay.classList.add('hidden');
    els.endOverlay.classList.add('hidden');
    els.buyMenu.classList.remove('hidden');
    refreshBuy();
  }
  function hideBuy() { els.buyMenu.classList.add('hidden'); }
  function isBuyVisible() { return !els.buyMenu.classList.contains('hidden'); }

  function refreshBuy() {
    els.buyMoney.textContent = '$' + state.money;
    const p = state.player;
    const set = (id, owned, afford) => {
      const b = $(id);
      b.classList.toggle('owned', !!owned);
      b.classList.toggle('cant', !owned && !afford);
    };
    set('buy-rifle', p.hasRifle, state.money >= WEAPONS.rifle.price);
    set('buy-pistol-ammo', false, state.money >= WEAPONS.pistol.price);
    set('buy-grenade', p.grenades > 0, state.money >= GRENADE_PRICE);
    set('buy-armor', p.armor >= 100, state.money >= ARMOR_PRICE);
    $('buy-rifle-price').textContent = '$' + WEAPONS.rifle.price;
    $('buy-pistol-price').textContent = '$' + WEAPONS.pistol.price;
    $('buy-grenade-price').textContent = '$' + GRENADE_PRICE;
    $('buy-armor-price').textContent = '$' + ARMOR_PRICE;
  }

  function showEnd(title, sub) {
    els.endOverlay.classList.remove('hidden');
    els.endTitle.textContent = title;
    els.endSub.textContent = sub;
  }
  function hideEnd() { els.endOverlay.classList.add('hidden'); }

  function setBombStatus(text) {
    els.bombStatus.textContent = text;
    els.bombStatus.classList.toggle('hidden', !text);
  }

  function setHint(text) {
    els.hint.textContent = text;
    els.hint.classList.toggle('hidden', !text);
  }

  function tick(dt) {
    if (bannerT > 0) {
      bannerT -= dt;
      if (bannerT <= 0) hideBanner();
    }
    if (hitT > 0) {
      hitT -= dt;
      if (hitT <= 0) {
        els.hitmarker.classList.remove('on');
        els.hitmarker.classList.remove('kill');
      }
    }
  }

  els.playBtn.addEventListener('click', () => callbacks.onPlay());
  els.endBtn.addEventListener('click', () => callbacks.onPlay());
  $('buy-rifle').addEventListener('click', () => callbacks.onBuy('rifle'));
  $('buy-pistol-ammo').addEventListener('click', () => callbacks.onBuy('pistol-ammo'));
  $('buy-grenade').addEventListener('click', () => callbacks.onBuy('grenade'));
  $('buy-armor').addEventListener('click', () => callbacks.onBuy('armor'));
  $('buy-close').addEventListener('click', () => callbacks.onBuy('close'));

  return {
    setHealth, setAmmo, setMoney, setTimer, setScore, setAlive,
    setWeaponName, setCrosshair, hitMarker, damageFlash, addFeed,
    showBanner, hideBanner, showOverlay, hideOverlay, showBuy, hideBuy, isBuyVisible,
    refreshBuy, showEnd, hideEnd, setBombStatus, setHint, tick,
  };
}
