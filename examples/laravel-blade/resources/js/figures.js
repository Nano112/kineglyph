import { createTheme, figure } from "@kineglyph/core";

export const docsTheme = createTheme({
  name: "docs",
  colors: { accent: "#237f74", info: "#6475b7" },
});

export const requestPathScene = figure("request-path", { title: "Request path" }, (f) => {
  const request = f.card({ title: "Request", motif: "input", tone: "info" });
  const handler = f.card({ title: "Handler", motif: "gear" });
  const response = f.card({ title: "Response", motif: "output", tone: "success" });
  const incoming = f.connect(request, handler, { head: "arrow" });
  const outgoing = f.connect(handler, response, { head: "arrow" });
  f.root(f.flow([request, handler, response]));
  f.sequence([
    f.reveal(request),
    f.draw(incoming),
    f.reveal(handler),
    f.draw(outgoing),
    f.reveal(response),
  ]);
});

export const scenes = { "request-path": requestPathScene };
export const themes = { docs: docsTheme };
