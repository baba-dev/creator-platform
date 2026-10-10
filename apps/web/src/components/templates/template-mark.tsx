import type { ReactNode } from "react";
const icons:Record<string,ReactNode> = {
creator:<><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m8 10 3 2-3 2zm5-1h5m-5 4h5"/></>,
editorial:<><rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="11" cy="10" r="3"/><path d="M7 16h10"/></>,
story:<><rect x="6" y="2" width="12" height="20" rx="3"/><circle cx="12" cy="17" r="1"/><path d="M9 6h6"/></>,
ad:<><path d="M3 10h5l10-5v14L8 14H3zM8 14l2 6h3l-2-5m8-5 2 2-2 2"/></>,
business:<><rect x="3" y="6" width="18" height="15" rx="2"/><path d="M8 6V4h8v2m-13 7h18m-11 0v2h4v-2"/></>,
product:<><path d="m3 8 9-5 9 5v9l-9 5-9-5zm0 0 9 5 9-5m-9 5v9"/></>,
white:<><rect x="4" y="4" width="16" height="16" rx="3"/><path d="m9 11 3-3 3 3-3 3zm-5 5h16"/></>,
luxury:<><path d="m6 3 12 0 4 6-10 12L2 9zm-4 6h20M9 3l-2 6 5 12 5-12-2-6"/></>,
food:<><path d="M4 3v8a3 3 0 0 0 6 0V3m-3 0v18m12 0V3c-4 2-5 8-2 11h2"/></>,
portrait:<><circle cx="12" cy="8" r="4"/><path d="M4 21v-2c0-6 16-6 16 0v2"/></>,
film:<><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M12 3v4m9 5h-4m-5 9v-4m-9-5h4"/></>,
logo:<><path d="M12 2 3 19h18zm0 7v10M7 14h10"/></>,
poster:<><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M8 8h8m-8 4h8m-8 4h4"/></>,
character:<><circle cx="12" cy="9" r="4"/><path d="M5 20q0-8 7-8t7 8M6 3l2 3m10-3-2 3"/></>,
landscape:<><path d="m2 20 7-11 4 6 3-4 6 9z"/><circle cx="17" cy="5" r="2"/></>,
promo:<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/></>,
reel:<><rect x="7" y="2" width="10" height="20" rx="2"/><path d="m11 9 4 3-4 3"/></>,
short:<><path d="m8 3 9 6-6 3 6 3-9 6-4-4 6-5-6-5z"/></>,
reveal:<><circle cx="12" cy="12" r="9"/><path d="M12 6v12M6 12h12m-3-6-6 12"/></>,
social:<><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3zM5 3h14"/></>,
corporate:<><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0m-7 7v3m-4 0h8"/></>,
voiceover:<><path d="M3 10v4m4-8v12m4-15v18m4-14v10m4-7v4"/></>,
advoice:<><path d="M3 10h5l7-5v14l-7-5H3zm15-3q6 5 0 10m-2-7q2 2 0 4"/></>,
podcast:<><path d="M4 13v-2a8 8 0 0 1 16 0v2m-16 0v5h4v-6H4m16 0v6h-4v-6h4"/></>,
documentary:<><rect x="3" y="5" width="18" height="15" rx="2"/><path d="m3 10 6-3 5 3 7-3M9 14l3-2 3 2-3 3z"/></>
};
export function TemplateMark({name,className="size-5"}:{name:string;className?:string}){
return <svg aria-hidden="true" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">{icons[name]??icons.editorial}</svg>;
}
