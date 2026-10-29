// Ícones SVG próprios (traço arredondado), consistentes com a arte do jogo.
const PATHS = {
  coin: <><circle cx="12" cy="12" r="8" /><path d="M12 8v8M9.5 10.2c0-1 1.1-1.7 2.5-1.7s2.5.7 2.5 1.6c0 2.3-5 1.3-5 3.7 0 .9 1.1 1.7 2.5 1.7s2.5-.7 2.5-1.7" /></>,
  people: <><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" /><circle cx="17" cy="9" r="2.4" /><path d="M15.5 14.2c2.6-.4 4.6 1.2 5 4.3" /></>,
  smile: <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 14c1.8 2.2 5.2 2.2 7 0" /><path d="M9 9.5h.01M15 9.5h.01" strokeWidth="2.6" /></>,
  star: <path d="M12 3.8l2.4 5 5.4.6-4 3.7 1.1 5.4L12 15.8l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z" />,
  calendar: <><rect x="4" y="5.5" width="16" height="14" rx="3" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></>,
  pause: <><path d="M9 6.5v11M15 6.5v11" strokeWidth="3" /></>,
  play: <path d="M8 5.8l10 6.2-10 6.2z" />,
  fast: <><path d="M4.5 6.5l7 5.5-7 5.5zM12.5 6.5l7 5.5-7 5.5z" /></>,
  save: <><path d="M5 4.5h11l3 3v12H5z" /><path d="M8 4.5v5h7v-5M8 19.5v-5h8v5" /></>,
  menu: <path d="M5 7h14M5 12h14M5 17h14" />,
  edit: <><path d="M5 19l1-4L15.5 5.5a2.1 2.1 0 013 3L9 18z" /><path d="M13.5 7.5l3 3" /></>,
  wrench: <path d="M14.5 5a4 4 0 00-4.8 5.3L4.8 15.2a1.8 1.8 0 002.6 2.6l4.9-4.9A4 4 0 0017.6 8l-2.3 2.3-2.3-.6-.6-2.3z" />,
  zoomIn: <><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l4.5 4.5M10.5 8v5M8 10.5h5" /></>,
  zoomOut: <><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l4.5 4.5M8 10.5h5" /></>,
  fit: <path d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15" />,
  undo: <><path d="M8 8.5H14a5 5 0 010 10H9" /><path d="M10.5 5L7 8.5l3.5 3.5" /></>,
  rotate: <><path d="M18.5 12a6.5 6.5 0 11-2.2-4.9" /><path d="M17.5 3.5v4h-4" /></>,
  close: <path d="M7 7l10 10M17 7L7 17" />,
  cart: <><path d="M3.5 5h2.2l2 10h9.8l1.8-7H7" /><circle cx="9.5" cy="19" r="1.4" /><circle cx="16.5" cy="19" r="1.4" /></>,
  chart: <path d="M5 19V11M10 19V6M15 19v-9M20 19v-5M3.5 19.5h17" />,
  mail: <><rect x="3.5" y="6" width="17" height="12" rx="2.5" /><path d="M4 7l8 6 8-6" /></>,
  alert: <><path d="M12 4.5l8.5 15h-17z" /><path d="M12 10v4M12 17h.01" /></>,
  lock: <><rect x="5.5" y="10.5" width="13" height="9" rx="2.5" /><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" /></>,
  sound: <><path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z" /><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" /></>,
  mute: <><path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3z" /><path d="M16 9.5l5 5M21 9.5l-5 5" /></>,
  eye: <><path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.8" /></>,
  map: <><path d="M4 6.5l5-2 6 2 5-2v13l-5 2-6-2-5 2z" /><path d="M9 4.5v13M15 6.5v13" /></>,
  flag: <><path d="M6 20.5V4" /><path d="M6 4.5h10l-2.5 3.5L16 11.5H6" /></>,
  broom: <><path d="M14 4l-3.5 8" /><path d="M7 12h7.5l2.5 8H5z" /><path d="M9 15.5l-.5 4.5M12.5 15.5l.5 4.5" /></>,
  expand: <><rect x="4" y="4" width="9" height="9" rx="2" /><path d="M16 8h4v12H8v-4" strokeDasharray="2 2.5" /></>,
  users: <><circle cx="12" cy="8" r="3.4" /><path d="M5.5 19.5c.8-3.6 3.3-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /></>,
  upgrade: <><path d="M12 19V6M6.5 11.5L12 6l5.5 5.5" /><path d="M6 19.5h12" /></>,
  move: <><path d="M12 3.5v17M3.5 12h17" /><path d="M9.5 6L12 3.5 14.5 6M9.5 18l2.5 2.5 2.5-2.5M6 9.5L3.5 12 6 14.5M18 9.5l2.5 2.5-2.5 2.5" /></>,
  trash: <><path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7" /></>,
  door: <><rect x="6" y="3.5" width="12" height="17" rx="2" /><path d="M14.5 12h.01" strokeWidth="2.6" /></>,
  download: <><path d="M12 4.5v10M7.5 10.5l4.5 4.5 4.5-4.5M5 19.5h14" /></>,
  upload: <><path d="M12 15V5M7.5 9L12 4.5 16.5 9M5 19.5h14" /></>,
  trophy: <><path d="M8 4.5h8v5a4 4 0 01-8 0z" /><path d="M8 6.5H5.5a2.5 2.5 0 002.7 3.4M16 6.5h2.5a2.5 2.5 0 01-2.7 3.4" /><path d="M12 13.5v3M8.5 19.5h7l-.8-3h-5.4z" /></>,
  cloud: <path d="M7.5 18.5h10a3.5 3.5 0 00.4-7 5.5 5.5 0 00-10.6-1.4A4.2 4.2 0 007.5 18.5z" />,
  cloudOff: <><path d="M7.5 18.5h10a3.5 3.5 0 00.4-7 5.5 5.5 0 00-10.6-1.4A4.2 4.2 0 007.5 18.5z" /><path d="M4 4l16 16" /></>,
  user: <><circle cx="12" cy="8.5" r="3.6" /><path d="M5 20c.9-3.8 3.6-5.8 7-5.8s6.1 2 7 5.8" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6" /><path d="M15 15l5 5" /></>,
  logout: <><path d="M14 4.5H6.5v15H14" /><path d="M10.5 12h10M17 8.5l3.5 3.5-3.5 3.5" /></>,
  bulb: <><path d="M9 17.5h6M10 20.5h4" /><path d="M12 3.5a5.5 5.5 0 00-3 10.1V16h6v-2.4a5.5 5.5 0 00-3-10.1z" /></>,
};

export default function Icon({ name, size = 18, className, filled = false, title }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {PATHS[name]}
    </svg>
  );
}
