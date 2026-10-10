import Image from "next/image";
import { TemplateMark } from "@/components/templates/template-mark";
import { getTemplateVisual, templateActivationHref, type TemplateMediaKind } from "@/lib/template-visuals";
export type GalleryTemplate = {slug:string;name:string;description:string;category?:string;mediaKind:TemplateMediaKind;featured?:boolean;defaultInput?:Record<string,unknown>;coverObjectKey?:string|null;coverAlt?:string|null;coverIcon?:string|null;coverVersion?:number};
export function TemplateCard({template,organizationSlug,compact=false,favoriteAction}:{template:GalleryTemplate;organizationSlug:string;compact?:boolean;favoriteAction?:React.ReactNode}){
 const visual=getTemplateVisual(template.slug,template.mediaKind);
 const cover=template.coverObjectKey?`/api/templates/covers/${encodeURIComponent(template.slug)}?v=${template.coverVersion??0}`:visual.cover;
 const alt=template.coverAlt?.trim()||visual.alt;
 return <article className="group relative min-w-0 overflow-hidden rounded-[24px] border border-border bg-card shadow-xs transition duration-200 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-md focus-within:ring-2 focus-within:ring-primary/30">
  <a href={templateActivationHref(organizationSlug,template.slug)} className="block focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-ring" aria-label={`Use ${template.name} template`}>
   <div className={`relative overflow-hidden bg-surface-sunken ${compact?"aspect-[16/9]":"aspect-[16/8.7]"}`}>
     <Image src={cover} alt={alt} unoptimized={Boolean(template.coverObjectKey)} width={960} height={540} className="size-full object-cover transition-transform duration-500 motion-reduce:transition-none group-hover:scale-[1.035]" sizes={compact?"(max-width:640px) 45vw, (max-width:1280px) 24vw, 20vw":"(max-width:640px) 100vw, (max-width:1536px) 50vw, 33vw"}/>
     {!compact&&<div className="absolute left-3 top-3 flex items-center gap-1.5">
       {template.featured&&<span className="rounded-full border border-white/35 bg-background/90 px-2.5 py-1 text-[10px] font-semibold text-foreground backdrop-blur">Featured</span>}
       <span className="rounded-full border border-white/35 bg-background/90 px-2.5 py-1 text-[10px] font-semibold text-foreground backdrop-blur">{template.mediaKind==="VOICE"?"Voice":template.mediaKind==="VIDEO"?"Video":"Image"}</span>
     </div>}
     <span className="absolute bottom-3 left-3 grid size-9 place-items-center rounded-xl border border-white/30 bg-background/90 text-primary shadow-sm backdrop-blur"><TemplateMark name={template.coverIcon||visual.icon} className="size-5"/></span>
   </div>
   <div className={compact?"space-y-1 p-3":"p-5"}>
      {!compact&&<p className="text-[10px] font-bold uppercase tracking-[.16em] text-primary">{template.category}</p>}
      <h3 className={`font-display font-semibold tracking-tight text-foreground ${compact?"text-sm":"mt-2 text-xl"}`}>{template.name}</h3>
      <p className={`text-muted-foreground ${compact?"line-clamp-2 text-xs leading-5":"mt-2 line-clamp-2 min-h-10 text-xs leading-5"}`}>{template.description}</p>
      <div className="mt-3 flex min-w-0 items-center gap-1.5 text-[11px]">
       {!compact && typeof template.defaultInput?.aspectRatio==="string"&&<span className="rounded-lg bg-muted px-2 py-1 text-muted-foreground">{template.defaultInput.aspectRatio}</span>}
       {!compact && typeof template.defaultInput?.resolution==="string"&&<span className="rounded-lg bg-muted px-2 py-1 text-muted-foreground">{template.defaultInput.resolution}</span>}
       <span className="ml-auto font-semibold text-primary">Use template →</span>
      </div>
   </div>
  </a>
  {favoriteAction&&<div className="absolute right-3 top-3 z-10">{favoriteAction}</div>}
 </article>
}
