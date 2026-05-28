import { beforeEach, describe, expect, it } from "vitest";

import {
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
