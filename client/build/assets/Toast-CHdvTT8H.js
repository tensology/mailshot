import{c as t}from"./createLucideIcon-DVRGzM2n.js";import{r as x,j as e}from"./index-DLFrc0fR.js";import{I as d,X as y}from"./Dialog-ODM6kS5I.js";/**
 * @license lucide-react v0.511.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const u=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["line",{x1:"12",x2:"12",y1:"8",y2:"12",key:"1pkeuh"}],["line",{x1:"12",x2:"12.01",y1:"16",y2:"16",key:"4dfq90"}]],f=t("circle-alert",u);/**
 * @license lucide-react v0.511.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const k=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]],h=t("circle-check",k);/**
 * @license lucide-react v0.511.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const p=[["path",{d:"M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z",key:"vktsd0"}],["circle",{cx:"7.5",cy:"7.5",r:".5",fill:"currentColor",key:"kqv944"}]],v=t("tag",p),l={success:{icon:h,className:"border-emerald-200 bg-emerald-50 text-emerald-800"},error:{icon:f,className:"border-red-200 bg-red-50 text-red-800"}},g=({open:c,message:o,severity:i="success",onClose:s,duration:r=4e3})=>{if(x.useEffect(()=>{if(!c||!r)return;const m=setTimeout(s,r);return()=>clearTimeout(m)},[c,r,s]),!c||!o)return null;const a=l[i]||l.success,n=a.icon;return e.jsx("div",{className:"pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex justify-center px-4 safe-bottom",children:e.jsxs("div",{className:`pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg ${a.className}`,children:[e.jsx(n,{className:"mt-0.5 h-5 w-5 shrink-0"}),e.jsx("p",{className:"flex-1 text-sm",children:o}),e.jsx(d,{label:"Dismiss",size:"sm",className:"hover:bg-black/5",onClick:s,children:e.jsx(y,{className:"h-4 w-4"})})]})})};export{v as T,g as a};
