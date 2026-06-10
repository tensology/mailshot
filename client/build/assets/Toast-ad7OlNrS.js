import{r as x,j as e}from"./index-3pDVX7Pt.js";import{I as d,X as u}from"./Dialog-v4h2OtyG.js";import{c as i}from"./createLucideIcon-B_kfrW0B.js";/**
 * @license lucide-react v0.511.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const y=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["line",{x1:"12",x2:"12",y1:"8",y2:"12",key:"1pkeuh"}],["line",{x1:"12",x2:"12.01",y1:"16",y2:"16",key:"4dfq90"}]],f=i("circle-alert",y);/**
 * @license lucide-react v0.511.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const h=[["circle",{cx:"12",cy:"12",r:"10",key:"1mglay"}],["path",{d:"m9 12 2 2 4-4",key:"dzmm74"}]],p=i("circle-check",h),a={success:{icon:p,className:"border-emerald-200 bg-emerald-50 text-emerald-800"},error:{icon:f,className:"border-red-200 bg-red-50 text-red-800"}},j=({open:s,message:t,severity:l="success",onClose:c,duration:r=4e3})=>{if(x.useEffect(()=>{if(!s||!r)return;const m=setTimeout(c,r);return()=>clearTimeout(m)},[s,r,c]),!s||!t)return null;const o=a[l]||a.success,n=o.icon;return e.jsx("div",{className:"pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex justify-center px-4 safe-bottom",children:e.jsxs("div",{className:`pointer-events-auto flex max-w-md items-start gap-3 rounded-2xl border px-4 py-3 shadow-lg ${o.className}`,children:[e.jsx(n,{className:"mt-0.5 h-5 w-5 shrink-0"}),e.jsx("p",{className:"flex-1 text-sm",children:t}),e.jsx(d,{label:"Dismiss",size:"sm",className:"hover:bg-black/5",onClick:c,children:e.jsx(u,{className:"h-4 w-4"})})]})})};export{j as T};
