import DOMPurify from "dompurify";
import { marked } from "marked";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  PobNotesAction,
  PobNotesSnapshot,
} from "@poe2-launcher/shared/types";

import {
  applyTemplateVariables,
  extractTemplateVariables,
  getAllNoteTemplates,
  type NoteTemplate,
} from "./noteTemplates";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; snapshot: PobNotesSnapshot }
  | { status: "error"; reason: string };

interface NotesViewProps {
  active: boolean;
  buildName: string;
  onMutated?: () => void;
}

type NotesMode = "edit" | "preview";

type PendingTemplate = {
  template: NoteTemplate;
  variables: string[];
  values: Record<string, string>;
} | null;

const textEncoder = new TextEncoder();

const toUtf8ByteOffset = (value: string, offset: number): number =>
  textEncoder.encode(value.slice(0, offset)).length;

export function NotesView({ active, buildName, onMutated }: NotesViewProps) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const [draftText, setDraftText] = useState("");
  const [mode, setMode] = useState<NotesMode>("edit");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [pendingTemplate, setPendingTemplate] = useState<PendingTemplate>(null);
  const [templates, setTemplates] = useState<NoteTemplate[]>(() =>
    getAllNoteTemplates(),
  );

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    const loadNotes = async () => {
      const api = window.pobAPI;
      if (!api) {
        setState({ status: "error", reason: "pobAPI unavailable" });
        return;
      }

      setState({ status: "loading" });
      const result = await api.session.notesSnapshot();
      if (cancelled) return;
      if (result.status === "ok") {
        setState({ status: "ready", snapshot: result.snapshot });
        setDraftText(result.snapshot.text);
      } else {
        setState({ status: "error", reason: result.reason });
      }
    };

    void loadNotes();
    return () => {
      cancelled = true;
    };
  }, [active]);

  const renderedMarkdown = useMemo(
    () =>
      DOMPurify.sanitize(marked.parse(draftText) as string, {
        ADD_ATTR: ["target", "rel"],
      }),
    [draftText],
  );

  const runAction = async (action: PobNotesAction) => {
    const api = window.pobAPI;
    if (!api) {
      setActionError("pobAPI unavailable");
      return;
    }

    setBusy(true);
    setActionError(null);
    try {
      const result = await api.session.notesAction(action);
      if (result.status === "ok") {
        setState({ status: "ready", snapshot: result.snapshot });
        setDraftText(result.snapshot.text);
        onMutated?.();
      } else {
        setActionError(result.reason);
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const flushDraftText = () => {
    if (state.status !== "ready") return;
    if (draftText === state.snapshot.text) return;
    void runAction({ type: "setText", value: draftText });
  };

  const applyNoteText = (value: string) => {
    setTemplatePickerOpen(false);
    setPendingTemplate(null);
    void runAction({ type: "setText", value });
  };

  const requestTemplate = (template: NoteTemplate) => {
    const variables = extractTemplateVariables(template.body);
    if (variables.length === 0) {
      applyNoteText(template.body);
      return;
    }

    setTemplatePickerOpen(false);
    setPendingTemplate({
      template,
      variables,
      values: Object.fromEntries(
        variables.map((key) => [key, key === "buildName" ? buildName : ""]),
      ),
    });
  };

  const applyPendingTemplate = () => {
    if (!pendingTemplate) return;
    applyNoteText(
      applyTemplateVariables(
        pendingTemplate.template.body,
        pendingTemplate.values,
      ),
    );
  };

  if (state.status === "error") {
    return (
      <div className="pob-error">
        {t("buildList.error.generic", { reason: state.reason })}
      </div>
    );
  }

  if (state.status === "idle" || state.status === "loading") {
    return (
      <p className="pob-mode-placeholder-body">
        {t("buildEdit.notes.loading")}
      </p>
    );
  }

  const { snapshot } = state;

  return (
    <div className="pob-notes">
      <header className="pob-notes-toolbar">
        <div className="pob-notes-mode-switch" role="tablist">
          <button
            type="button"
            className={mode === "edit" ? "is-active" : ""}
            onClick={() => setMode("edit")}
          >
            {t("buildEdit.notes.edit")}
          </button>
          <button
            type="button"
            className={mode === "preview" ? "is-active" : ""}
            onClick={() => setMode("preview")}
          >
            {t("buildEdit.notes.preview")}
          </button>
        </div>
        <button
          type="button"
          className="pob-party-button"
          disabled={busy}
          onClick={() => {
            setTemplates(getAllNoteTemplates());
            setTemplatePickerOpen(true);
          }}
        >
          {t("buildEdit.notes.templates")}
        </button>
        <a
          className="pob-notes-doc-link"
          href="https://www.markdownguide.org/basic-syntax/"
          target="_blank"
          rel="noreferrer"
        >
          {t("buildEdit.notes.markdownDocs")}
        </a>
      </header>

      <div className="pob-notes-help">
        {snapshot.description.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </div>

      <div className="pob-notes-color-row">
        {snapshot.colorControls.map((control) => {
          if (!control.shown) return null;
          return (
            <button
              key={control.id}
              type="button"
              className="pob-notes-color-button"
              disabled={busy || !control.enabled}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                const area = textareaRef.current;
                const selectionStart = area?.selectionStart ?? draftText.length;
                const selectionEnd = area?.selectionEnd ?? selectionStart;
                void runAction({
                  type: "insertColor",
                  code: control.code,
                  selectionStartByte: toUtf8ByteOffset(
                    draftText,
                    selectionStart,
                  ),
                  selectionEndByte: toUtf8ByteOffset(draftText, selectionEnd),
                });
              }}
            >
              {control.label}
            </button>
          );
        })}
        {snapshot.toggleButton.shown && (
          <button
            type="button"
            className="pob-party-button"
            disabled={busy || !snapshot.toggleButton.enabled}
            onClick={() =>
              void runAction({
                type: "setShowColorCodes",
                value: !snapshot.showColorCodes,
              })
            }
          >
            {snapshot.toggleButton.label}
          </button>
        )}
        {snapshot.dirty && (
          <span className="pob-notes-dirty">{t("buildEdit.notes.dirty")}</span>
        )}
      </div>

      {mode === "edit" ? (
        <textarea
          ref={textareaRef}
          className="pob-notes-editor"
          value={draftText}
          disabled={busy}
          spellCheck={false}
          onChange={(event) => setDraftText(event.target.value)}
          onBlur={flushDraftText}
        />
      ) : (
        <div
          className="pob-notes-preview"
          dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
        />
      )}

      {actionError && (
        <div className="pob-error">
          {t("buildList.error.generic", { reason: actionError })}
        </div>
      )}

      {templatePickerOpen && (
        <div
          className="pob-build-action-modal"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            setTemplatePickerOpen(false);
          }}
        >
          <div
            className="pob-build-action-modal-panel pob-notes-template-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>{t("buildEdit.notes.templatePromptTitle")}</h3>
            <div className="pob-notes-template-list">
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className="pob-notes-template-option"
                  onClick={() => requestTemplate(template)}
                >
                  {template.name}
                </button>
              ))}
            </div>
            <div className="pob-dialog-actions">
              <button
                type="button"
                className="pob-btn"
                onClick={() => {
                  setTemplatePickerOpen(false);
                }}
              >
                {t("buildList.dialog.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingTemplate && (
        <div
          className="pob-build-action-modal"
          role="dialog"
          aria-modal="true"
          onClick={() => setPendingTemplate(null)}
        >
          <div
            className="pob-build-action-modal-panel pob-notes-template-dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <h3>{pendingTemplate.template.name}</h3>
            <div className="pob-notes-variable-list">
              {pendingTemplate.variables.map((key) => (
                <label key={key}>
                  <span>{key}</span>
                  <input
                    type="text"
                    value={pendingTemplate.values[key] ?? ""}
                    onChange={(event) =>
                      setPendingTemplate((current) =>
                        current
                          ? {
                              ...current,
                              values: {
                                ...current.values,
                                [key]: event.target.value,
                              },
                            }
                          : current,
                      )
                    }
                  />
                </label>
              ))}
            </div>
            <div className="pob-dialog-actions">
              <button
                type="button"
                className="pob-btn"
                onClick={() => setPendingTemplate(null)}
              >
                {t("buildList.dialog.cancel")}
              </button>
              <button
                type="button"
                className="pob-btn pob-btn-primary"
                onClick={applyPendingTemplate}
              >
                {t("buildEdit.notes.applyTemplate")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
