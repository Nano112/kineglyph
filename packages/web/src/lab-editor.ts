import { Compartment, EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { basicSetup, EditorView } from "codemirror";
import { tags } from "@lezer/highlight";

export interface LabEditor {
  value(): string;
  setValue(source: string): void;
  setReadOnly(readOnly: boolean): void;
  focus(): void;
  destroy(): void;
}

export interface CreateLabEditorOptions {
  readonly parent: HTMLElement;
  readonly source: string;
  readonly readOnly: boolean;
  readonly onChange: (source: string) => void;
  readonly onRun: () => void;
}

/** The editor is a separate module so a page that only previews examples never downloads it. */
export function createLabEditor(options: CreateLabEditorOptions): LabEditor {
  const editable = new Compartment();
  const readOnly = new Compartment();
  let applying = false;
  const view = new EditorView({
    parent: options.parent,
    state: EditorState.create({
      doc: options.source,
      extensions: [
        basicSetup,
        javascript({ typescript: false }),
        syntaxHighlighting(
          HighlightStyle.define([
            {
              tag: [tags.keyword, tags.operatorKeyword, tags.modifier],
              color: "var(--kg-lab-syntax-keyword)",
            },
            { tag: [tags.string, tags.special(tags.string)], color: "var(--kg-lab-syntax-string)" },
            { tag: [tags.number, tags.bool, tags.null], color: "var(--kg-lab-syntax-number)" },
            {
              tag: [tags.comment, tags.lineComment, tags.blockComment],
              color: "var(--kg-lab-syntax-comment)",
              fontStyle: "italic",
            },
            {
              tag: [tags.definition(tags.variableName), tags.function(tags.variableName)],
              color: "var(--kg-lab-syntax-name)",
            },
            {
              tag: [tags.propertyName, tags.typeName, tags.className],
              color: "var(--kg-lab-syntax-property)",
            },
          ]),
        ),
        editable.of(EditorView.editable.of(!options.readOnly)),
        readOnly.of(EditorState.readOnly.of(options.readOnly)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !applying) options.onChange(update.state.doc.toString());
        }),
        EditorView.domEventHandlers({
          keydown(event) {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              options.onRun();
              return true;
            }
            return false;
          },
        }),
        EditorView.theme({
          "&": {
            height: "100%",
            color: "var(--kg-lab-code-text)",
            backgroundColor: "var(--kg-lab-code-bg)",
            fontSize: "13px",
          },
          ".cm-scroller": {
            overflow: "auto",
            fontFamily: "var(--kg-lab-mono)",
            lineHeight: "1.58",
          },
          ".cm-content": { padding: "16px 0 28px" },
          ".cm-gutters": {
            color: "var(--kg-lab-muted)",
            backgroundColor: "var(--kg-lab-code-bg)",
            border: "0",
          },
          ".cm-activeLine, .cm-activeLineGutter": {
            backgroundColor: "color-mix(in srgb, var(--kg-lab-accent) 8%, transparent)",
          },
          ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": {
            backgroundColor: "color-mix(in srgb, var(--kg-lab-accent) 28%, transparent) !important",
          },
          ".cm-cursor": { borderLeftColor: "var(--kg-lab-accent)" },
          "&.cm-focused": { outline: "none" },
        }),
      ],
    }),
  });

  return {
    value: () => view.state.doc.toString(),
    setValue(source) {
      if (source === view.state.doc.toString()) return;
      applying = true;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: source } });
      applying = false;
    },
    setReadOnly(value) {
      view.dispatch({
        effects: [
          editable.reconfigure(EditorView.editable.of(!value)),
          readOnly.reconfigure(EditorState.readOnly.of(value)),
        ],
      });
    },
    focus: () => view.focus(),
    destroy: () => view.destroy(),
  };
}
