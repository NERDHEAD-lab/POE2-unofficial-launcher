import { beforeEach, describe, expect, it } from "vitest";

import {
  DEFAULT_NOTE_TEMPLATES,
  applyTemplateVariables,
  createNoteTemplateId,
  extractTemplateVariables,
  getAllNoteTemplates,
  loadUserNoteTemplates,
  saveUserNoteTemplates,
} from "./noteTemplates";

describe("noteTemplates", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("stores custom templates in the wrapper namespace", () => {
    const template = {
      id: createNoteTemplateId(),
      name: "Boss plan",
      body: "# {buildName}\n- {boss}",
    };

    saveUserNoteTemplates([template]);

    expect(loadUserNoteTemplates()).toEqual([template]);
    expect(getAllNoteTemplates()).toEqual(
      expect.arrayContaining([expect.objectContaining(template)]),
    );
  });

  it("shows built-in templates with user templates but only stores custom templates", () => {
    const template = {
      id: createNoteTemplateId(),
      name: "Mapping prep",
      body: "- Map mods:",
    };

    saveUserNoteTemplates([...DEFAULT_NOTE_TEMPLATES, template]);

    expect(loadUserNoteTemplates()).toEqual([template]);
    expect(
      getAllNoteTemplates().slice(0, DEFAULT_NOTE_TEMPLATES.length),
    ).toEqual(DEFAULT_NOTE_TEMPLATES);
    expect(getAllNoteTemplates()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "build-summary", builtIn: true }),
        expect.objectContaining(template),
      ]),
    );
  });

  it("extracts variables and applies user-provided values", () => {
    const body = "# {buildName}\nRun {boss} with {buildName}.";

    expect(extractTemplateVariables(body)).toEqual(["buildName", "boss"]);
    expect(
      applyTemplateVariables(body, {
        buildName: "Storm Wave",
        boss: "Arbiter",
      }),
    ).toBe("# Storm Wave\nRun Arbiter with Storm Wave.");
  });
});
