import{c as t}from"./createLucideIcon-D6RrlnQg.js";import{r as d,j as e}from"./index-D7FZvmqO.js";import{I as x,X as h}from"./ConfirmDialog-DuMoDpm1.js";/**
 * @license lucide-react v0.511.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const u=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["line",{x1:"12",x2:"12",y1:"8",y2:"12",key:"1pkeuh"}],["line",{x1:"12",x2:"12.01",y1:"16",y2:"16",key:"4dfq90"}]],y=t("circle-alert",u);/**
 * @license lucide-react v0.511.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]],f=t("circle-check",k);/**
 * @license lucide-react v0.511.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p=[["path",{d:"M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z",key:"vktsd0"}],["circle",{cx:"7.5",cy:"7.5",r:".5",fill:"currentColor",key:"kqv944"}]],j=t("tag",p),a={success:{icon:f,className:"border-emerald-200 bg-emerald-50 text-emerald-800"},error:{icon:y,className:"border-red-200 bg-red-50 text-red-800"}},b=({open:c,message:i,severity:n="success",onClose:s,duration:r=4e3})=>{if(d.useEffect(()=>{if(!c||!r)return;const m=setTimeout(s,r);return()=>clearTimeout(m)},[c,r,s]),!c||!i)return null;const l=a[n]||a.success,o=l.icon;return e.jsx("div",{className:"pointer-events-none fixed right-3 top-16 z-[70] flex w-[min(24rem,calc(100vw-1.5rem))] justify-end sm:right-4",children:e.jsxs("div",{className:`pointer-events-auto flex min-h-12 w-full items-center gap-3 rounded-2xl border px-3 py-2.5 shadow-xl ${l.className}`,children:[e.jsx(o,{className:"h-5 w-5 shrink-0"}),e.jsx("p",{className:"min-w-0 flex-1 text-sm leading-5",children:i}),e.jsx(x,{label:"Dismiss",size:"sm",className:"shrink-0 hover:bg-black/5",onClick:s,children:e.jsx(h,{className:"h-4 w-4"})})]})})};export{b as T,j as a};
