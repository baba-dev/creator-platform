// The single deterministic source of the Pixel Phase A2 vector exports.
// Run: node apps/web/scripts/build-pixel-phase-a2.mjs --check | --write
// Character identity is based on the existing Pixel laptop mascot; no existing media is modified.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
const repoRoot=resolve(dirname(fileURLToPath(import.meta.url)),"../../..");
const buildPixelAssets=function buildPixelAssets() {
  const root="apps/web/public/brand/pixel";
  const P={
    leftEar:"M323 177 C283 149 231 135 181 140 C132 144 104 161 101 185 C96 208 126 225 161 229 C214 236 269 211 311 189 Z",
    rightEar:"M399 165 C437 117 503 57 566 39 C607 27 638 31 644 51 C652 77 633 107 602 127 C552 160 471 174 414 179 Z",
    tail:"M304 395 C280 398 276 373 268 348 C256 310 234 283 200 281 C173 279 149 293 146 318 C143 339 158 355 179 364 C175 339 184 330 201 331 C224 333 235 365 254 394 C269 418 293 427 313 411 Z",
    body:"M323 296 C302 307 291 329 288 363 C284 397 306 425 349 430 C389 435 437 433 463 408 C481 389 477 351 460 320 C444 291 365 279 323 296 Z",
    head:"M301 248 C297 211 312 178 341 160 C358 149 377 145 395 148 C402 140 407 133 411 126 C423 129 429 139 426 152 C458 156 481 177 495 203 C511 233 512 266 499 291 C484 326 453 346 404 346 C351 348 315 327 305 292 C301 278 299 265 301 248 Z",
    tuft:"M385 153 C394 142 399 136 399 132 C404 137 404 142 403 147 C414 136 418 128 418 121 C425 134 422 147 414 157",
    leftPaw:"M328 347 C341 337 358 348 374 362 C387 373 391 388 384 398 C375 408 353 403 336 393 C323 383 318 359 328 347 Z",
    rightPaw:"M443 343 C427 339 416 353 404 367 C395 377 391 390 399 399 C409 409 431 404 446 394 C457 382 457 355 443 343 Z",
    leftFoot:"M320 409 C329 402 343 404 351 413 C360 423 354 433 336 435 C316 436 309 423 320 409 Z",
    rightFoot:"M434 410 C442 401 455 403 465 413 C475 425 466 435 448 435 C429 434 424 423 434 410 Z"
  };
  const ink="#29272a", ivory="#fbfaf6", shadow="#dedbd5", tip="#333235", violet="#8760c6", coral="#e8867a";
  const xml=(s)=>s.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;");
  const basicAttrs=`fill="${ivory}" stroke="${ink}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"`;
  const path=(d,id,attrs="")=>`<path id="${id}" d="${d}" ${attrs.includes("fill=")?basicAttrs.replace(/^fill="[^"]+" /,""):basicAttrs} ${attrs}/>`;
  const outline=(d,id,order)=>`<path id="${id}" d="${d}" fill="none" stroke="${ink}" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round" pathLength="1" data-pencil-order="${order}"/>`;
  const defs=`<defs>
  <clipPath id="pixel-ear-left-clip"><path d="${P.leftEar}"/></clipPath>
  <clipPath id="pixel-ear-right-clip"><path d="${P.rightEar}"/></clipPath>
  <clipPath id="pixel-tail-clip"><path d="${P.tail}"/></clipPath>
  <pattern id="pixel-pencil-grain" width="9" height="9" patternUnits="userSpaceOnUse"><path d="M-1 9 L9 -1 M4 11 L11 4" stroke="${ink}" stroke-width=".32" opacity=".13" fill="none"/></pattern>
  <linearGradient id="pixel-soft-shade" x1="0" y1="0" x2=".9" y2="1"><stop offset="0" stop-color="${ivory}"/><stop offset=".75" stop-color="${ivory}"/><stop offset="1" stop-color="${shadow}"/></linearGradient>
  </defs>`;
  function eyes(expression) {
    if(["happy","celebrating","landing","idle"].includes(expression)){
      return `<g id="pixel-eyes" fill="none" stroke="${ink}" stroke-width="3.4" stroke-linecap="round">
      <path id="pixel-eye-left" d="M347 262 Q366 244 385 261"/>
      <path id="pixel-eye-right" d="M442 255 Q459 240 475 256"/></g>`;
    }
    if(expression==="mischievous") {
      return `<g id="pixel-eyes" stroke="${ink}" fill="none" stroke-width="3.3" stroke-linecap="round"><path id="pixel-eye-left" d="M347 260 Q365 247 383 262"/></g>
      ${openEye(460,256,"right",1,0)}`;
    }
    const look=expression==="curious"?[4,-2]:expression==="thinking"?[-3,-5]:expression==="eye-roll"?[-2,-9]:expression==="focused"?[0,2]:expression==="concerned"?[-2,1]:[0,0];
    return `<g id="pixel-eyes">${openEye(367,262,"left",1,look[0],look[1])}${openEye(461,256,"right",.93,look[0],look[1])}</g>`;
  }
  function openEye(cx,cy,side,scale=1,dx=0,dy=0){
    return `<g id="pixel-eye-${side}" transform="translate(${cx} ${cy}) scale(${scale})">
      <ellipse id="pixel-sclera-${side}" cx="0" cy="0" rx="19" ry="26" fill="white" stroke="${ink}" stroke-width="2.8"/>
      <g id="pixel-pupil-${side}" transform="translate(${dx} ${dy})">
        <ellipse cx="2" cy="1" rx="11.5" ry="20" fill="${ink}"/>
        <ellipse cx="-2" cy="-8" rx="4.7" ry="7.5" fill="white"/>
        <circle cx="7" cy="8" r="2.1" fill="white"/>
      </g>
      </g>`;
  }
  const mouths={
    neutral:`<path d="M400 291 Q405 297 410 291" fill="none" stroke="${ink}" stroke-width="2.4"/>`,
    happy:`<path d="M393 286 C398 289 412 289 417 285 C421 304 411 315 406 315 C397 314 391 300 393 286 Z" fill="${ink}"/><path d="M399 306 Q406 300 412 305" fill="none" stroke="${coral}" stroke-width="2"/>`,
    curious:`<ellipse cx="406" cy="298" rx="5" ry="7" fill="${ink}"/>`,
    thinking:`<path d="M400 299 Q406 295 413 299" stroke="${ink}" stroke-width="2.5" fill="none"/>`,
    mischievous:`<path d="M395 290 Q405 303 418 288" stroke="${ink}" stroke-width="2.8" fill="none"/><path d="M403 299 Q405 305 411 300" fill="${coral}"/>`,
    awake:`<ellipse cx="405" cy="300" rx="8" ry="11" fill="${ink}"/><ellipse cx="405" cy="296" rx="3" ry="4" fill="${ivory}"/>`,
    "eye-roll":`<path d="M399 301 Q408 298 417 301" stroke="${ink}" stroke-width="2.5" fill="none"/>`,
    celebrating:`<path d="M391 286 Q404 320 420 286 Q406 300 391 286Z" fill="${ink}"/><path d="M396 302 Q406 295 416 302" stroke="${coral}" stroke-width="2.5" fill="none"/>`,
    focused:`<path d="M397 298 H413" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/>`,
    concerned:`<path d="M398 302 Q405 295 414 302" stroke="${ink}" stroke-width="2.4" fill="none"/>`,
    landing:`<path d="M393 291 Q406 308 418 291" stroke="${ink}" stroke-width="2.5" fill="none"/>`,
    idle:`<path d="M398 293 Q405 300 412 293" stroke="${ink}" stroke-width="2.4" fill="none"/>`
  };
  function face(expression="happy"){
    return `<g id="pixel-face">
      <g id="pixel-brows" fill="none" stroke="${ink}" stroke-width="2.4" stroke-linecap="round">
        <path d="${expression==="concerned"?"M354 228 Q365 236 375 233":expression==="focused"?"M350 231 L377 239":"M351 234 Q360 224 371 230"}"/>
        <path d="${expression==="concerned"?"M447 230 Q460 236 470 225":expression==="focused"?"M445 237 L471 228":"M445 226 Q457 218 467 229"}"/>
      </g>
      ${eyes(expression)}
      <g id="pixel-whiskers" fill="none" stroke="${ink}" stroke-width="2.2" stroke-linecap="round">
        <path d="M310 278 L285 269 M313 287 L283 289 M496 277 L520 271 M493 287 L521 293"/>
      </g>
      <path id="pixel-nose" d="M399 283 Q405 280 411 283 Q405 289 399 283Z" fill="${ink}"/>
      <g id="pixel-mouth">${mouths[expression]||mouths.happy}</g>
      </g>`;
  }
  function wrapper(inner,title,desc,role="img"){
    return `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="520" viewBox="0 0 720 520" role="${role}" aria-labelledby="pixel-title pixel-description">
<title id="pixel-title">${xml(title)}</title><desc id="pixel-description">${xml(desc)}</desc>
${defs}
${inner}
</svg>\n`;
  }
  function rig(expression="happy",pose="neutral",opts={}){
    const outlineOnly=!!opts.outlineOnly;
    const draw=outlineOnly;
    const bodyScale=pose==="crouch"?"translate(0 73) translate(396 0) scale(1.10 .79) translate(-396 0)":pose==="jump"?"translate(0 -46) rotate(-7 396 343)":pose==="landing"?"translate(0 92) translate(396 0) scale(1.15 .72) translate(-396 0)":pose==="wave"?"rotate(-4 396 345) translate(0 -10)":pose==="thinking"?"rotate(3 396 345)":"";
    const earLeftPose=pose==="crouch"?"rotate(-12 312 177)":pose==="jump"?"rotate(-18 312 177)":pose==="wave"?"rotate(-5 312 177)":"";
    const earRightPose=pose==="crouch"?"rotate(8 414 179)":pose==="jump"?"rotate(18 414 179)":pose==="wave"?"rotate(7 414 179)":"";
    const drawP=(p,id,n,extra="")=>draw?outline(p,id,n):path(p,id,extra);
    const tail=`<g id="pixel-tail" data-rig="tail">${drawP(P.tail,"pixel-tail-contour",1)}
      ${draw?"":`<g clip-path="url(#pixel-tail-clip)"><ellipse cx="169" cy="313" rx="33" ry="47" transform="rotate(-20 169 313)" fill="${tip}"/><path d="${P.tail}" fill="url(#pixel-pencil-grain)" stroke="none"/></g>`}</g>`;
    const ears=`<g id="pixel-ear-left" data-rig="ear-left" transform="${earLeftPose}">${drawP(P.leftEar,"pixel-ear-left-contour",2)}
      ${draw?"":`<g clip-path="url(#pixel-ear-left-clip)"><ellipse cx="134" cy="185" rx="73" ry="50" transform="rotate(-13 134 185)" fill="${tip}"/><path d="${P.leftEar}" fill="url(#pixel-pencil-grain)" stroke="none"/></g>`}</g>
      <g id="pixel-ear-right" data-rig="ear-right" transform="${earRightPose}">${drawP(P.rightEar,"pixel-ear-right-contour",3)}
      ${draw?"":`<g clip-path="url(#pixel-ear-right-clip)"><ellipse cx="609" cy="61" rx="67" ry="55" transform="rotate(-22 609 61)" fill="${tip}"/><path d="${P.rightEar}" fill="url(#pixel-pencil-grain)" stroke="none"/></g>`}</g>`;
    const feet=`<g id="pixel-feet">${drawP(P.leftFoot,"pixel-foot-left",9,`fill="${tip}"`)}${drawP(P.rightFoot,"pixel-foot-right",10,`fill="${tip}"`)}</g>`;
    const paws=pose==="wave"?`<g id="pixel-paws" data-rig="paws">${drawP(P.leftPaw,"pixel-paw-left",11)}
      <g transform="rotate(-31 432 352) translate(7 -27)" data-rig="wave-paw">${drawP(P.rightPaw,"pixel-paw-right",12)}</g></g>`:`<g id="pixel-paws" data-rig="paws">${drawP(P.leftPaw,"pixel-paw-left",11)}${drawP(P.rightPaw,"pixel-paw-right",12)}</g>`;
    const tuft=draw?outline(P.tuft,"pixel-hair-tuft",7):`<path id="pixel-hair-tuft" d="${P.tuft}" fill="${ivory}" stroke="${ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
    return `<g id="pixel-character" data-pose="${pose}" data-expression="${expression}" transform="${bodyScale}">
      ${tail}
      ${drawP(P.body,"pixel-body",4,`fill="url(#pixel-soft-shade)"`)}
      ${ears}
      <g id="pixel-head" data-rig="head">
        ${drawP(P.head,"pixel-head-contour",5,`fill="url(#pixel-soft-shade)"`)}
        ${tuft}
        ${draw?"":face(expression)}
      </g>
      ${feet}
      ${paws}
      ${draw?"":`<g id="pixel-details" fill="none" stroke="${ink}" stroke-width="1.15" opacity=".28"><path d="M337 331 Q350 344 362 344 M445 334 Q459 326 467 318 M341 406 Q386 427 429 406"/></g>`}
      </g>`;
  }
  function backdrop(pose="neutral"){
    const y=pose==="jump"?457:pose==="crouch"||pose==="landing"?451:450;
    return `<ellipse id="pixel-ground-shadow" cx="393" cy="${y}" rx="${pose==="jump"?60:pose==="landing"?122:95}" ry="${pose==="jump"?6:9}" fill="${ink}" opacity="${pose==="jump"?".09":".12"}"/>`;
  }
  const output={};
  const assign=(name,content)=>{output[`${root}/${name}`]=content;};
  assign("pixel-master.svg",wrapper(`${backdrop()}${rig("happy")}`,"Pixel canonical vector master","Original chubby Pixel mascot with extended black-tipped ears, expressive eyes, graphite outlines, individual facial and body rig groups."));
  assign("pixel-static-fallback.svg",wrapper(`${backdrop()}${rig("happy")}`,"Pixel resting pose","Fully illustrated, motion-free mascot fallback for reduced motion, unsupported animation, and editorial usage."));
  assign("pixel-hero-outline.svg",wrapper(`${backdrop()}${rig("happy","neutral",{outlineOnly:true})}`,"Pixel hero pencil outline","Stroke-only canonical contours with stable pencil ordering and path lengths for the planned progressive hero drawing."));
  for(const e of ["neutral","happy","curious","thinking","mischievous","awake","eye-roll","celebrating","focused","concerned"]) {
    assign(`expressions/pixel-${e}.svg`,wrapper(`${backdrop()}${rig(e,e==="thinking"?"thinking":"neutral")}`,`Pixel expression: ${e}`,`Official Pixel character expression study: ${e}. Same canonical body and ears with independent facial vector groups.`));
  }
  const poses=[
    ["fully-drawn","happy","neutral"],
    ["anticipation-crouch","focused","crouch"],
    ["bump-up-jump","celebrating","jump"],
    ["landing-squash","landing","landing"],
    ["idle-resting","idle","neutral"],
    ["hover-wave","happy","wave"],
    ["thinking","thinking","thinking"],
    ["surprised-awake","awake","neutral"]
  ];
  for(const [name,expression,pose] of poses) {
    assign(`poses/pixel-${name}.svg`,wrapper(`${backdrop(pose)}${rig(expression,pose)}`,`Pixel pose: ${name.replaceAll("-"," ")}`,`Motion key art for Pixel: ${name.replaceAll("-"," ")}. Static vector illustration, no active animation.`));
  }
  assign("pixel-face-rig.svg",wrapper(`<g id="pixel-head-isolation">${path(P.head,"pixel-head-contour",`fill="url(#pixel-soft-shade)"`)}${face("happy")}</g>`,
    "Pixel facial rig reference","Individual vector elements named for both eyes, separate pupils, mouth, brows, whiskers and nose. This is a source illustration, not a functional animation."));
  // The canonical reference's laptop is an optional prop, never baked into the character rig.
  const laptop=`<g id="pixel-laptop-prop" stroke="${ink}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">
    <path d="M458 400 L489 257 Q492 247 505 247 L651 246 Q661 247 659 260 L632 399 Z" fill="#f5f4f0"/>
    <path d="M480 389 L502 270 L641 269 L619 389 Z" fill="#fafaf8" stroke-width="1.5"/>
    <g stroke="#858282" stroke-width="6"><path d="M515 294 H571 M511 319 H611 M505 333 H599 M502 347 H591"/></g>
    <path d="M446 400 H634 L662 431 H469Z" fill="#e2e0da"/>
    <path d="M484 411 H613 L602 422 H474Z" fill="#c6c4bf" stroke-width="1.2"/>
    </g>`;
  assign("pixel-laptop-companion.svg",wrapper(`${backdrop()}${rig("happy")}${laptop}`,"Pixel at a laptop","Optional original-reference-inspired prop scene; the underlying character body remains independently editable."));
  const manifest={version:"phase-a2",status:"artwork-only",canonicalReference:"/brand/mascots/creators-mascot-working-laptop-queued-laptop-float.svg",sourceOfTruth:"/brand/pixel/pixel-master.svg",license:"Creators first-party brand media",assetType:"vector-only SVG, no embedded raster, no external resources",master:"pixel-master.svg",staticFallback:"pixel-static-fallback.svg",heroOutline:"pixel-hero-outline.svg",facialRig:"pixel-face-rig.svg",expressionIds:["neutral","happy","curious","thinking","mischievous","awake","eye-roll","celebrating","focused","concerned"],poseIds:poses.map(x=>x[0]),notes:"Artwork preparation only; do not activate character animation or replace current logo/mascots until separately approved."};
  assign("manifest.json",JSON.stringify(manifest,null,2)+"\n");
  return output;
};
const assets=buildPixelAssets();
const command=process.argv[2];
if(command!=="--write" && command!=="--check") { console.error("Usage: node apps/web/scripts/build-pixel-phase-a2.mjs --check|--write"); process.exitCode=2; }
else {
 let problems=0;
 for(const [path,expected] of Object.entries(assets)){
  const absolute=resolve(repoRoot,path);
  if(command==="--write"){ await mkdir(dirname(absolute),{recursive:true}); await writeFile(absolute,expected,"utf8"); }
  else { const actual=await readFile(absolute,"utf8").catch(()=>null); if(actual!==expected) { console.error("Out of date: "+path); problems++; } }
 }
 if(problems) process.exitCode=1;
 else console.log((command==="--write"?"Wrote ":"Verified ")+Object.keys(assets).length+" Pixel Phase A2 artwork files");
}
