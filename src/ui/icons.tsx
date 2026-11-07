import type { ReactNode, SVGProps } from 'react';

const paths: Record<string, ReactNode> = {
  back: <path d="M15 5l-7 7 7 7" />,
  forward: <path d="M9 5l7 7-7 7" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  type: <path d="M3.5 18L8.5 6l5 12M5.3 14h6.4M15.5 13.8c.7-1 1.7-1.5 2.8-1.5 1.7 0 2.7 1 2.7 2.6V18m0-2.6c-2.8-.1-5.3.1-5.3 1.5 0 1.800 4 1.700 5.300-.5" />,
  split: <><rect x="3.500" y="4.500" width="17" height="15" rx="1.500" /><path d="M12 4.500v15M15 9h3M15 12.500h3" /></>,
  expand: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  shrink: <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />,
  bookmark: <path d="M7 3.500h10V21l-5-4-5 4z" />,
  list: <path d="M8.500 6.500H20M8.500 12H20M8.500 17.500H20M4.500 6.500h.01M4.500 12h.01M4.500 17.500h.01" />,
  notebook: <><path d="M6 3.500h12.500v17H6z" /><path d="M9 3.500v17M3.500 8H6M3.500 12H6M3.500 16H6" /></>,
  more: <path d="M5.500 12h.01M12 12h.01M18.500 12h.01" />,
  highlight: <path d="M14.500 4.500l5 5-8.500 8.500H6v-5zM4 21h16" />,
  note: <><path d="M5 4.500h14v11l-4.500 4.500H5z" /><path d="M14.500 20v-4.500H19M8.500 9h7M8.500 12.500h4" /></>,
  pen: <path d="M4 20l1-4.500L16.500 4 20 7.500 8.500 19zM14.500 6l3.500 3.500" />,
  copy: <><rect x="8.500" y="8.500" width="11.500" height="11.500" rx="1.500" /><path d="M15.500 8.500V4H4v11.500h4.500" /></>,
  words: <path d="M4 7h3.500M10 7h10M4 12h9M16 12h4M4 17h5M12 17h8" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <path d="M4.500 6.500h15M9.500 6.500V4h5v2.500M6.500 6.500l1 13.500h9l1-13.500M10 10v6M14 10v6" />,
  chevronDown: <path d="M6 9.500l6 6 6-6" />,
  undo: <path d="M8 5L4 9l4 4M4.500 9H14a5.500 5.500 0 010 11h-3" />,
  redo: <path d="M16 5l4 4-4 4M19.500 9H10a5.500 5.500 0 000 11h3" />,
  eraser: <path d="M8.500 19.500L3.500 14.500 13.500 4.500l7 7-8 8zM8.500 9.500l7 7M8.500 19.500H20" />,
  eraserPixel: <><path d="M8.500 19.500L3.500 14.500 13.500 4.500l7 7-8 8zM8.500 19.500H20" /><path d="M10.500 11.500h.01M13 14h.01M13 9h.01M15.500 11.500h.01" /></>,
  lasso: <path d="M12 4.500c5 0 8.500 2.300 8.500 5.500s-3.500 5.500-8.500 5.500S3.500 13.200 3.500 10 7 4.500 12 4.500zM9 15c-1.500.8-2 2-1 3.200 1 1.100 1.300 1.800.5 2.800" />,
  textBox: <><rect x="3.500" y="4.500" width="17" height="15" rx="1" strokeDasharray="3 2.500" /><path d="M8 9h8M12 9v6.500" /></>,
  shape: <><rect x="3.500" y="11" width="9" height="9" /><circle cx="15.500" cy="8.500" r="5" /></>,
  image: <><rect x="3.500" y="5" width="17" height="14" rx="1" /><circle cx="9" cy="10" r="1.500" /><path d="M4 17l5-4 3.500 3 3-2.500L20.500 17" /></>,
  paper: <><path d="M5.500 3.500h13v17h-13z" /><path d="M5.500 8h13M5.500 12h13M5.500 16h13" /></>,
  paste: <><rect x="5" y="5" width="14" height="16" rx="1" /><path d="M9 3.500h6V7H9zM9 12h6M9 16h6" /></>,
  duplicate: <><rect x="8.500" y="8.500" width="11.500" height="11.500" rx="1.500" /><path d="M15.500 8.500V4H4v11.500h4.500M14.250 11.500v5.500M11.500 14.250H17" /></>,
  palette: <><circle cx="12" cy="12" r="8.500" /><path d="M12 3.500v17M3.500 12h17" /></>,
  bold: <path d="M7 4.500h6a3.500 3.500 0 010 7.500H7zM7 12h7a3.750 3.750 0 010 7.500H7z" />,
  italic: <path d="M10 4.500h7M7 19.500h7M14 4.500l-4 15" />,
  underline: <path d="M7 4v8a5 5 0 0010 0V4M5 20.500h14" />,
  strike: <path d="M4 12h16M16.500 7c-.5-1.800-2.300-3-4.500-3-2.500 0-4.500 1.300-4.500 3.500 0 1.500.9 2.500 2.200 3.200M7.500 17c.5 1.800 2.300 3 4.500 3 2.500 0 4.500-1.300 4.500-3.500 0-.9-.3-1.700-.8-2.300" />,
  bullets: <path d="M9 6.500h11M9 12h11M9 17.500h11M4.500 6.500h.01M4.500 12h.01M4.500 17.500h.01" />,
  numbers: <path d="M10 6.500h10M10 12h10M10 17.500h10M4 5l1.500-.8V9M4 13.500c0-1 2.500-1.500 2.500 0 0 1-2.500 1.800-2.500 3h2.500" />,
  check: <path d="M4 12.500l5 5L20 6.500" />,
  checklist: <path d="M3.500 6.500l2 2 3-3.500M3.500 15.500l2 2 3-3.500M11.500 7h9M11.500 16h9" />,
  alignLeft: <path d="M4 6h16M4 10.500h10M4 15h16M4 19.500h10" />,
  alignCenter: <path d="M4 6h16M7 10.500h10M4 15h16M7 19.500h10" />,
  alignRight: <path d="M4 6h16M10 10.500h10M4 15h16M10 19.500h10" />,
  share: <path d="M12 15V3.500M8 7l4-3.500L16 7M6 11H4.500v9.500h15V11H18" />,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.600 5.600l2.100 2.100M16.300 16.300l2.100 2.100M18.400 5.600l-2.100 2.100M7.700 16.300l-2.100 2.100" /></>,
  grip: <path d="M9.500 6h.01M14.500 6h.01M9.500 12h.01M14.500 12h.01M9.500 18h.01M14.500 18h.01" />,
  info: <><circle cx="12" cy="12" r="8.500" /><path d="M12 11v5.500M12 7.800h.01" /></>,
};

export type IconName = keyof typeof paths & string;

export function Icon({ name, size = 22, ...rest }: { name: string; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.700" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {paths[name]}
    </svg>
  );
}
