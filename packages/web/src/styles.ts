/** Shell styles shared by every mounted figure. Injected once per document. */
export const STYLE_ID = "kineglyph-web-styles";

export const FIGURE_STYLES = `
.kg-figure{box-sizing:border-box;position:relative;overflow:hidden;border:1px solid var(--kg-shell-border);border-radius:var(--kg-shell-radius);background:var(--kg-shell-background);color:var(--kg-shell-text);font-family:var(--kg-shell-font)}
.kg-figure *{box-sizing:border-box}
.kg-figure__stage{position:relative;width:100%;min-height:120px;background:var(--kg-shell-background);overflow:hidden}
.kg-figure__stage svg{display:block;width:100%;height:auto;overflow:visible}
.kg-figure__stage [data-node-id]{transition:filter 160ms ease}
.kg-figure__stage [data-node-id][data-inspected=true]>.kg-node-shape,.kg-figure__stage [data-node-id][data-selected=true]>.kg-node-shape{stroke:var(--kg-shell-accent);stroke-width:2}
.kg-figure__stage .kg-node--interactive:hover>.kg-node-shape{stroke:var(--kg-shell-accent)}
.kg-figure__stage .kg-node--interactive:focus-visible>.kg-node-shape{stroke:var(--kg-shell-accent);stroke-width:2.5}
.kg-figure__stage .kg-edge-group[role=img]:hover .kg-edge{filter:brightness(1.25)}
.kg-figure__readout{display:grid;grid-template-columns:minmax(110px,.4fr) minmax(140px,.7fr) minmax(220px,1.5fr);gap:16px;align-items:baseline;min-height:64px;padding:16px 22px;border-top:1px solid var(--kg-shell-border);background:var(--kg-shell-surface)}
.kg-figure__readout strong{font-size:15px}.kg-figure__body{color:var(--kg-shell-muted);font-size:13px;line-height:1.45}
.kg-figure__fields{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;margin:8px 0 0;font-size:12px}
.kg-figure__fields dt{color:var(--kg-shell-muted);font-weight:600}
.kg-figure__fields dd{margin:0;color:var(--kg-shell-text);font-variant-numeric:tabular-nums}
.kg-figure__eyebrow{text-transform:uppercase;letter-spacing:.13em;color:var(--kg-shell-accent);font-size:10px;font-weight:700}
.kg-figure__machine{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:12px 16px;border-top:1px solid var(--kg-shell-border);background:var(--kg-shell-surface)}
.kg-figure__machine-group{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-right:12px}
.kg-figure__machine-label{color:var(--kg-shell-muted);font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;margin-right:4px}
.kg-figure__controls{display:flex;align-items:center;gap:10px;padding:12px 16px;border-top:1px solid var(--kg-shell-border);background:var(--kg-shell-surface)}
.kg-figure__machine+.kg-figure__controls{border-top:none;padding-top:8px}
.kg-figure button{appearance:none;border:1px solid var(--kg-shell-border);border-radius:4px;padding:8px 12px;background:var(--kg-shell-background);color:var(--kg-shell-text);font:600 12px/1 var(--kg-shell-font);cursor:pointer}
.kg-figure button:hover:not(:disabled),.kg-figure button:focus-visible{border-color:var(--kg-shell-accent);outline:none}
.kg-figure button:focus-visible{box-shadow:0 0 0 2px color-mix(in srgb,var(--kg-shell-accent),transparent 70%)}
.kg-figure button:disabled{opacity:.42;cursor:not-allowed}
.kg-figure button[aria-pressed=true]{border-color:var(--kg-shell-accent);background:color-mix(in srgb,var(--kg-shell-accent),var(--kg-shell-background) 84%);color:var(--kg-shell-text)}
.kg-figure__scrubber{display:flex;align-items:center;gap:10px;flex:1;min-width:160px;color:var(--kg-shell-muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}
.kg-figure__scrubber input{width:100%;accent-color:var(--kg-shell-accent)}
.kg-figure__controls output{min-width:48px;text-align:right;color:var(--kg-shell-muted);font-variant-numeric:tabular-nums;font-size:12px}
.kg-figure--compact .kg-figure__readout{grid-template-columns:1fr;gap:5px;min-height:96px}
.kg-figure--compact .kg-figure__controls{flex-wrap:wrap}
.kg-figure--compact .kg-figure__scrubber{order:3;flex-basis:100%}
.kg-live-surface{position:absolute;z-index:3;overflow:hidden;transform-origin:center;opacity:0;background:transparent}
.kg-live-surface>canvas,.kg-live-surface>iframe,.kg-live-surface>model-viewer{display:block;width:100%;height:100%;border:0}
.kg-parameter-panel{position:absolute;z-index:4;left:12px;right:12px;bottom:12px;display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:20px;padding:11px 13px 12px;border:1px solid var(--kg-shell-border);border-radius:8px;background:color-mix(in srgb,var(--kg-shell-surface) 90%,transparent);backdrop-filter:blur(14px)}
.kg-parameter{display:block;min-width:0}.kg-parameter__heading{display:flex;align-items:baseline;justify-content:space-between;gap:10px;color:var(--kg-shell-muted);font:700 10px/1 var(--kg-shell-font);letter-spacing:.08em;text-transform:uppercase}.kg-parameter output{color:var(--kg-shell-text);font-variant-numeric:tabular-nums}.kg-parameter input[type=range]{display:block;width:100%;height:24px;margin:7px 0 0;padding:0;appearance:none;background:transparent;cursor:ew-resize}.kg-parameter input[type=range]::-webkit-slider-runnable-track{height:5px;border:1px solid var(--kg-shell-border);border-radius:999px;background:color-mix(in srgb,var(--kg-shell-accent) 34%,var(--kg-shell-background))}.kg-parameter input[type=range]::-webkit-slider-thumb{width:20px;height:20px;margin-top:-8px;appearance:none;border:2px solid var(--kg-shell-surface);border-radius:50%;background:var(--kg-shell-accent);box-shadow:0 1px 4px color-mix(in srgb,var(--kg-shell-text) 28%,transparent)}.kg-parameter input[type=range]::-moz-range-track{height:5px;border:1px solid var(--kg-shell-border);border-radius:999px;background:color-mix(in srgb,var(--kg-shell-accent) 34%,var(--kg-shell-background))}.kg-parameter input[type=range]::-moz-range-thumb{width:18px;height:18px;border:2px solid var(--kg-shell-surface);border-radius:50%;background:var(--kg-shell-accent);box-shadow:0 1px 4px color-mix(in srgb,var(--kg-shell-text) 28%,transparent)}.kg-parameter input[type=range]:focus-visible{outline:none}.kg-parameter input[type=range]:focus-visible::-webkit-slider-thumb{box-shadow:0 0 0 4px color-mix(in srgb,var(--kg-shell-accent) 28%,transparent)}
.kg-figure .kg-code-drawer{position:absolute;z-index:5;top:12px;right:12px;margin:0;padding:0;border:0;background:transparent;box-shadow:none;color:var(--kg-shell-text);font-family:var(--kg-shell-font)}.kg-figure .kg-code-drawer>summary{display:block;width:max-content;min-width:58px;margin:0 0 0 auto;padding:8px 11px;border:1px solid var(--kg-shell-border);border-radius:6px;background:color-mix(in srgb,var(--kg-shell-surface) 92%,transparent);color:var(--kg-shell-text);cursor:pointer;font:700 11px/1 var(--kg-shell-font);text-align:center;list-style:none;backdrop-filter:blur(12px)}.kg-figure .kg-code-drawer>summary::-webkit-details-marker,.kg-figure .kg-code-drawer>summary::before,.kg-figure .kg-code-drawer>summary::after{display:none!important;content:none!important}.kg-figure .kg-code-drawer[open]{left:12px;bottom:12px}.kg-figure .kg-code-drawer[open]>summary{position:relative;z-index:2}.kg-figure .kg-code-drawer__body{position:absolute;top:40px;right:0;bottom:0;display:flex;min-height:0;width:min(560px,100%);flex-direction:column;overflow:hidden;border:1px solid var(--kg-shell-border);border-radius:8px;background:var(--kg-shell-background);box-shadow:0 14px 40px color-mix(in srgb,var(--kg-shell-text) 18%,transparent)}.kg-figure .kg-code-drawer__tabs{display:flex;gap:4px;padding:8px;border-bottom:1px solid var(--kg-shell-border);background:var(--kg-shell-surface)}.kg-figure .kg-code-drawer__tabs button{padding:7px 10px;border:1px solid transparent;background:transparent;color:var(--kg-shell-muted)}.kg-figure .kg-code-drawer__tabs button[aria-selected=true]{border-color:var(--kg-shell-accent);background:color-mix(in srgb,var(--kg-shell-accent),var(--kg-shell-background) 86%);color:var(--kg-shell-text)}.kg-figure .kg-code-drawer pre{flex:1;min-height:0;margin:0;padding:14px;overflow:auto;color:var(--kg-shell-text);background:var(--kg-shell-background);font:12px/1.55 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre}.kg-figure .kg-code-drawer code{display:block;padding:0!important;background:transparent!important;color:inherit!important;font:inherit}
.kg-figure__live{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media(max-width:520px){.kg-parameter-panel{left:8px;right:8px;bottom:8px;gap:12px;padding:9px 11px}.kg-figure .kg-code-drawer{top:8px;right:8px}.kg-figure .kg-code-drawer[open]{left:8px;bottom:8px}.kg-figure .kg-code-drawer pre{font-size:11px}}
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
