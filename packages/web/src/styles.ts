/** Shell styles shared by every mounted figure. Injected once per document. */
export const STYLE_ID = "kineglyph-web-styles";

export const FIGURE_STYLES = `
.kg-figure{box-sizing:border-box;position:relative;overflow:hidden;border:1px solid var(--kg-shell-border);border-radius:var(--kg-shell-radius);background:var(--kg-shell-background);color:var(--kg-shell-text);font-family:var(--kg-shell-font);box-shadow:0 24px 80px color-mix(in srgb,var(--kg-shell-background),transparent 25%)}
.kg-figure *{box-sizing:border-box}
.kg-figure__stage{width:100%;min-height:120px;background:var(--kg-shell-background);overflow:hidden}
.kg-figure__stage svg{display:block;width:100%;height:auto;overflow:visible}
.kg-figure__stage [data-node-id]{transition:filter 160ms ease}
.kg-figure__stage [data-node-id][data-inspected=true]>.kg-node-shape,.kg-figure__stage [data-node-id][data-selected=true]>.kg-node-shape{stroke:var(--kg-shell-accent);stroke-width:2;filter:drop-shadow(0 0 10px color-mix(in srgb,var(--kg-shell-accent),transparent 62%))}
.kg-figure__stage .kg-node--interactive:hover>.kg-node-shape{stroke:var(--kg-shell-accent)}
.kg-figure__stage .kg-node--interactive:focus-visible>.kg-node-shape{stroke:var(--kg-shell-accent);stroke-width:2.5}
.kg-figure__stage .kg-edge-group[role=img]:hover .kg-edge{filter:brightness(1.25)}
.kg-figure__readout{display:grid;grid-template-columns:minmax(110px,.4fr) minmax(140px,.7fr) minmax(220px,1.5fr);gap:16px;align-items:baseline;min-height:64px;padding:16px 22px;border-top:1px solid var(--kg-shell-border);background:var(--kg-shell-surface)}
.kg-figure__readout strong{font-size:15px}.kg-figure__readout>span:last-child{color:var(--kg-shell-muted);font-size:13px;line-height:1.45}
.kg-figure__fields{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;margin:8px 0 0;font-size:12px}
.kg-figure__fields dt{color:var(--kg-shell-muted);font-weight:600}
.kg-figure__fields dd{margin:0;color:var(--kg-shell-text);font-variant-numeric:tabular-nums}
.kg-figure__eyebrow{text-transform:uppercase;letter-spacing:.13em;color:var(--kg-shell-accent);font-size:10px;font-weight:700}
.kg-figure__machine{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:12px 16px 4px;border-top:1px solid var(--kg-shell-border);background:color-mix(in srgb,var(--kg-shell-surface),var(--kg-shell-background) 28%)}
.kg-figure__machine-group{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-right:12px}
.kg-figure__machine-label{color:var(--kg-shell-muted);font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-right:4px}
.kg-figure__controls{display:flex;align-items:center;gap:10px;padding:12px 16px;border-top:1px solid var(--kg-shell-border);background:color-mix(in srgb,var(--kg-shell-surface),var(--kg-shell-background) 28%)}
.kg-figure__machine+.kg-figure__controls{border-top:none;padding-top:8px}
.kg-figure button{appearance:none;border:1px solid var(--kg-shell-border);border-radius:7px;padding:8px 12px;background:var(--kg-shell-surface);color:var(--kg-shell-text);font:600 12px/1 var(--kg-shell-font);cursor:pointer}
.kg-figure button:hover:not(:disabled),.kg-figure button:focus-visible{border-color:var(--kg-shell-accent);outline:none}
.kg-figure button:focus-visible{box-shadow:0 0 0 3px color-mix(in srgb,var(--kg-shell-accent),transparent 65%)}
.kg-figure button:disabled{opacity:.42;cursor:not-allowed}
.kg-figure button[aria-pressed=true]{border-color:var(--kg-shell-accent);background:color-mix(in srgb,var(--kg-shell-accent),var(--kg-shell-surface) 82%);color:var(--kg-shell-text)}
.kg-figure__scrubber{display:flex;align-items:center;gap:10px;flex:1;min-width:160px;color:var(--kg-shell-muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}
.kg-figure__scrubber input{width:100%;accent-color:var(--kg-shell-accent)}
.kg-figure__controls output{min-width:48px;text-align:right;color:var(--kg-shell-muted);font-variant-numeric:tabular-nums;font-size:12px}
.kg-figure--compact .kg-figure__readout{grid-template-columns:1fr;gap:5px;min-height:96px}
.kg-figure--compact .kg-figure__controls{flex-wrap:wrap}
.kg-figure--compact .kg-figure__scrubber{order:3;flex-basis:100%}
.kg-figure__live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media(prefers-reduced-motion:reduce){.kg-figure__stage [data-node-id]{transition:none}}
`;

/** Ensures the shared stylesheet exists in the document that owns `element`. */
export function ensureStyles(element: Element): void {
  const doc = element.ownerDocument;
  if (doc.getElementById(STYLE_ID) !== null) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = FIGURE_STYLES;
  (doc.head ?? doc.documentElement).append(style);
}
