/** Inline icons, drawn with currentColor so they follow the theme. */
const svg = (body, w = 1.8) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const ICON = {
  stack: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="15" width="16" height="4.5" rx="1.6" fill="currentColor"/><rect x="5.5" y="9.5" width="13" height="4.5" rx="1.6" fill="currentColor" opacity=".72"/><rect x="7" y="4" width="10" height="4.5" rx="1.6" fill="currentColor" opacity=".45"/></svg>',
  plus: svg('<path d="M12 5v14M5 12h14"/>', 2),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 2.2),
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>', 2),
  arrow: svg('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  back: svg('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
  renew: svg('<path d="M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  stop: svg('<circle cx="12" cy="12" r="8.5"/><path d="M8.5 15.5l7-7"/>'),
  seat: svg('<path d="M7 11V6.5A2.5 2.5 0 0 1 9.5 4h5A2.5 2.5 0 0 1 17 6.5V11M5 11h14v4H5zM7 15v5M17 15v5"/>'),
  user: svg('<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>'),
  noOwner: svg('<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5 1.3 0 2.5.3 3.6.8M16.5 16.5l4 4M20.5 16.5l-4 4"/>'),
  inbox: svg('<path d="M4 13l2.5-7.5h11L20 13v5.5H4z"/><path d="M4 13h5l1 2.5h4l1-2.5h5"/>'),
  chart: svg('<path d="M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6"/>'),
  list: svg('<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>', 2),
  link: svg('<path d="M14 5h5v5M19 5l-8 8M17 14v5H5V7h5"/>'),
  edit: svg('<path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>'),
  trash: svg('<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>'),
  alert: svg('<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>', 2),
  sparkle: svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>'),
  calendar: svg('<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>'),
  coins: svg('<ellipse cx="9" cy="7" rx="5.5" ry="2.5"/><path d="M3.5 7v4c0 1.4 2.5 2.5 5.5 2.5s5.5-1.1 5.5-2.5V7M9.5 16.4c.9 1.2 3 2.1 5.5 2.1 3 0 5.5-1.1 5.5-2.5v-4c0-1.2-1.8-2.2-4.3-2.4"/>'),
  info: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>', 2),
};
