import { Showroom } from '../game/showroom';
import { SKETCHFAB_VEHICLES } from '../game/vehicles/sketchfabManifest';
import { hasSketchfabModel, isPaintable } from '../game/vehicles/sketchfabVehicle';
import { PAINT_COLORS, VEHICLES, getVehicle, vehicleName } from '../game/vehicles/catalog';
import type { VehicleSpec } from '../game/vehicles/types';
import { t } from '../i18n';
import { getProfile, onProfileChange, updateProfile } from '../services/session';
import { h, icons, svgIcon } from './dom';
import type { Screen } from './screens';
import { toast } from './toast';

const euro = (n: number) => `€ ${Math.round(n).toLocaleString('nl-NL')}`;

/** Vehicle shop: pick a car or motorbike, see it on the turntable, choose a color, buy. */
export const vehicleShopScreen: Screen = (root, nav) => {
  const p0 = getProfile();
  if (!p0) return nav('login');

  const canvas = h('canvas', { class: 'showroom-canvas' });
  const showroom = new Showroom(canvas);
  // On narrow screens the info card covers the lower half: show the vehicle higher up.
  showroom.lift = 2.6;
  // On wide screens the info card is on the right (290 px + margin): center the car left of it.
  showroom.rightInset = 320;
  showroom.frame();
  let kind: VehicleSpec['kind'] = 'car';
  let selected = p0.selectedVehicle;
  let previewColor: string | null = null;
  let confirm = false;

  const money = h('div', { class: 'hud-money shop-money' }, svgIcon(icons.coin, 20), h('span', {}, euro(p0.money)));
  const back = h('button', { class: 'icon-btn back-btn', 'aria-label': t('back'), onclick: () => nav('menu') }, svgIcon('<path d="M15 5l-7 7 7 7"/>', 26));
  const tabs = h('div', { class: 'shop-tabs' });
  const info = h('div', { class: 'card shop-info' });
  const strip = h('div', { class: 'shop-strip' });
  root.append(canvas, back, money, tabs, info, strip);

  /** Chosen color, or the model's own paint (Sketchfab) / default color (built-in). */
  const colorOf = (id: string): string | undefined => getProfile()!.vehicleColors[id] ?? (hasSketchfabModel(id) ? undefined : getVehicle(id).color);

  const renderTabs = () => {
    tabs.replaceChildren(...(['car', 'motor'] as const).map((k) =>
      h('button', { class: `shop-tab ${kind === k ? 'active' : ''}`, onclick: () => { kind = k; const first = VEHICLES.find((v) => v.kind === k)!; select(first.id); } },
        k === 'car' ? `🚗 ${t('cars')}` : `🏍️ ${t('motors')}`)));
  };

  const renderStrip = () => {
    const p = getProfile()!;
    strip.replaceChildren(...VEHICLES.filter((v) => v.kind === kind).map((v) => {
      const owned = p.ownedVehicles.includes(v.id);
      const card = h('button', { class: `shop-card ${v.id === selected ? 'active' : ''} ${owned ? 'owned' : ''}` },
        h('span', { class: 'shop-dot', style: `background:${colorOf(v.id) ?? v.color}` }),
        h('b', {}, `${v.brand} ${v.model}`),
        h('span', { class: 'shop-price' }, owned ? `✓ ${t('owned')}` : euro(v.price)),
      );
      card.addEventListener('click', () => select(v.id));
      return card;
    }));
    strip.querySelector('.active')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  };

  const bar = (label: string, value: number) =>
    h('div', { class: 'stat' }, h('span', {}, label), h('div', { class: 'stat-bar' }, h('i', { style: `width:${value * 10}%` })));

  const renderInfo = () => {
    const p = getProfile()!;
    const v = getVehicle(selected);
    const owned = p.ownedVehicles.includes(v.id);
    const color = previewColor ?? colorOf(v.id);
    const swatches = h('div', { class: 'swatches' }, ...PAINT_COLORS.map((c) => {
      const b = h('button', { class: `swatch ${c === color ? 'active' : ''}`, style: `background:${c}`, 'aria-label': c });
      b.addEventListener('click', () => {
        previewColor = c;
        showroom.showVehicle(v.id, c);
        if (owned) updateProfile({ vehicleColors: { ...getProfile()!.vehicleColors, [v.id]: c } });
        renderInfo();
        renderStrip();
      });
      return b;
    }));
    let action: HTMLButtonElement;
    if (!owned) {
      const short = v.price - p.money;
      if (short > 0) {
        action = h('button', { class: 'btn btn-big shop-buy', disabled: true }, `${t('needMore')} ${euro(short)}`);
      } else {
        action = h('button', { class: `btn btn-primary btn-big shop-buy ${confirm ? 'confirm' : ''}` }, confirm ? `${t('sureBuy')} ${euro(v.price)}` : `${t('buy')} ${euro(v.price)}`);
        action.addEventListener('click', () => {
          if (!confirm) { confirm = true; renderInfo(); return; }
          const cur = getProfile()!;
          if (cur.money < v.price) return;
          updateProfile({
            money: cur.money - v.price,
            ownedVehicles: [...cur.ownedVehicles, v.id],
            selectedVehicle: v.id,
            ...(color ? { vehicleColors: { ...cur.vehicleColors, [v.id]: color } } : {}),
          });
          confirm = false;
          toast(`🎉 ${vehicleName(v)}!`);
          renderAll();
        });
      }
    } else if (p.selectedVehicle !== v.id) {
      action = h('button', { class: 'btn btn-primary btn-big shop-buy' }, t('chooseThis'));
      action.addEventListener('click', () => { updateProfile({ selectedVehicle: v.id }); renderAll(); });
    } else {
      action = h('button', { class: 'btn btn-big shop-buy chosen', disabled: true }, `✓ ${t('yourVehicle')}`);
    }
    info.replaceChildren(
      h('div', { class: 'shop-title' }, h('small', {}, v.brand), h('b', {}, `${v.model}`)),
      h('div', { class: 'shop-top-speed' }, `🏁 ${t('topSpeed')} `, h('b', {}, `${v.topSpeed} km/h`)),
      bar(t('statSpeed'), v.stats.speed),
      bar(t('statAccel'), v.stats.accel),
      bar(t('statHandling'), v.stats.handling),
      ...(isPaintable(v.id) ? [swatches] : []),
      action,
      ...(SKETCHFAB_VEHICLES[v.id] ? [credit(v.id)] : []),
    );
  };

  /** Attribution for the 3D model (required by the CC licenses). */
  const credit = (id: string) => {
    const c = SKETCHFAB_VEHICLES[id].credit;
    const a = h('a', { href: c.url, target: '_blank', rel: 'noopener' }, c.name);
    return h('div', { class: 'model-credit' }, `${t('modelBy')} `, a, ` · ${c.author} · ${c.license.replace('CC Attribution', 'CC BY')}`);
  };

  const renderAll = () => { renderTabs(); renderStrip(); renderInfo(); };

  function select(id: string) {
    selected = id;
    kind = getVehicle(id).kind;
    previewColor = null;
    confirm = false;
    showroom.showVehicle(id, colorOf(id));
    renderAll();
  }

  const off = onProfileChange((p) => { money.lastElementChild!.textContent = euro(p.money); });
  select(selected);
  return () => { off(); showroom.dispose(); };
};
