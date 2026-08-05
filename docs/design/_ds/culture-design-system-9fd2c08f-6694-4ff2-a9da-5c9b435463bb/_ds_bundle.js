/* @ds-bundle: {"format":3,"namespace":"CultureDesignSystem_9fd2c0","components":[{"name":"Button","sourcePath":"components/button/Button.jsx"},{"name":"Card","sourcePath":"components/card/Card.jsx"},{"name":"Avatar","sourcePath":"components/core/Avatar.jsx"},{"name":"Badge","sourcePath":"components/core/Badge.jsx"},{"name":"Icon","sourcePath":"components/core/Icon.jsx"},{"name":"IconButton","sourcePath":"components/core/IconButton.jsx"},{"name":"Pill","sourcePath":"components/core/Pill.jsx"},{"name":"Tag","sourcePath":"components/core/Tag.jsx"},{"name":"ProgressBar","sourcePath":"components/data/ProgressBar.jsx"},{"name":"Tabs","sourcePath":"components/data/Tabs.jsx"},{"name":"Checkbox","sourcePath":"components/forms/Checkbox.jsx"},{"name":"Radio","sourcePath":"components/forms/Radio.jsx"},{"name":"SegmentedControl","sourcePath":"components/forms/SegmentedControl.jsx"},{"name":"Input","sourcePath":"components/input/Input.jsx"},{"name":"StatCard","sourcePath":"components/stat/StatCard.jsx"},{"name":"ArrosoirMeter","sourcePath":"components/streak/ArrosoirMeter.jsx"}],"sourceHashes":{"components/button/Button.jsx":"e2f4262a49e7","components/card/Card.jsx":"2dfa6b1528c7","components/core/Avatar.jsx":"10c3fb154dc7","components/core/Badge.jsx":"42c976d0560a","components/core/Icon.jsx":"92152761f127","components/core/IconButton.jsx":"eeb5d9c5d324","components/core/Pill.jsx":"368cf0db0ea7","components/core/Tag.jsx":"bc2912bd5eaf","components/data/ProgressBar.jsx":"9ff0c8d6c25e","components/data/Tabs.jsx":"c65538ff3601","components/forms/Checkbox.jsx":"0f8df283e9a8","components/forms/Radio.jsx":"445e9efdfae6","components/forms/SegmentedControl.jsx":"4d5b300e24ef","components/input/Input.jsx":"d6276a128119","components/stat/StatCard.jsx":"ca177db0ae34","components/streak/ArrosoirMeter.jsx":"090bda6f8d6a","ui_kits/app/AppShell.jsx":"52720726b338","ui_kits/app/ScreenAtelier.jsx":"bf8dada96f82","ui_kits/app/ScreenExplorer.jsx":"b9ee18ffa026","ui_kits/app/ScreenJardin.jsx":"7e0a9df29938","ui_kits/app/ScreenNouvel.jsx":"ae4eb73089fb","ui_kits/app/ScreenProfil.jsx":"c3db927a80d8"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.CultureDesignSystem_9fd2c0 = window.CultureDesignSystem_9fd2c0 || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/card/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Card — the raised cream container everything sits in.
 * tone: default(raised cream) · sunken · dark(ink feature card) · dashed("à venir").
 * Optional `eyebrow` renders the UPPERCASE label row.
 */

const CSS = `
.cds-card{background:var(--surface-card);border:1px solid var(--border);border-radius:var(--radius-lg);
  box-shadow:var(--shadow-sm);color:var(--text-body);}
.cds-card--flat{box-shadow:none;}
.cds-card--sunken{background:var(--surface-sunken);box-shadow:none;}
.cds-card--tan{background:var(--tan-100);border-color:var(--tan-300);box-shadow:none;}
.cds-card--dark{background:var(--surface-dark);border-color:transparent;color:var(--text-on-dark);box-shadow:var(--shadow-md);}
.cds-card--dashed{background:transparent;border:1.5px dashed var(--line-strong);box-shadow:none;}
.cds-card--hover{transition:transform var(--dur-base) var(--ease-out),box-shadow var(--dur-base) var(--ease-out);cursor:pointer;}
.cds-card--hover:hover{transform:translateY(-2px);box-shadow:var(--shadow-md);}
.cds-card__eyebrow{font-size:11.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;
  color:var(--text-muted);margin-bottom:12px;}
.cds-card--dark .cds-card__eyebrow{color:var(--gold-300);}
`;
let injected = false;
function useStyle() {
  if (typeof document !== 'undefined' && !injected) {
    const e = document.createElement('style');
    e.textContent = CSS;
    document.head.appendChild(e);
    injected = true;
  }
}
const PADS = {
  sm: 14,
  md: 20,
  lg: 28
};
function Card({
  children,
  tone = 'default',
  pad = 'md',
  hover = false,
  flat = false,
  eyebrow,
  style,
  className = '',
  ...rest
}) {
  useStyle();
  const cls = ['cds-card', tone !== 'default' ? `cds-card--${tone}` : '', hover ? 'cds-card--hover' : '', flat ? 'cds-card--flat' : '', className].filter(Boolean).join(' ');
  const padding = typeof pad === 'number' ? pad : PADS[pad] ?? 20;
  return /*#__PURE__*/React.createElement("div", _extends({
    className: cls,
    style: {
      padding,
      ...style
    }
  }, rest), eyebrow && /*#__PURE__*/React.createElement("div", {
    className: "cds-card__eyebrow"
  }, eyebrow), children);
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/card/Card.jsx", error: String((e && e.message) || e) }); }

// components/core/Avatar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Avatar — illustrated character portrait (rounded-square) or initial fallback.
 * The mockups use warm hand-drawn avatars; pass `src`, else an initial shows.
 */

const CSS = `
.cds-avatar{display:inline-flex;align-items:center;justify-content:center;overflow:hidden;
  background:var(--green-100);color:var(--green-800);font-family:var(--font-sans);font-weight:700;
  border-radius:14px;flex:none;border:1px solid var(--border);}
.cds-avatar img{width:100%;height:100%;object-fit:cover;display:block;}
.cds-avatar--round{border-radius:var(--radius-pill);}
.cds-avatar--ring{box-shadow:0 0 0 2px var(--surface-page),0 0 0 4px var(--green-300);}
`;
let injected = false;
function useStyle() {
  if (typeof document !== 'undefined' && !injected) {
    const e = document.createElement('style');
    e.textContent = CSS;
    document.head.appendChild(e);
    injected = true;
  }
}
const SIZES = {
  sm: 28,
  md: 38,
  lg: 56,
  xl: 88
};
function Avatar({
  src,
  name = '',
  size = 'md',
  round = false,
  ring = false,
  className = '',
  ...rest
}) {
  useStyle();
  const px = typeof size === 'number' ? size : SIZES[size] || 38;
  const cls = ['cds-avatar', round ? 'cds-avatar--round' : '', ring ? 'cds-avatar--ring' : '', className].filter(Boolean).join(' ');
  const initial = name.trim().charAt(0).toUpperCase();
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls,
    style: {
      width: px,
      height: px,
      fontSize: px * 0.4,
      borderRadius: round ? undefined : Math.max(8, px * 0.28)
    }
  }, rest), src ? /*#__PURE__*/React.createElement("img", {
    src: src,
    alt: name
  }) : initial || '·');
}
Object.assign(__ds_scope, { Avatar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Avatar.jsx", error: String((e && e.message) || e) }); }

// components/core/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Badge — compact status label. Tones map to product meanings:
 * premium(gold) · privé(neutral) · publié(green/success) · brouillon(tan)
 * · archivé(muted) · alert · version(V2/V3 caps).
 */

const CSS = `
.cds-badge{display:inline-flex;align-items:center;gap:4px;font-family:var(--font-sans);
  font-size:11.5px;font-weight:600;line-height:1;padding:4px 9px;border-radius:var(--radius-pill);
  border:1px solid transparent;white-space:nowrap;}
.cds-badge--neutral{background:var(--cream-sunken);color:var(--text-muted);border-color:var(--border);}
.cds-badge--premium{background:var(--gold-100);color:var(--gold-600);border-color:var(--gold-300);}
.cds-badge--success{background:var(--success-100);color:var(--success-600);}
.cds-badge--green{background:var(--green-100);color:var(--green-800);border-color:var(--green-300);}
.cds-badge--tan{background:var(--tan-100);color:var(--tan-700);border-color:var(--tan-300);}
.cds-badge--alert{background:var(--alert-100);color:var(--alert-600);}
.cds-badge--warn{background:var(--warn-100);color:var(--warn-500);}
.cds-badge--ink{background:var(--ink-900);color:var(--text-on-dark);}
.cds-badge--version{background:var(--cream-sunken);color:var(--text-faint);border-color:var(--border);
  font-size:10px;font-weight:700;letter-spacing:.06em;padding:3px 6px;border-radius:var(--radius-xs);}
`;
let injected = false;
function useStyle() {
  if (typeof document !== 'undefined' && !injected) {
    const e = document.createElement('style');
    e.textContent = CSS;
    document.head.appendChild(e);
    injected = true;
  }
}
function Badge({
  children,
  tone = 'neutral',
  className = '',
  ...rest
}) {
  useStyle();
  return /*#__PURE__*/React.createElement("span", _extends({
    className: ['cds-badge', `cds-badge--${tone}`, className].filter(Boolean).join(' ')
  }, rest), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Badge.jsx", error: String((e && e.message) || e) }); }

// components/core/Icon.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Icon — inline Lucide-style line icons, self-contained (no CDN dependency).
 * Stroke 1.75, rounded caps/joins, currentColor. Garden-first set.
 */

const PATHS = {
  'arrow-right': ['M5 12h14', 'm12 5 7 7-7 7'],
  'arrow-up': ['M12 19V5', 'm5 12 7-7 7 7'],
  check: ['M20 6 9 17l-5-5'],
  x: ['M18 6 6 18', 'm6 6 12 12'],
  plus: ['M5 12h14', 'M12 5v14'],
  search: ['m21 21-4.3-4.3', 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z'],
  settings: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z'],
  upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm17 8-5-5-5 5', 'M12 3v12'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'm7 10 5 5 5-5', 'M12 15V3'],
  copy: ['M20 9H11a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2Z', 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'],
  'file-text': ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v5h5', 'M10 9H8', 'M16 13H8', 'M16 17H8'],
  star: ['M11.5 2.5 14 8l6 .8-4.4 4.2 1.1 6L11.5 16 6.3 19l1.1-6L3 8.8 9 8Z'],
  flame: ['M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.32-4.13 1.5-5.5C12 4.5 13 5 13.5 6c.6 1.2 1 2.4 1.6 3.4.6 1 1.4 1.7 1.4 3.1A5.5 5.5 0 1 1 6.5 12c0-1.1.5-2 1-2.5'],
  droplet: ['M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5S5 13 5 15a7 7 0 0 0 7 7Z'],
  leaf: ['M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z', 'M2 21c0-3 1.85-5.36 5.08-6'],
  sprout: ['M7 20h10', 'M10 20c5.5-2.5.8-6.4 3-10', 'M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8Z', 'M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2Z'],
  sun: ['M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z', 'M12 1v2', 'M12 21v2', 'M4.2 4.2l1.4 1.4', 'M18.4 18.4l1.4 1.4', 'M1 12h2', 'M21 12h2', 'M4.2 19.8l1.4-1.4', 'M18.4 5.6l1.4-1.4'],
  moon: ['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'],
  'qr-code': ['M5 5h4v4H5z', 'M15 5h4v4h-4z', 'M5 15h4v4H5z', 'M15 15h2', 'M19 15v4', 'M15 19h4', 'M13 13v2', 'M13 19v.01'],
  'chevron-right': ['m9 18 6-6-6-6'],
  'chevron-down': ['m6 9 6 6 6-6'],
  trees: ['M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0Z', 'M7 16v6', 'M13 19v3', 'M18 12h.01', 'M18 21a4 4 0 0 0 0-8 4 4 0 0 0-3.8 2.8', 'M18 12v10'],
  share: ['M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8', 'm16 6-4-4-4 4', 'M12 2v13']
};
function Icon({
  name,
  size = 18,
  strokeWidth = 1.75,
  style,
  ...rest
}) {
  const d = PATHS[name];
  return /*#__PURE__*/React.createElement("svg", _extends({
    viewBox: "0 0 24 24",
    width: size,
    height: size,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: strokeWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    style: {
      flex: 'none',
      display: 'block',
      ...style
    },
    "aria-hidden": "true"
  }, rest), (d || []).map((p, i) => /*#__PURE__*/React.createElement("path", {
    key: i,
    d: p
  })));
}
Object.assign(__ds_scope, { Icon });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Icon.jsx", error: String((e && e.message) || e) }); }

// components/button/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Button — Culture's action primitive.
 * Variants: primary (forest green) · secondary (caramel tan) · ink (charcoal)
 *           · ghost (tan-bordered on cream). Verbs with an optional trailing arrow.
 */

const CSS = `
.cds-btn{display:inline-flex;align-items:center;justify-content:center;gap:.5em;
  font-family:var(--font-sans);font-weight:600;letter-spacing:.005em;line-height:1;
  border:1px solid transparent;border-radius:var(--radius-md);cursor:pointer;
  transition:background var(--dur-fast) var(--ease-soft),transform var(--dur-fast) var(--ease-soft),
    box-shadow var(--dur-fast) var(--ease-soft),border-color var(--dur-fast) var(--ease-soft);
  white-space:nowrap;text-decoration:none;-webkit-font-smoothing:antialiased;}
.cds-btn:focus-visible{outline:none;box-shadow:var(--shadow-focus);}
.cds-btn:active{transform:translateY(.5px) scale(.985);}
.cds-btn[disabled]{cursor:not-allowed;opacity:.5;transform:none;box-shadow:none;}
.cds-btn--sm{font-size:13px;padding:8px 14px;}
.cds-btn--md{font-size:14.5px;padding:11px 18px;}
.cds-btn--lg{font-size:16px;padding:14px 24px;}
.cds-btn--block{display:flex;width:100%;}

.cds-btn--primary{background:var(--action-bg);color:var(--action-fg);box-shadow:var(--shadow-xs);}
.cds-btn--primary:hover:not([disabled]){background:var(--action-bg-hover);}
.cds-btn--primary:active:not([disabled]){background:var(--action-bg-press);}

.cds-btn--secondary{background:var(--action2-bg);color:var(--action2-fg);box-shadow:var(--shadow-xs);}
.cds-btn--secondary:hover:not([disabled]){background:var(--action2-bg-hover);}

.cds-btn--ink{background:var(--actionink-bg);color:var(--actionink-fg);box-shadow:var(--shadow-xs);}
.cds-btn--ink:hover:not([disabled]){background:var(--actionink-bg-hover);}

.cds-btn--ghost{background:var(--surface-card);color:var(--text-strong);border-color:var(--border-strong);}
.cds-btn--ghost:hover:not([disabled]){background:var(--surface-sunken);border-color:var(--tan-300);}
`;
let injected = false;
function useStyle() {
  if (typeof document !== 'undefined' && !injected) {
    const el = document.createElement('style');
    el.setAttribute('data-cds', 'button');
    el.textContent = CSS;
    document.head.appendChild(el);
    injected = true;
  }
}
function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon,
  // IconName rendered before the label
  trailingArrow = false,
  block = false,
  as = 'button',
  className = '',
  ...rest
}) {
  useStyle();
  const Tag = as;
  const cls = ['cds-btn', `cds-btn--${variant}`, `cds-btn--${size}`, block ? 'cds-btn--block' : '', className].filter(Boolean).join(' ');
  const iconSize = size === 'lg' ? 19 : size === 'sm' ? 16 : 18;
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: cls
  }, rest), icon && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: iconSize
  }), children, trailingArrow && /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "arrow-right",
    size: iconSize
  }));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/button/Button.jsx", error: String((e && e.message) || e) }); }

// components/core/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** IconButton — square, icon-only control (table actions, toolbar, close). */

const CSS = `
.cds-iconbtn{display:inline-flex;align-items:center;justify-content:center;
  border-radius:var(--radius-sm);cursor:pointer;color:var(--text-muted);
  background:var(--surface-card);border:1px solid var(--border);
  transition:all var(--dur-fast) var(--ease-soft);}
.cds-iconbtn:hover:not([disabled]){color:var(--green-800);border-color:var(--tan-300);background:var(--surface-sunken);}
.cds-iconbtn:active:not([disabled]){transform:scale(.94);}
.cds-iconbtn:focus-visible{outline:none;box-shadow:var(--shadow-focus);}
.cds-iconbtn[disabled]{opacity:.45;cursor:not-allowed;}
.cds-iconbtn--plain{background:transparent;border-color:transparent;}
.cds-iconbtn--plain:hover:not([disabled]){background:var(--surface-sunken);}
.cds-iconbtn--sm{width:30px;height:30px;}
.cds-iconbtn--md{width:36px;height:36px;}
.cds-iconbtn--lg{width:42px;height:42px;}
`;
let injected = false;
function useStyle() {
  if (typeof document !== 'undefined' && !injected) {
    const e = document.createElement('style');
    e.textContent = CSS;
    document.head.appendChild(e);
    injected = true;
  }
}
function IconButton({
  icon,
  size = 'md',
  plain = false,
  label,
  className = '',
  ...rest
}) {
  useStyle();
  const px = size === 'lg' ? 20 : size === 'sm' ? 16 : 18;
  const cls = ['cds-iconbtn', `cds-iconbtn--${size}`, plain ? 'cds-iconbtn--plain' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("button", _extends({
    className: cls,
    "aria-label": label,
    title: label
  }, rest), /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: px
  }));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/core/Pill.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Pill — small rounded status/filter chip (nav status, "matin · printemps", "jour 12").
 * Active state fills with a soft green wash.
 */

const CSS = `
.cds-pill{display:inline-flex;align-items:center;gap:6px;font-family:var(--font-sans);
  font-size:12.5px;font-weight:500;color:var(--text-body);background:var(--surface-card);
  border:1px solid var(--border);border-radius:var(--radius-pill);padding:5px 12px;line-height:1;
  cursor:default;transition:all var(--dur-fast) var(--ease-soft);}
.cds-pill--button{cursor:pointer;}
.cds-pill--button:hover{background:var(--surface-sunken);border-color:var(--tan-300);}
.cds-pill--active{background:var(--green-100);border-color:var(--green-300);color:var(--green-800);}
.cds-pill .cds-pill__ic{color:var(--tan-500);}
.cds-pill--active .cds-pill__ic{color:var(--green-700);}
`;
let injected = false;
function useStyle() {
  if (typeof document !== 'undefined' && !injected) {
    const e = document.createElement('style');
    e.textContent = CSS;
    document.head.appendChild(e);
    injected = true;
  }
}
function Pill({
  children,
  icon,
  active = false,
  as = 'div',
  className = '',
  ...rest
}) {
  useStyle();
  const Tag = as;
  const cls = ['cds-pill', as === 'button' ? 'cds-pill--button' : '', active ? 'cds-pill--active' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: cls
  }, rest), icon && /*#__PURE__*/React.createElement("span", {
    className: "cds-pill__ic",
    style: {
      display: 'flex'
    }
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: icon,
    size: 14
  })), children);
}
Object.assign(__ds_scope, { Pill });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Pill.jsx", error: String((e && e.message) || e) }); }

// components/core/Tag.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Tag — monospaced code/id chip (atelier tags & ids: "#AD8G45", "A3K9P2M").
 * The thing you paste to join an atelier.
 */

const CSS = `
.cds-tag{display:inline-flex;align-items:center;font-family:ui-monospace,'SFMono-Regular',Menlo,monospace;
  font-size:12px;font-weight:600;letter-spacing:.06em;color:var(--tan-700);
  background:var(--tan-100);border:1px solid var(--tan-300);border-radius:var(--radius-xs);
  padding:3px 8px;line-height:1;}
.cds-tag--ghost{background:transparent;}
`;
let injected = false;
function useStyle() {
  if (typeof document !== 'undefined' && !injected) {
    const e = document.createElement('style');
    e.textContent = CSS;
    document.head.appendChild(e);
    injected = true;
  }
}
function Tag({
  children,
  ghost = false,
  className = '',
  ...rest
}) {
  useStyle();
  return /*#__PURE__*/React.createElement("span", _extends({
    className: ['cds-tag', ghost ? 'cds-tag--ghost' : '', className].filter(Boolean).join(' ')
  }, rest), children);
}
Object.assign(__ds_scope, { Tag });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/core/Tag.jsx", error: String((e && e.message) || e) }); }

// components/data/ProgressBar.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * ProgressBar — growth/progression indicator. Sage fill on a sunken cream track.
 * Optional leading label and trailing value ("niveau 2 · 41 %").
 */

const CSS = `
.cds-prog{font-family:var(--font-sans);width:100%;}
.cds-prog__head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;gap:10px;}
.cds-prog__label{font-size:13px;color:var(--text-body);}
.cds-prog__value{font-size:12.5px;font-weight:600;color:var(--text-muted);font-variant-numeric:tabular-nums;}
.cds-prog__track{background:var(--cream-sunken);border-radius:var(--radius-pill);overflow:hidden;
  box-shadow:var(--shadow-inset);}
.cds-prog__fill{height:100%;border-radius:var(--radius-pill);background:var(--green-600);
  transition:width var(--dur-slow) var(--ease-out);}
.cds-prog--sm .cds-prog__track{height:6px;}
.cds-prog--md .cds-prog__track{height:9px;}
.cds-prog--lg .cds-prog__track{height:13px;}
`;
let injected = false;
function useStyle() {
  if (typeof document !== 'undefined' && !injected) {
    const e = document.createElement('style');
    e.textContent = CSS;
    document.head.appendChild(e);
    injected = true;
  }
}
const TONES = {
  green: 'var(--green-600)',
  sage: 'var(--green-500)',
  light: 'var(--green-400)',
  tan: 'var(--tan-500)'
};
function ProgressBar({
  value = 0,
  max = 100,
  label,
  showValue = false,
  valueText,
  tone = 'green',
  size = 'md',
  className = '',
  ...rest
}) {
  useStyle();
  const pct = Math.max(0, Math.min(100, value / max * 100));
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['cds-prog', `cds-prog--${size}`, className].filter(Boolean).join(' ')
  }, rest), (label || showValue) && /*#__PURE__*/React.createElement("div", {
    className: "cds-prog__head"
  }, label && /*#__PURE__*/React.createElement("span", {
    className: "cds-prog__label"
  }, label), showValue && /*#__PURE__*/React.createElement("span", {
    className: "cds-prog__value"
  }, valueText || `${Math.round(pct)} %`)), /*#__PURE__*/React.createElement("div", {
    className: "cds-prog__track",
    role: "progressbar",
    "aria-valuenow": value,
    "aria-valuemax": max
  }, /*#__PURE__*/React.createElement("div", {
    className: "cds-prog__fill",
    style: {
      width: `${pct}%`,
      background: TONES[tone] || TONES.green
    }
  })));
}
Object.assign(__ds_scope, { ProgressBar });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/ProgressBar.jsx", error: String((e && e.message) || e) }); }

// components/data/Tabs.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Tabs — underlined section navigation (Programme · Génération d'examen ·
 * Analyse · Génération de cours). Active tab gets a green underline.
 * Tabs may carry a small version Badge.
 */

const CSS = `
.cds-tabs{display:flex;gap:24px;font-family:var(--font-sans);border-bottom:1px solid var(--border);}
.cds-tab{appearance:none;background:none;border:none;cursor:pointer;font-family:var(--font-sans);
  font-size:14px;font-weight:500;color:var(--text-muted);padding:0 0 12px;position:relative;
  display:inline-flex;align-items:center;gap:7px;line-height:1;
  transition:color var(--dur-fast) var(--ease-soft);}
.cds-tab:hover{color:var(--text-strong);}
.cds-tab.is-active{color:var(--text-strong);font-weight:600;}
.cds-tab.is-active::after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;
  background:var(--green-700);border-radius:2px;}
.cds-tab:focus-visible{outline:none;box-shadow:var(--shadow-focus);border-radius:var(--radius-xs);}
`;
let injected = false;
function useStyle() {
  if (typeof document !== 'undefined' && !injected) {
    const e = document.createElement('style');
    e.textContent = CSS;
    document.head.appendChild(e);
    injected = true;
  }
}
function Tabs({
  tabs = [],
  value,
  onChange,
  className = '',
  ...rest
}) {
  useStyle();
  const items = tabs.map(t => typeof t === 'string' ? {
    value: t,
    label: t
  } : t);
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['cds-tabs', className].filter(Boolean).join(' '),
    role: "tablist"
  }, rest), items.map(t => /*#__PURE__*/React.createElement("button", {
    key: t.value,
    type: "button",
    role: "tab",
    "aria-selected": value === t.value,
    className: ['cds-tab', value === t.value ? 'is-active' : ''].join(' '),
    onClick: () => onChange && onChange(t.value)
  }, t.label, t.badge && /*#__PURE__*/React.createElement(__ds_scope.Badge, {
    tone: "version"
  }, t.badge))));
}
Object.assign(__ds_scope, { Tabs });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/data/Tabs.jsx", error: String((e && e.message) || e) }); }

// components/forms/Checkbox.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/** Checkbox — square check (exam question bank, settings toggles). */

const CSS = `
.cds-check{display:inline-flex;align-items:flex-start;gap:9px;font-family:var(--font-sans);cursor:pointer;}
.cds-check__box{width:18px;height:18px;border-radius:5px;border:1.5px solid var(--border-strong);
  background:var(--surface-input);flex:none;margin-top:1px;display:flex;align-items:center;justify-content:center;
  color:transparent;transition:all var(--dur-fast) var(--ease-soft);}
.cds-check input{position:absolute;opacity:0;width:0;height:0;}
.cds-check input:checked + .cds-check__box{background:var(--green-700);border-color:var(--green-700);color:#fff;}
.cds-check input:focus-visible + .cds-check__box{box-shadow:var(--shadow-focus);}
.cds-check__label{font-size:14px;color:var(--text-body);}
`;
let injected = false;
function useStyle() {
  if (typeof document !== 'undefined' && !injected) {
    const e = document.createElement('style');
    e.textContent = CSS;
    document.head.appendChild(e);
    injected = true;
  }
}
function Checkbox({
  label,
  checked,
  className = '',
  ...rest
}) {
  useStyle();
  return /*#__PURE__*/React.createElement("label", {
    className: ['cds-check', className].filter(Boolean).join(' ')
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "checkbox",
    checked: checked
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "cds-check__box"
  }, /*#__PURE__*/React.createElement(__ds_scope.Icon, {
    name: "check",
    size: 13,
    strokeWidth: 2.6
  })), label && /*#__PURE__*/React.createElement("span", {
    className: "cds-check__label"
  }, label));
}
Object.assign(__ds_scope, { Checkbox });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Checkbox.jsx", error: String((e && e.message) || e) }); }

// components/forms/Radio.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Radio — selectable option. Plain (dot + label) or `card` style with a
 * title + description (the Privé / Public chooser on atelier creation).
 */

const CSS = `
.cds-radio{display:flex;align-items:flex-start;gap:10px;font-family:var(--font-sans);cursor:pointer;}
.cds-radio__dot{width:18px;height:18px;border-radius:var(--radius-pill);border:1.5px solid var(--border-strong);
  background:var(--surface-input);flex:none;margin-top:1px;display:flex;align-items:center;justify-content:center;
  transition:all var(--dur-fast) var(--ease-soft);}
.cds-radio__dot::after{content:"";width:8px;height:8px;border-radius:var(--radius-pill);background:var(--green-700);transform:scale(0);transition:transform var(--dur-fast) var(--ease-out);}
.cds-radio input{position:absolute;opacity:0;width:0;height:0;}
.cds-radio input:checked + .cds-radio__dot{border-color:var(--green-600);}
.cds-radio input:checked + .cds-radio__dot::after{transform:scale(1);}
.cds-radio input:focus-visible + .cds-radio__dot{box-shadow:var(--shadow-focus);}
.cds-radio__title{font-size:14px;font-weight:600;color:var(--text-strong);}
.cds-radio__desc{font-size:12.5px;color:var(--text-muted);margin-top:2px;}
.cds-radio--card{border:1px solid var(--border);border-radius:var(--radius-md);padding:13px 14px;
  background:var(--surface-card);transition:all var(--dur-fast) var(--ease-soft);}
.cds-radio--card:hover{border-color:var(--tan-300);}
.cds-radio--card.is-checked{border-color:var(--tan-400);background:var(--tan-100);}
`;
let injected = false;
function useStyle() {
  if (typeof document !== 'undefined' && !injected) {
    const e = document.createElement('style');
    e.textContent = CSS;
    document.head.appendChild(e);
    injected = true;
  }
}
function Radio({
  label,
  description,
  card = false,
  checked,
  className = '',
  ...rest
}) {
  useStyle();
  const cls = ['cds-radio', card ? 'cds-radio--card' : '', card && checked ? 'is-checked' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("label", {
    className: cls
  }, /*#__PURE__*/React.createElement("input", _extends({
    type: "radio",
    checked: checked
  }, rest)), /*#__PURE__*/React.createElement("span", {
    className: "cds-radio__dot"
  }), /*#__PURE__*/React.createElement("span", null, /*#__PURE__*/React.createElement("span", {
    className: "cds-radio__title"
  }, label), description && /*#__PURE__*/React.createElement("span", {
    className: "cds-radio__desc"
  }, description)));
}
Object.assign(__ds_scope, { Radio });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Radio.jsx", error: String((e && e.message) || e) }); }

// components/forms/SegmentedControl.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * SegmentedControl — pill toggle for 2–4 short options
 * ("mensuel / annuel", "7 jours / 30 jours / tout").
 */

const CSS = `
.cds-seg{display:inline-flex;background:var(--cream-sunken);border:1px solid var(--border);
  border-radius:var(--radius-pill);padding:3px;gap:2px;font-family:var(--font-sans);}
.cds-seg__opt{appearance:none;border:none;background:transparent;cursor:pointer;
  font-family:var(--font-sans);font-size:13px;font-weight:600;color:var(--text-muted);
  padding:6px 14px;border-radius:var(--radius-pill);line-height:1;white-space:nowrap;
  transition:all var(--dur-fast) var(--ease-soft);}
.cds-seg__opt:hover{color:var(--text-strong);}
.cds-seg__opt.is-active{background:var(--surface-card);color:var(--text-strong);box-shadow:var(--shadow-xs);}
.cds-seg__opt:focus-visible{outline:none;box-shadow:var(--shadow-focus);}
`;
let injected = false;
function useStyle() {
  if (typeof document !== 'undefined' && !injected) {
    const e = document.createElement('style');
    e.textContent = CSS;
    document.head.appendChild(e);
    injected = true;
  }
}
function SegmentedControl({
  options = [],
  value,
  onChange,
  className = '',
  ...rest
}) {
  useStyle();
  const items = options.map(o => typeof o === 'string' ? {
    value: o,
    label: o
  } : o);
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['cds-seg', className].filter(Boolean).join(' '),
    role: "tablist"
  }, rest), items.map(o => /*#__PURE__*/React.createElement("button", {
    key: o.value,
    type: "button",
    role: "tab",
    "aria-selected": value === o.value,
    className: ['cds-seg__opt', value === o.value ? 'is-active' : ''].join(' '),
    onClick: () => onChange && onChange(o.value)
  }, o.label)));
}
Object.assign(__ds_scope, { SegmentedControl });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/SegmentedControl.jsx", error: String((e && e.message) || e) }); }

// components/input/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * Input — single-line text field. Warm bright surface, hairline border,
 * soft green focus ring. Optional label, hint, and error.
 */

const CSS = `
.cds-field{display:flex;flex-direction:column;gap:6px;font-family:var(--font-sans);}
.cds-field__label{font-size:13px;font-weight:600;color:var(--text-strong);}
.cds-field__opt{font-weight:400;color:var(--text-faint);font-size:12px;margin-left:4px;}
.cds-input{font-family:var(--font-sans);font-size:14.5px;color:var(--text-strong);
  background:var(--surface-input);border:1px solid var(--border-strong);border-radius:var(--radius-sm);
  padding:11px 13px;line-height:1.3;width:100%;box-sizing:border-box;
  transition:border-color var(--dur-fast) var(--ease-soft),box-shadow var(--dur-fast) var(--ease-soft);}
.cds-input::placeholder{color:var(--text-faint);}
.cds-input:hover{border-color:var(--tan-300);}
.cds-input:focus{outline:none;border-color:var(--green-500);box-shadow:var(--shadow-focus);}
.cds-input--error{border-color:var(--alert-500);}
.cds-input--error:focus{box-shadow:0 0 0 3px color-mix(in oklab,var(--alert-500) 35%,transparent);}
.cds-field__hint{font-size:12px;color:var(--text-muted);}
.cds-field__hint--error{color:var(--alert-600);}
textarea.cds-input{resize:vertical;min-height:84px;line-height:1.5;}
`;
let injected = false;
function useStyle() {
  if (typeof document !== 'undefined' && !injected) {
    const e = document.createElement('style');
    e.textContent = CSS;
    document.head.appendChild(e);
    injected = true;
  }
}
function Input({
  label,
  optional,
  hint,
  error,
  multiline = false,
  rows = 3,
  className = '',
  id,
  ...rest
}) {
  useStyle();
  const Tag = multiline ? 'textarea' : 'input';
  const inputId = id || (label ? 'cds-' + label.replace(/\W+/g, '-').toLowerCase() : undefined);
  return /*#__PURE__*/React.createElement("div", {
    className: "cds-field"
  }, label && /*#__PURE__*/React.createElement("label", {
    className: "cds-field__label",
    htmlFor: inputId
  }, label, optional && /*#__PURE__*/React.createElement("span", {
    className: "cds-field__opt"
  }, "facultatif")), /*#__PURE__*/React.createElement(Tag, _extends({
    id: inputId,
    className: ['cds-input', error ? 'cds-input--error' : '', className].filter(Boolean).join(' '),
    rows: multiline ? rows : undefined
  }, rest)), (hint || error) && /*#__PURE__*/React.createElement("span", {
    className: ['cds-field__hint', error ? 'cds-field__hint--error' : ''].join(' ')
  }, error || hint));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/input/Input.jsx", error: String((e && e.message) || e) }); }

// components/stat/StatCard.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * StatCard — a single dashboard metric: UPPERCASE eyebrow, big numeral,
 * and an optional sub line / delta. Dot colour echoes the metric's family.
 */

const CSS = `
.cds-stat{font-family:var(--font-sans);background:var(--surface-card);border:1px solid var(--border);
  border-radius:var(--radius-md);box-shadow:var(--shadow-xs);padding:16px 18px;}
.cds-stat__eyebrow{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:700;
  letter-spacing:.12em;text-transform:uppercase;color:var(--text-muted);}
.cds-stat__dot{width:8px;height:8px;border-radius:var(--radius-pill);flex:none;}
.cds-stat__value{font-size:34px;font-weight:700;color:var(--text-strong);line-height:1.05;
  margin-top:12px;letter-spacing:-0.02em;font-variant-numeric:tabular-nums;}
.cds-stat__value small{font-size:18px;font-weight:600;color:var(--text-muted);}
.cds-stat__sub{font-size:12.5px;color:var(--text-muted);margin-top:6px;}
.cds-stat__sub--up{color:var(--success-600);font-weight:600;}
`;
let injected = false;
function useStyle() {
  if (typeof document !== 'undefined' && !injected) {
    const e = document.createElement('style');
    e.textContent = CSS;
    document.head.appendChild(e);
    injected = true;
  }
}
const DOTS = {
  green: 'var(--green-500)',
  tan: 'var(--tan-500)',
  gold: 'var(--gold-500)',
  sage: 'var(--green-400)',
  ink: 'var(--ink-700)'
};
function StatCard({
  label,
  value,
  unit,
  sub,
  delta,
  dot = 'green',
  className = '',
  ...rest
}) {
  useStyle();
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['cds-stat', className].filter(Boolean).join(' ')
  }, rest), /*#__PURE__*/React.createElement("div", {
    className: "cds-stat__eyebrow"
  }, dot && /*#__PURE__*/React.createElement("span", {
    className: "cds-stat__dot",
    style: {
      background: DOTS[dot] || dot
    }
  }), label), /*#__PURE__*/React.createElement("div", {
    className: "cds-stat__value"
  }, value, unit && /*#__PURE__*/React.createElement("small", null, " ", unit)), (sub || delta) && /*#__PURE__*/React.createElement("div", {
    className: ['cds-stat__sub', delta ? 'cds-stat__sub--up' : ''].join(' ')
  }, delta || sub));
}
Object.assign(__ds_scope, { StatCard });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/stat/StatCard.jsx", error: String((e && e.message) || e) }); }

// components/streak/ArrosoirMeter.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
/**
 * ArrosoirMeter — the daily watering-can / streak meter. A row of small cells
 * fills green as sessions are completed ("8/10 · 8 sessions aujourd'hui").
 * A brand-specific gamification primitive.
 */

const CSS = `
.cds-arrosoir{font-family:var(--font-sans);}
.cds-arrosoir__head{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;}
.cds-arrosoir__label{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--text-muted);}
.cds-arrosoir__count{font-size:13px;font-weight:700;color:var(--green-700);font-variant-numeric:tabular-nums;}
.cds-arrosoir__cells{display:flex;gap:4px;}
.cds-arrosoir__cell{flex:1;height:14px;border-radius:4px;background:var(--cream-sunken);
  box-shadow:var(--shadow-inset);transition:background var(--dur-base) var(--ease-out);}
.cds-arrosoir__cell.is-on{background:var(--green-500);box-shadow:none;}
.cds-arrosoir__cell.is-on.is-last{background:var(--green-600);}
.cds-arrosoir__foot{font-size:12.5px;color:var(--text-muted);margin-top:8px;}
`;
let injected = false;
function useStyle() {
  if (typeof document !== 'undefined' && !injected) {
    const e = document.createElement('style');
    e.textContent = CSS;
    document.head.appendChild(e);
    injected = true;
  }
}
function ArrosoirMeter({
  value = 0,
  total = 10,
  label = 'ARROSOIR',
  foot,
  showCount = true,
  className = '',
  ...rest
}) {
  useStyle();
  const cells = Array.from({
    length: total
  }, (_, i) => i < value);
  return /*#__PURE__*/React.createElement("div", _extends({
    className: ['cds-arrosoir', className].filter(Boolean).join(' ')
  }, rest), (label || showCount) && /*#__PURE__*/React.createElement("div", {
    className: "cds-arrosoir__head"
  }, label && /*#__PURE__*/React.createElement("span", {
    className: "cds-arrosoir__label"
  }, label), showCount && /*#__PURE__*/React.createElement("span", {
    className: "cds-arrosoir__count"
  }, value, "/", total)), /*#__PURE__*/React.createElement("div", {
    className: "cds-arrosoir__cells"
  }, cells.map((on, i) => /*#__PURE__*/React.createElement("span", {
    key: i,
    className: ['cds-arrosoir__cell', on ? 'is-on' : '', on && i === value - 1 ? 'is-last' : ''].join(' ')
  }))), foot && /*#__PURE__*/React.createElement("div", {
    className: "cds-arrosoir__foot"
  }, foot));
}
Object.assign(__ds_scope, { ArrosoirMeter });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/streak/ArrosoirMeter.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/AppShell.jsx
try { (() => {
/* Culture app — shell chrome + top navigation.
 * Recreates the browser-window framing and the fixed top nav from the mockups:
 * logo + word, primary tabs, right-side status pills, search, avatar.
 * Pulls primitives from the compiled DS bundle on window.
 */
const DS = window.CultureDesignSystem_9fd2c0;
const {
  Icon,
  Pill,
  Avatar
} = DS;
const NAV = [{
  id: 'jardin',
  label: 'jardin'
}, {
  id: 'explorer',
  label: 'explorer'
}, {
  id: 'nouvel',
  label: 'nouvel atelier'
}, {
  id: 'profil',
  label: 'profil'
}];
function TopNav({
  active,
  onNavigate
}) {
  return /*#__PURE__*/React.createElement("header", {
    className: "ck-nav"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ck-nav__left"
  }, /*#__PURE__*/React.createElement("a", {
    className: "ck-brand",
    onClick: () => onNavigate('jardin')
  }, /*#__PURE__*/React.createElement("img", {
    src: "../../assets/logo-mark.svg",
    width: "26",
    height: "26",
    alt: ""
  }), /*#__PURE__*/React.createElement("span", {
    className: "ck-brand__word"
  }, "Culture")), /*#__PURE__*/React.createElement("nav", {
    className: "ck-tabs"
  }, NAV.map(n => /*#__PURE__*/React.createElement("button", {
    key: n.id,
    className: 'ck-tab' + (active === n.id ? ' is-active' : ''),
    onClick: () => onNavigate(n.id)
  }, n.label)))), /*#__PURE__*/React.createElement("div", {
    className: "ck-nav__right"
  }, /*#__PURE__*/React.createElement(Pill, {
    icon: "sun"
  }, "matin \xB7 printemps"), /*#__PURE__*/React.createElement(Pill, null, "jour 12"), /*#__PURE__*/React.createElement("button", {
    className: "ck-search"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 15
  }), /*#__PURE__*/React.createElement("span", null, "rechercher un atelier\u2026"), /*#__PURE__*/React.createElement("kbd", null, "\u2318K")), /*#__PURE__*/React.createElement("button", {
    className: "ck-avatarbtn",
    onClick: () => onNavigate('profil')
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: "Alexis",
    size: 34,
    round: true
  }))));
}

/* Browser-window framing around a screen. */
function AppShell({
  url = 'culture.app/jardin',
  children,
  scroll = false
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "ck-window"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ck-titlebar"
  }, /*#__PURE__*/React.createElement("span", {
    className: "ck-dot",
    style: {
      background: '#E0827A'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "ck-dot",
    style: {
      background: '#E6C26B'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "ck-dot",
    style: {
      background: '#9FC27A'
    }
  }), /*#__PURE__*/React.createElement("span", {
    className: "ck-url"
  }, url)), /*#__PURE__*/React.createElement("div", {
    className: 'ck-viewport' + (scroll ? ' is-scroll' : '')
  }, children));
}
Object.assign(window, {
  TopNav,
  AppShell,
  CK_NAV: NAV
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/AppShell.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/ScreenAtelier.jsx
try { (() => {
/* Culture — Atelier (subject workspace). Default sub-tab: Analyse dashboard. */
const DS_A = window.CultureDesignSystem_9fd2c0;
const MASTERY = [{
  n: '01',
  name: 'Membrane plasmique',
  v: 96,
  tone: 'green'
}, {
  n: '02',
  name: 'Cytosquelette',
  v: 78,
  tone: 'green'
}, {
  n: '03',
  name: 'Mitochondrie',
  v: 54,
  tone: 'sage'
}, {
  n: '04',
  name: 'Réticulum',
  v: 31,
  tone: 'light'
}, {
  n: '05',
  name: 'Golgi & lysosomes',
  v: 18,
  tone: 'light'
}, {
  n: '06',
  name: 'Noyau & division',
  v: 8,
  tone: 'light'
}];
const CHART = [4, 9, 14, 7, 3, 1];
const MEMBERS = [{
  i: 'C',
  name: 'Claire V.',
  role: 'propriétaire',
  sec: 'terminé',
  p: 100,
  last: "aujourd'hui",
  note: '19,5'
}, {
  i: 'M',
  name: 'Marie L.',
  role: 'gestionnaire',
  sec: '05 · Golgi',
  p: 84,
  last: 'il y a 2 h',
  note: '16,0'
}, {
  i: 'L',
  name: 'Lucas B.',
  role: 'membre',
  sec: '03 · Mitochondrie',
  p: 58,
  last: 'hier',
  note: '13,5'
}];
function ScreenAtelier() {
  const {
    Tabs,
    SegmentedControl,
    Button,
    Badge,
    StatCard,
    ProgressBar,
    IconButton,
    Avatar
  } = DS_A;
  const [tab, setTab] = React.useState('analyse');
  const [range, setRange] = React.useState('30 jours');
  return /*#__PURE__*/React.createElement("div", {
    className: "ck-screen"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ck-breadcrumb"
  }, "jardin ", /*#__PURE__*/React.createElement("span", null, "\u203A"), " biologie cellulaire"), /*#__PURE__*/React.createElement("div", {
    className: "ck-spread",
    style: {
      alignItems: 'flex-start',
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "ck-row",
    style: {
      gap: 10,
      flexWrap: 'wrap'
    }
  }, /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 25,
      fontWeight: 700,
      color: 'var(--text-strong)',
      whiteSpace: 'nowrap'
    }
  }, "Biologie cellulaire \u2014 L2"), /*#__PURE__*/React.createElement(Badge, {
    tone: "premium"
  }, "premium"), /*#__PURE__*/React.createElement(Badge, {
    tone: "neutral"
  }, "priv\xE9")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13,
      color: 'var(--text-muted)',
      marginTop: 6
    }
  }, "par Pr. Claire Vaisse \xB7 38 membres \xB7 #B2K9P3M")), /*#__PURE__*/React.createElement("div", {
    className: "ck-row",
    style: {
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    icon: "qr-code"
  }, "partager \xB7 QR"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    icon: "settings"
  }, "param\xE8tres"))), /*#__PURE__*/React.createElement(Tabs, {
    value: tab,
    onChange: setTab,
    tabs: [{
      value: 'programme',
      label: 'Programme éducatif'
    }, {
      value: 'examen',
      label: "Génération d'examen"
    }, {
      value: 'analyse',
      label: 'Analyse'
    }, {
      value: 'cours',
      label: 'Génération de cours',
      badge: 'V2'
    }]
  }), tab !== 'analyse' ? /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '60px 0',
      textAlign: 'center',
      color: 'var(--text-faint)',
      fontFamily: 'var(--font-sans)',
      fontStyle: 'normal',
      fontSize: 16
    }
  }, "\xAB cette vue arrive bient\xF4t \u2014 ouvre l'onglet Analyse \xBB") : /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 22
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ck-spread",
    style: {
      marginBottom: 16
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h3", {
    style: {
      fontSize: 19,
      fontWeight: 700,
      color: 'var(--text-strong)'
    }
  }, "Tableau de bord"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-muted)',
      marginTop: 3
    }
  }, "vue gestionnaire \xB7 38 membres \xB7 mis \xE0 jour il y a 5 min")), /*#__PURE__*/React.createElement("div", {
    className: "ck-row",
    style: {
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(SegmentedControl, {
    value: range,
    onChange: setRange,
    options: ['7 jours', '30 jours', 'tout']
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm",
    icon: "download"
  }, "exporter CSV"))), /*#__PURE__*/React.createElement("div", {
    className: "ck-stat-grid",
    style: {
      marginBottom: 18
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    label: "MEMBRES",
    value: "38",
    delta: "+5 ce mois"
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "PROGRESSION MOY.",
    value: "61",
    unit: "%",
    delta: "+4 pts / 7 j",
    dot: "sage"
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "BRIQUES MA\xCETRIS\xC9ES",
    value: "118",
    sub: "sur 142",
    dot: "green"
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "NOTE MOYENNE EXAMENS",
    value: "14,2/20",
    sub: "3 examens pass\xE9s",
    dot: "gold"
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.4fr 1fr',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "cds-card",
    style: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-sm)',
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ck-eyebrow",
    style: {
      marginBottom: 16
    }
  }, "MA\xCETRISE PAR SECTION (MOYENNE DU GROUPE)"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 13
    }
  }, MASTERY.map(m => /*#__PURE__*/React.createElement("div", {
    key: m.n,
    className: "ck-row",
    style: {
      gap: 12
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 11,
      color: 'var(--text-faint)',
      width: 16,
      fontVariantNumeric: 'tabular-nums'
    }
  }, m.n), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--text-body)',
      width: 150,
      flex: 'none'
    }
  }, m.name), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(ProgressBar, {
    value: m.v,
    tone: m.tone,
    size: "md"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12.5,
      fontWeight: 700,
      color: 'var(--text-strong)',
      width: 36,
      textAlign: 'right'
    }
  }, m.v, "%"))))), /*#__PURE__*/React.createElement("div", {
    className: "cds-card",
    style: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-sm)',
      padding: 20
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ck-eyebrow",
    style: {
      marginBottom: 16
    }
  }, "R\xC9PARTITION \xB7 SECTION EN COURS"), /*#__PURE__*/React.createElement("div", {
    className: "ck-row",
    style: {
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 8,
      height: 150,
      padding: '0 4px'
    }
  }, CHART.map((v, i) => /*#__PURE__*/React.createElement("div", {
    key: i,
    style: {
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 6
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      fontWeight: 700,
      color: i === 2 ? 'var(--tan-600)' : 'var(--text-muted)'
    }
  }, v), /*#__PURE__*/React.createElement("div", {
    style: {
      width: '100%',
      maxWidth: 30,
      height: v / 14 * 110,
      borderRadius: '6px 6px 0 0',
      background: i === 2 ? 'var(--tan-500)' : 'var(--green-500)'
    }
  }), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 10,
      color: 'var(--text-faint)'
    }
  }, "0", i + 1)))), /*#__PURE__*/React.createElement("div", {
    className: "ck-accroche",
    style: {
      fontSize: 14,
      textAlign: 'center',
      marginTop: 10
    }
  }, "\xAB le gros du groupe est sur la mitochondrie \xBB"))), /*#__PURE__*/React.createElement("div", {
    className: "cds-card",
    style: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-sm)',
      padding: '18px 20px',
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ck-spread",
    style: {
      marginBottom: 6
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ck-eyebrow"
  }, "PROGRESSION PAR MEMBRE"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--text-faint)'
    }
  }, "6 sur 38 \xB7 trier par progression \u25BE")), /*#__PURE__*/React.createElement("table", {
    className: "ck-table"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("th", null, "MEMBRE"), /*#__PURE__*/React.createElement("th", null, "SECTION EN COURS"), /*#__PURE__*/React.createElement("th", {
    style: {
      width: 200
    }
  }, "PROGRESSION"), /*#__PURE__*/React.createElement("th", null, "DERNI\xC8RE ACTIVIT\xC9"), /*#__PURE__*/React.createElement("th", {
    style: {
      textAlign: 'right'
    }
  }, "NOTE"))), /*#__PURE__*/React.createElement("tbody", null, MEMBERS.map(m => /*#__PURE__*/React.createElement("tr", {
    key: m.name
  }, /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "ck-row",
    style: {
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: m.i,
    size: 30
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 600,
      color: 'var(--text-strong)',
      fontSize: 13.5
    }
  }, m.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: 'var(--text-faint)'
    }
  }, m.role)))), /*#__PURE__*/React.createElement("td", null, m.sec), /*#__PURE__*/React.createElement("td", null, /*#__PURE__*/React.createElement("div", {
    className: "ck-row",
    style: {
      gap: 8
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement(ProgressBar, {
    value: m.p,
    size: "sm"
  })), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 12,
      color: 'var(--text-muted)',
      width: 34
    }
  }, m.p, "%"))), /*#__PURE__*/React.createElement("td", null, m.last), /*#__PURE__*/React.createElement("td", {
    style: {
      textAlign: 'right',
      fontWeight: 700,
      color: 'var(--text-strong)'
    }
  }, m.note))))))));
}
Object.assign(window, {
  ScreenAtelier
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/ScreenAtelier.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/ScreenExplorer.jsx
try { (() => {
/* Culture — Explorer (discover & join ateliers). */
const DS_E = window.CultureDesignSystem_9fd2c0;
const ATELIERS = [{
  tag: 'CUISINE',
  title: 'Cuisine du soir',
  meta: '4 820 membres · 142 briques · tous niveaux',
  glyph: 'search',
  art: 'linear-gradient(135deg,#E0C48A,#CDA868)'
}, {
  tag: 'ASTRO',
  title: 'Astronomie pour curieux',
  meta: '2 140 membres · 88 briques · débutant',
  glyph: 'moon',
  art: 'linear-gradient(135deg,#CBB29A,#B89C84)'
}, {
  tag: 'JARDIN',
  title: 'Jardin de balcon',
  meta: '1 208 membres · 64 briques · débutant',
  glyph: 'leaf',
  art: 'linear-gradient(135deg,#A9C58A,#8FB36E)'
}, {
  tag: 'OENO',
  title: 'Œnologie · introduction',
  meta: '980 membres · 110 briques · intermédiaire',
  glyph: 'droplet',
  art: 'linear-gradient(135deg,#B6AE9A,#9C9582)'
}];
function ScreenExplorer() {
  const {
    Icon,
    Button,
    Input,
    Tag
  } = DS_E;
  return /*#__PURE__*/React.createElement("div", {
    className: "ck-screen",
    style: {
      maxWidth: 1000,
      margin: '0 auto',
      minHeight: 560
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ck-spread",
    style: {
      alignItems: 'flex-start'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "ck-eyebrow",
    style: {
      marginBottom: 6
    }
  }, "EXPLORER"), /*#__PURE__*/React.createElement("h1", {
    className: "ck-hero-title"
  }, "de nouvelles graines \xE0 planter."))), /*#__PURE__*/React.createElement("div", {
    style: {
      position: 'relative',
      margin: '18px 0 8px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      left: 14,
      top: '50%',
      transform: 'translateY(-50%)',
      color: 'var(--text-faint)'
    }
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "search",
    size: 18
  })), /*#__PURE__*/React.createElement("input", {
    className: "cds-input",
    style: {
      paddingLeft: 42,
      height: 46,
      fontSize: 15
    },
    placeholder: "rechercher par nom, mati\xE8re ou tag\u2026"
  })), /*#__PURE__*/React.createElement("div", {
    className: "ck-spread",
    style: {
      margin: '20px 0 12px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--text-strong)'
    }
  }, "propos\xE9s par Culture"), /*#__PURE__*/React.createElement("span", {
    className: "ck-accroche",
    style: {
      fontSize: 14
    }
  }, "\xAB nos ateliers loisir, pr\xEAts \xE0 pousser \xBB")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 14
    }
  }, ATELIERS.map(a => /*#__PURE__*/React.createElement("div", {
    key: a.tag,
    className: "ck-cover-card"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ck-cover-card__art",
    style: {
      background: a.art
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 10,
      left: 12,
      fontSize: 9.5,
      letterSpacing: '.12em',
      color: 'rgba(255,255,255,.9)',
      fontWeight: 700
    }
  }, "COVER ", a.tag), /*#__PURE__*/React.createElement("span", {
    className: "ck-cover-card__badge"
  }, "propos\xE9 par Culture"), /*#__PURE__*/React.createElement("div", {
    className: "ck-cover-card__glyph"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: a.glyph,
    size: 18
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '12px 14px 14px'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      color: 'var(--text-strong)',
      fontSize: 14.5
    }
  }, a.title), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: 'var(--text-muted)',
      marginTop: 4
    }
  }, a.meta), /*#__PURE__*/React.createElement("div", {
    className: "ck-accroche",
    style: {
      fontSize: 13,
      marginTop: 8
    }
  }, "cliquer pour en savoir plus \u2192"))))), /*#__PURE__*/React.createElement("div", {
    className: "cds-card",
    style: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-sm)',
      padding: '16px 20px',
      marginTop: 18,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "ck-eyebrow",
    style: {
      marginBottom: 4
    }
  }, "TU AS UN TAG ?"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      color: 'var(--text-body)'
    }
  }, "colle-le pour rejoindre directement un atelier priv\xE9.")), /*#__PURE__*/React.createElement("div", {
    className: "ck-row",
    style: {
      gap: 10
    }
  }, /*#__PURE__*/React.createElement("input", {
    className: "cds-input",
    style: {
      width: 150,
      fontFamily: 'monospace',
      letterSpacing: '.08em'
    },
    defaultValue: "A3K9P2M"
  }), /*#__PURE__*/React.createElement(Button, {
    variant: "ink",
    trailingArrow: true
  }, "rejoindre"))));
}
Object.assign(window, {
  ScreenExplorer
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/ScreenExplorer.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/ScreenJardin.jsx
try { (() => {
/* Culture — Jardin (home). Garden scene + today's session panel. */
const DS_J = window.CultureDesignSystem_9fd2c0;
function GardenScene() {
  const trees = [{
    x: '30%',
    y: '34%',
    s: 96,
    o: 1
  }, {
    x: '52%',
    y: '22%',
    s: 120,
    o: 1
  }, {
    x: '68%',
    y: '40%',
    s: 104,
    o: 1
  }, {
    x: '20%',
    y: '56%',
    s: 78,
    o: .96
  }, {
    x: '46%',
    y: '54%',
    s: 70,
    o: .9
  }, {
    x: '78%',
    y: '60%',
    s: 64,
    o: .85
  }];
  return /*#__PURE__*/React.createElement("div", {
    className: "ck-garden",
    style: {
      height: '100%',
      minHeight: 540
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ck-garden__ground"
  }), trees.map((t, i) => /*#__PURE__*/React.createElement("img", {
    key: i,
    className: "ck-garden__tree",
    src: "../../assets/logo-mark.svg",
    style: {
      left: t.x,
      top: t.y,
      width: t.s,
      height: t.s,
      opacity: t.o
    },
    alt: ""
  })), /*#__PURE__*/React.createElement("div", {
    className: "ck-garden__note"
  }, "\xAB clique une parcelle pour entrer en session \xBB"));
}
function ScreenJardin({
  onNavigate
}) {
  const {
    Card,
    Button,
    ProgressBar,
    ArrosoirMeter,
    Avatar,
    Badge
  } = DS_J;
  return /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.5fr 1fr',
      minHeight: 560
    }
  }, /*#__PURE__*/React.createElement("div", {
    onClick: () => onNavigate && onNavigate('atelier'),
    style: {
      cursor: 'pointer'
    }
  }, /*#__PURE__*/React.createElement(GardenScene, null)), /*#__PURE__*/React.createElement("div", {
    style: {
      padding: '32px 30px',
      display: 'flex',
      flexDirection: 'column',
      gap: 14
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "ck-accroche",
    style: {
      fontSize: 19
    }
  }, "bonjour Alex,"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-serif)',
      fontSize: 25,
      fontWeight: 600,
      color: 'var(--text-strong)',
      lineHeight: 1.22,
      marginTop: 2
    }
  }, "ta biologie a soif \u2014", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    style: {
      color: 'var(--text-muted)'
    }
  }, "la philo a une r\xE9colte pr\xEAte."))), /*#__PURE__*/React.createElement(Card, {
    pad: "lg"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ck-spread",
    style: {
      marginBottom: 14
    }
  }, /*#__PURE__*/React.createElement("span", {
    className: "ck-eyebrow"
  }, "AUJOURD'HUI"), /*#__PURE__*/React.createElement("span", {
    className: "ck-accroche",
    style: {
      fontSize: 15
    }
  }, "\xAB a soif \xBB")), /*#__PURE__*/React.createElement("div", {
    className: "ck-row",
    style: {
      gap: 11
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: "Bio",
    size: 38
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      minWidth: 0
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      color: 'var(--text-strong)',
      fontSize: 15.5,
      lineHeight: 1.2,
      whiteSpace: 'nowrap'
    }
  }, "Biologie cellulaire"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-muted)',
      marginTop: 2
    }
  }, "niveau 2 \xB7 41 %"))), /*#__PURE__*/React.createElement("div", {
    style: {
      margin: '14px 0 16px'
    }
  }, /*#__PURE__*/React.createElement(ProgressBar, {
    value: 41
  })), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    block: true,
    trailingArrow: true,
    onClick: () => onNavigate && onNavigate('atelier')
  }, "arroser maintenant"), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      fontSize: 12.5,
      color: 'var(--text-muted)',
      marginTop: 10
    }
  }, "12 questions \xB7 ~6 min")), /*#__PURE__*/React.createElement(Card, {
    pad: "md"
  }, /*#__PURE__*/React.createElement(ArrosoirMeter, {
    value: 8,
    total: 10
  })), /*#__PURE__*/React.createElement(Card, {
    pad: "md"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ck-eyebrow",
    style: {
      marginBottom: 10
    }
  }, "JOURNAL"), /*#__PURE__*/React.createElement("div", {
    className: "ck-accroche",
    style: {
      fontSize: 16,
      lineHeight: 1.4
    }
  }, "\xAB La fleur de la philo pointe \u2014 3 baies \xE0 cueillir ce matin. \xBB"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--text-faint)',
      marginTop: 8
    }
  }, "il y a 2 jours \xB7 une bonne r\xE9ponse de plus"))));
}
Object.assign(window, {
  ScreenJardin
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/ScreenJardin.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/ScreenNouvel.jsx
try { (() => {
/* Culture — Nouvel atelier (create). File dropzone + identity + visibility. */
const DS_N = window.CultureDesignSystem_9fd2c0;
const FILES = [{
  name: 'cours_bio_L2_S1.pdf',
  meta: '2.4 Mo · 48 pages'
}, {
  name: 'mitochondrie_chap3.pdf',
  meta: '1.8 Mo · 32 pages'
}, {
  name: 'TD-cytosquelette.pdf',
  meta: '780 Ko · 12 pages'
}];
function ScreenNouvel() {
  const {
    Icon,
    Button,
    Input,
    Radio,
    Badge,
    IconButton
  } = DS_N;
  const [vis, setVis] = React.useState('prive');
  return /*#__PURE__*/React.createElement("div", {
    className: "ck-screen",
    style: {
      maxWidth: 1060,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ck-breadcrumb"
  }, "jardin ", /*#__PURE__*/React.createElement("span", null, "\u203A"), " nouvelle parcelle"), /*#__PURE__*/React.createElement("h1", {
    className: "ck-hero-title"
  }, "plante une nouvelle mati\xE8re."), /*#__PURE__*/React.createElement("div", {
    className: "ck-accroche"
  }, "\xAB d\xE9pose tes cours \u2014 l'IA fera pousser les briques toute seule. \xBB"), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.35fr 1fr',
      gap: 22,
      marginTop: 24,
      alignItems: 'start'
    }
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "ck-eyebrow",
    style: {
      marginBottom: 10
    }
  }, "\u25CD SOURCE \xB7 LE C\u0152UR DE TON ATELIER"), /*#__PURE__*/React.createElement("div", {
    className: "ck-dropzone"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ck-dropzone__icon"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "upload",
    size: 26
  })), /*#__PURE__*/React.createElement("div", {
    style: {
      fontWeight: 700,
      color: 'var(--text-strong)',
      fontSize: 17
    }
  }, "d\xE9pose tes fichiers ici"), /*#__PURE__*/React.createElement("div", {
    className: "ck-accroche",
    style: {
      fontSize: 15,
      margin: '4px 0 14px'
    }
  }, "\xAB glisse-d\xE9pose, ou colle un lien Drive \xBB"), /*#__PURE__*/React.createElement(Button, {
    variant: "secondary",
    icon: "upload"
  }, "parcourir mes fichiers"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12,
      color: 'var(--text-faint)',
      marginTop: 14
    }
  }, "format V1 \u2014 ", /*#__PURE__*/React.createElement("span", {
    style: {
      fontFamily: 'monospace',
      background: 'var(--tan-100)',
      padding: '1px 5px',
      borderRadius: 4
    }
  }, ".pdf"), " \xB7 25 Mo max / fichier \xB7 Word, PowerPoint, audio, vid\xE9o arrivent en V2")), /*#__PURE__*/React.createElement("div", {
    className: "ck-spread",
    style: {
      margin: '16px 0 8px'
    }
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      fontWeight: 600,
      color: 'var(--text-strong)'
    }
  }, "3 fichiers d\xE9pos\xE9s"), /*#__PURE__*/React.createElement("span", {
    className: "ck-accroche",
    style: {
      fontSize: 13
    }
  }, "l'IA extraira les briques apr\xE8s la cr\xE9ation")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 8
    }
  }, FILES.map(f => /*#__PURE__*/React.createElement("div", {
    key: f.name,
    className: "ck-file"
  }, /*#__PURE__*/React.createElement(Icon, {
    name: "file-text",
    size: 18
  }), /*#__PURE__*/React.createElement("div", {
    style: {
      flex: 1
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      color: 'var(--text-strong)',
      fontWeight: 500
    }
  }, f.name), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 11.5,
      color: 'var(--text-faint)'
    }
  }, f.meta)), /*#__PURE__*/React.createElement(IconButton, {
    icon: "x",
    plain: true,
    size: "sm",
    label: "retirer"
  }))))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 16
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "cds-card",
    style: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-sm)',
      padding: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ck-eyebrow",
    style: {
      marginBottom: 12
    }
  }, "\u25CD IDENTIT\xC9"), /*#__PURE__*/React.createElement("div", {
    className: "ck-cover"
  }, /*#__PURE__*/React.createElement("span", {
    style: {
      position: 'absolute',
      top: 10,
      left: 12,
      fontSize: 10,
      letterSpacing: '.12em',
      color: 'rgba(255,255,255,.85)',
      fontWeight: 700
    }
  }, "COVER"), /*#__PURE__*/React.createElement("button", {
    className: "ck-cover__btn"
  }, "changer la couverture")), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 14,
      marginTop: 14
    }
  }, /*#__PURE__*/React.createElement(Input, {
    label: "nom",
    placeholder: "ex. Biologie cellulaire \u2014 L2"
  }), /*#__PURE__*/React.createElement(Input, {
    label: "description courte",
    multiline: true,
    rows: 2,
    placeholder: "une phrase pour situer la mati\xE8re\u2026"
  }))), /*#__PURE__*/React.createElement("div", {
    className: "cds-card",
    style: {
      background: 'var(--surface-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-sm)',
      padding: 18
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ck-eyebrow",
    style: {
      marginBottom: 4
    }
  }, "\u25CD VISIBILIT\xC9"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 12.5,
      color: 'var(--text-muted)',
      marginBottom: 12
    }
  }, "le reste se r\xE8gle ensuite dans les param\xE8tres."), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }
  }, /*#__PURE__*/React.createElement(Radio, {
    name: "vis",
    label: "Priv\xE9",
    description: "on rejoint via un tag ou une invitation",
    card: true,
    checked: vis === 'prive',
    onChange: () => setVis('prive')
  }), /*#__PURE__*/React.createElement(Radio, {
    name: "vis",
    label: "Public",
    description: "visible dans la recherche par tous",
    card: true,
    checked: vis === 'public',
    onChange: () => setVis('public')
  }))), /*#__PURE__*/React.createElement(Button, {
    variant: "primary",
    block: true,
    size: "lg",
    trailingArrow: true
  }, "cr\xE9er l'atelier"), /*#__PURE__*/React.createElement("div", {
    style: {
      textAlign: 'center',
      fontSize: 12,
      color: 'var(--text-muted)',
      marginTop: -6
    }
  }, "l'IA extraira ensuite les briques \xB7 tu pourras tout ajuster"))));
}
Object.assign(window, {
  ScreenNouvel
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/ScreenNouvel.jsx", error: String((e && e.message) || e) }); }

// ui_kits/app/ScreenProfil.jsx
try { (() => {
/* Culture — Profil. Identity, subscription, stats, streak. */
const DS_P = window.CultureDesignSystem_9fd2c0;
function ScreenProfil() {
  const {
    Card,
    Button,
    Badge,
    Tag,
    Avatar,
    StatCard,
    ArrosoirMeter
  } = DS_P;
  return /*#__PURE__*/React.createElement("div", {
    className: "ck-screen",
    style: {
      maxWidth: 1080,
      margin: '0 auto'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ck-breadcrumb"
  }, "jardin ", /*#__PURE__*/React.createElement("span", null, "\u203A"), " profil"), /*#__PURE__*/React.createElement(Card, {
    tone: "tan",
    pad: "lg",
    style: {
      display: 'flex',
      gap: 22,
      alignItems: 'center',
      justifyContent: 'space-between'
    }
  }, /*#__PURE__*/React.createElement("div", {
    className: "ck-row",
    style: {
      gap: 20
    }
  }, /*#__PURE__*/React.createElement(Avatar, {
    name: "Alexis",
    size: 92
  }), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
    className: "ck-accroche",
    style: {
      fontSize: 18
    }
  }, "bonjour Alexis,"), /*#__PURE__*/React.createElement("h2", {
    style: {
      fontFamily: 'var(--font-sans)',
      fontSize: 30,
      fontWeight: 700,
      color: 'var(--text-strong)'
    }
  }, "Alexis Bourillon"), /*#__PURE__*/React.createElement("div", {
    className: "ck-row",
    style: {
      gap: 8,
      margin: '8px 0 14px'
    }
  }, /*#__PURE__*/React.createElement(Tag, null, "#AD8G45"), /*#__PURE__*/React.createElement(Badge, {
    tone: "premium"
  }, "\u2605 Premium"), /*#__PURE__*/React.createElement("span", {
    style: {
      fontSize: 13,
      color: 'var(--text-muted)'
    }
  }, "jardinier depuis mars 2026")), /*#__PURE__*/React.createElement("div", {
    className: "ck-row",
    style: {
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ink",
    size: "sm"
  }, "\xE9diter le profil"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm"
  }, "\xE9diter l'avatar"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost",
    size: "sm"
  }, "partager mon jardin")))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 12,
      minWidth: 280
    }
  }, /*#__PURE__*/React.createElement(StatCard, {
    label: "jours de s\xE9rie",
    value: "12",
    dot: ""
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "ateliers actifs",
    value: "5",
    dot: ""
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "plantes vivantes",
    value: "5",
    dot: ""
  }), /*#__PURE__*/React.createElement(StatCard, {
    label: "questions r\xE9pondues",
    value: "2 480",
    dot: ""
  }))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.5fr 1fr',
      gap: 16,
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement(Card, {
    eyebrow: "ABONNEMENT",
    pad: "lg",
    style: {
      background: 'var(--gold-100)',
      borderColor: 'var(--gold-300)'
    }
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 24,
      fontWeight: 700,
      color: 'var(--text-strong)',
      marginTop: 2
    }
  }, "\u2605 Premium \xB7 10 \u20AC/mois"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      color: 'var(--text-body)',
      margin: '8px 0 16px'
    }
  }, "\xC9nergie illimit\xE9e \xB7 Sans publicit\xE9s \xB7 G\xE9n\xE9rateur d'examen inclus \xB7 \xC9change IA en cours d'apprentissage \xB7 Partage avec 2 personnes"), /*#__PURE__*/React.createElement("div", {
    className: "ck-row",
    style: {
      gap: 8
    }
  }, /*#__PURE__*/React.createElement(Button, {
    variant: "ink",
    trailingArrow: true
  }, "g\xE9rer l'abonnement"), /*#__PURE__*/React.createElement(Button, {
    variant: "ghost"
  }, "partager (2 places)"))), /*#__PURE__*/React.createElement(Card, {
    eyebrow: "ARROSOIR DU JOUR",
    pad: "lg"
  }, /*#__PURE__*/React.createElement("div", {
    style: {
      marginTop: 4
    }
  }, /*#__PURE__*/React.createElement(ArrosoirMeter, {
    value: 8,
    total: 12,
    label: "",
    showCount: false,
    foot: "8 sessions aujourd'hui \xB7 prochain joker dans 4 h"
  })))), /*#__PURE__*/React.createElement("div", {
    style: {
      display: 'grid',
      gridTemplateColumns: '1.5fr 1fr',
      gap: 16,
      marginTop: 16
    }
  }, /*#__PURE__*/React.createElement(Card, {
    tone: "dark",
    pad: "lg"
  }, /*#__PURE__*/React.createElement("div", {
    className: "cds-card__eyebrow",
    style: {
      color: 'var(--gold-300)',
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, "EXAMEN OFFICIEL ", /*#__PURE__*/React.createElement("span", {
    style: {
      background: 'rgba(255,255,255,.14)',
      fontSize: 10,
      padding: '2px 6px',
      borderRadius: 5
    }
  }, "V3")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 20,
      fontWeight: 700,
      marginTop: 6
    }
  }, "Page publique de certification"), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      opacity: .82,
      marginTop: 6
    }
  }, "R\xE9capitule tous tes examens standardis\xE9s officiels. Partageable publiquement via lien ou QR code. Disponible \xE0 partir de la version 3.")), /*#__PURE__*/React.createElement(Card, {
    tone: "dashed",
    pad: "lg"
  }, /*#__PURE__*/React.createElement("div", {
    className: "ck-eyebrow",
    style: {
      display: 'flex',
      alignItems: 'center',
      gap: 8
    }
  }, "JARDINIERS AMIS ", /*#__PURE__*/React.createElement(Badge, {
    tone: "version"
  }, "V2")), /*#__PURE__*/React.createElement("div", {
    style: {
      fontSize: 13.5,
      color: 'var(--text-muted)',
      marginTop: 8
    }
  }, "Ajoute des amis via leur tag et suis leur progression. Disponible en version 2."))));
}
Object.assign(window, {
  ScreenProfil
});
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/app/ScreenProfil.jsx", error: String((e && e.message) || e) }); }

__ds_ns.Button = __ds_scope.Button;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Avatar = __ds_scope.Avatar;

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Icon = __ds_scope.Icon;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Pill = __ds_scope.Pill;

__ds_ns.Tag = __ds_scope.Tag;

__ds_ns.ProgressBar = __ds_scope.ProgressBar;

__ds_ns.Tabs = __ds_scope.Tabs;

__ds_ns.Checkbox = __ds_scope.Checkbox;

__ds_ns.Radio = __ds_scope.Radio;

__ds_ns.SegmentedControl = __ds_scope.SegmentedControl;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.StatCard = __ds_scope.StatCard;

__ds_ns.ArrosoirMeter = __ds_scope.ArrosoirMeter;

})();
