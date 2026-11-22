(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const captionOf = (p) => [p.caption || "", Array.isArray(p.hashtags) ? p.hashtags.join(" ") : (p.hashtags || "")].filter(Boolean).join("\n\n").trim();
  const scheduled = (p) => p.scheduled_at ? new Date(p.scheduled_at) : null;
  const classify = (p) => p.status === "published" ? "published" : (scheduled(p) && scheduled(p) <= new Date() ? "due" : "upcoming");
  const fmt = (date) => date ? date.toLocaleString([], { dateStyle:"medium", timeStyle:"short" }) : "No schedule";
  const css = `
    #pp-publish-overlay{position:fixed;inset:0;z-index:10000;background:rgba(12,16,25,.62);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:20px}
    #pp-publish-overlay[hidden]{display:none}
    #pp-publish-panel{width:min(1100px,96vw);max-height:92vh;overflow:auto;background:var(--surface,#fff);color:var(--text,#17191c);border-radius:22px;padding:26px;box-shadow:0 30px 100px #0004}
    #pp-publish-panel .ppp-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}
    #pp-publish-panel h2{margin:0 0 6px;font-size:26px}
    #pp-publish-panel p{margin:0;color:var(--muted,#747984)}
    #pp-publish-panel .ppp-close{border:0;background:transparent;font-size:28px;cursor:pointer;color:inherit}
    #pp-publish-panel .ppp-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}
    #pp-publish-panel .ppp-tab{border:1px solid #d9dce2;background:transparent;border-radius:999px;padding:9px 14px;cursor:pointer;color:inherit}
    #pp-publish-panel .ppp-tab.active{background:#202a3a;color:white;border-color:#202a3a}
    #pp-publish-panel .ppp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:14px}
    #pp-publish-panel .ppp-card{border:1px solid #e3e5e9;border-radius:16px;padding:14px;display:flex;flex-direction:column;gap:12px}
    #pp-publish-panel .ppp-card h3{font-size:16px;margin:0}
    #pp-publish-panel .ppp-meta{font-size:12px;color:var(--muted,#747984)}
    #pp-publish-panel .ppp-badge{font-size:11px;font-weight:700;border-radius:999px;padding:5px 9px;background:#eef1f5;align-self:flex-start}
    #pp-publish-panel .ppp-badge.due{background:#fff1d6;color:#805400}
    #pp-publish-panel .ppp-badge.published{background:#dff5e8;color:#16653c}
    #pp-publish-panel .ppp-preview{width:100%;max-height:240px;object-fit:contain;background:#f5f6f8;border-radius:12px}
    #pp-publish-panel .ppp-caption{white-space:pre-wrap;max-height:130px;overflow:auto;font-size:13px;line-height:1.5}
    #pp-publish-panel .ppp-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:auto}
    #pp-publish-panel .ppp-actions button{border:1px solid #d9dce2;background:transparent;border-radius:9px;padding:8px 10px;cursor:pointer;color:inherit}
    #pp-publish-panel .ppp-actions button.primary{background:#202a3a;color:white;border-color:#202a3a}
    #pp-publish-panel .ppp-actions button:disabled{opacity:.55;cursor:wait}
    #pp-publish-panel .ppp-empty{padding:36px 12px;text-align:center;color:var(--muted,#747984)}
    @media(max-width:600px){#pp-publish-overlay{padding:8px}#pp-publish-panel{padding:16px;width:100%;max-height:96vh;border-radius:16px}}
  `;
  const style = document.createElement("style"); style.textContent = css; document.head.appendChild(style);
  const nav = document.querySelector(".main-nav");
  if (nav && !document.querySelector("#pp-publish-center-nav")) {
    const btn=document.createElement("button"); btn.type="button"; btn.id="pp-publish-center-nav"; btn.className="nav-item";
    btn.innerHTML='<i data-lucide="send"></i><span>Publish Center</span>';
    nav.insertBefore(btn, nav.querySelector('[data-view="analytics"]') || null);
    if(window.lucide)window.lucide.createIcons();
  }
  const overlay=document.createElement("div");overlay.id="pp-publish-overlay";overlay.hidden=true;
  overlay.innerHTML='<section id="pp-publish-panel" role="dialog" aria-modal="true" aria-labelledby="pp-publish-title"><div class="ppp-head"><div><h2 id="pp-publish-title">Publish Center</h2><p>Everything prepared. Publish manually in Instagram, then confirm here.</p></div><button class="ppp-close" id="ppp-close" aria-label="Close">×</button></div><div id="ppp-tabs" class="ppp-tabs"></div><div id="ppp-grid" class="ppp-grid"><div class="ppp-empty">Loading scheduled posts…</div></div></section>';
  document.body.appendChild(overlay);
  const grid=overlay.querySelector("#ppp-grid"), tabs=overlay.querySelector("#ppp-tabs");
  let posts=[], filter="all", busy=false;
  const filterLabels=[["all","All"],["due","Ready to publish"],["upcoming","Upcoming"],["published","Published"]];
  const refresh=async()=>{const api=window.postpilotWorkspace;if(!api?.getManualPublishPosts){grid.innerHTML='<div class="ppp-empty">Publish Center is available after signing in.</div>';return;}posts=await api.getManualPublishPosts();render();};
  const render=()=>{
    tabs.innerHTML=filterLabels.map(([key,label])=>'<button class="ppp-tab '+(filter===key?'active':'')+'" data-filter="'+key+'">'+label+'</button>').join("");
    const list=posts.filter(p=>filter==="all"||classify(p)===filter);
    if(!list.length){grid.innerHTML='<div class="ppp-empty">Nothing in this view yet.</div>';return;}
    grid.innerHTML=list.map(p=>{
      const status=classify(p),media=p.media_url;
      const mediaMarkup=media?(/video/i.test(p.content_type||"")?'<video class="ppp-preview" controls src="'+esc(media)+'"></video>':'<img class="ppp-preview" src="'+esc(media)+'" alt="Post media" loading="lazy">'):'';
      const caption=captionOf(p);
      return '<article class="ppp-card" data-post="'+esc(p.id)+'">'+mediaMarkup+'<span class="ppp-badge '+status+'">'+(status==="due"?"Ready to publish":status==="published"?"Published":"Upcoming")+'</span><h3>'+esc(p.title||"Instagram post")+'</h3><div class="ppp-meta">'+esc(fmt(scheduled(p)))+'</div><div class="ppp-caption">'+esc(caption||"No caption saved.")+'</div><div class="ppp-actions">'+(caption?'<button data-copy="'+esc(p.id)+'">Copy caption</button>':'')+(media?'<button data-media="'+esc(p.id)+'">Open media</button>':'')+'<button data-instagram="'+esc(p.id)+'">Open Instagram</button>'+(status!=="published"?'<button class="primary" data-confirm="'+esc(p.id)+'">Confirm published</button>':'')+'</div></article>';
    }).join("");
  };
  const open=async()=>{overlay.hidden=false;grid.innerHTML='<div class="ppp-empty">Loading scheduled posts…</div>';try{await refresh();}catch(e){grid.innerHTML='<div class="ppp-empty">'+esc(e.message||"Could not load Publish Center.")+'</div>';}};
  document.querySelector("#pp-publish-center-nav")?.addEventListener("click",open);
  overlay.querySelector("#ppp-close").addEventListener("click",()=>overlay.hidden=true);
  overlay.addEventListener("click",e=>{if(e.target===overlay)overlay.hidden=true;});
  document.addEventListener("keydown",e=>{if(e.key==="Escape"&&!overlay.hidden)overlay.hidden=true;});
  tabs.addEventListener("click",e=>{const t=e.target.closest("[data-filter]");if(!t)return;filter=t.dataset.filter;render();});
  grid.addEventListener("click",async e=>{
    const b=e.target.closest("button");if(!b)return;const p=posts.find(x=>x.id===b.dataset.copy||x.id===b.dataset.media||x.id===b.dataset.instagram||x.id===b.dataset.confirm);if(!p)return;
    if(b.dataset.copy){const text=captionOf(p);try{if(navigator.clipboard&&window.isSecureContext)await navigator.clipboard.writeText(text);else throw new Error("Clipboard unavailable");b.textContent="Copied!";setTimeout(()=>b.textContent="Copy caption",1400);}catch(_){const area=document.createElement("textarea");area.value=text;area.style.position="fixed";area.style.opacity="0";document.body.appendChild(area);area.focus();area.select();const ok=document.execCommand("copy");area.remove();if(ok){b.textContent="Copied!";setTimeout(()=>b.textContent="Copy caption",1400);}else alert("Copy failed. Caption is shown on the card so you can select it manually.");}}
    if(b.dataset.media){if(p.media_url){b.disabled=true;const original=b.textContent;b.textContent="Downloading…";try{const response=await fetch(p.media_url);if(!response.ok)throw new Error("Media request failed");const blob=await response.blob();const ext=(p.content_type||"").toLowerCase().includes("video")?".mp4":".jpg";const fileName=(p.title||"postpilot-media").replace(/[^a-z0-9-_]+/gi,"-").replace(/^-|-$/g,"")+ext;const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=fileName;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);b.textContent="Downloaded";}catch(err){window.open(p.media_url,"_blank","noopener");b.textContent="Open media";alert("Direct download was blocked by the media host. The media has been opened in a new tab; use Save/Download there.");}finally{b.disabled=false;setTimeout(()=>{if(b.isConnected)b.textContent=original;},1800);}}}
    if(b.dataset.instagram){window.open("https://www.instagram.com/","_blank","noopener");}
    if(b.dataset.confirm){if(!confirm("Confirm that you have published this post in Instagram?"))return;b.disabled=true;b.textContent="Saving…";try{await window.postpilotWorkspace.markManualPublished(p.id);await window.postpilotWorkspace.refreshPosts();await refresh();}catch(err){alert(err.message||"Could not update published status.");b.disabled=false;b.textContent="Confirm published";}}
  });
  document.addEventListener("postpilot:auth-ready",()=>{if(!overlay.hidden)refresh().catch(()=>{});});
})();