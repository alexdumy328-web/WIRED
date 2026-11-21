type P = { className?: string }
const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

export const TodayIcon = (p: P) => (<svg {...base} {...p}><circle cx="12" cy="12" r="3.5" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></svg>)
export const ListIcon = (p: P) => (<svg {...base} {...p}><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></svg>)
export const VanIcon = (p: P) => (<svg {...base} {...p}><path d="M2.5 16.5V7a1.5 1.5 0 0 1 1.5-1.5h10V16.5M14 9h4l3.5 4v3.5h-2" /><circle cx="7" cy="17.5" r="2" /><circle cx="17" cy="17.5" r="2" /><path d="M9 17.5h6" /></svg>)
export const WeekIcon = (p: P) => (<svg {...base} {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4M8 14h2M12 14h2M16 14h0M8 17h2" /></svg>)
export const ChartIcon = (p: P) => (<svg {...base} {...p}><path d="M4 20V10M10 20V4M16 20v-7M21 20H3" /></svg>)
export const SlidersIcon = (p: P) => (<svg {...base} {...p}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>)
export const ClockIcon = (p: P) => (<svg {...base} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>)
export const BoxIcon = (p: P) => (<svg {...base} {...p}><path d="m3.5 7.5 8.5-4 8.5 4v9l-8.5 4-8.5-4Z" /><path d="m3.5 7.5 8.5 4 8.5-4M12 11.5v9" /></svg>)
export const WrenchIcon = (p: P) => (<svg {...base} {...p}><path d="M14.5 6.5a4 4 0 0 0 5 5L12 19a2.1 2.1 0 0 1-3-3Z" /><path d="M14.5 6.5 17 4l3 3-2.5 2.5" /></svg>)
export const SearchIcon = (p: P) => (<svg {...base} {...p}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>)
