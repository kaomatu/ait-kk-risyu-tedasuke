import { describe, expect, it } from "vitest";
import { graduationRequirements, treeCourseState } from "./GraduationPlanner";

describe("卒業カリキュラムツリーの修得済み表示", () => {
  it("総合教育・必修の要件カードだけを言語系へ名称変更し、独立した言語系要件は置かない", () => {
    expect(graduationRequirements.find((requirement) => requirement.key === "generalRequired")?.title).toBe("言語系");
    expect(graduationRequirements.map((requirement) => requirement.key) as string[]).not.toContain("language");
  });

  it("修得済み科目は目標・実線前提・破線推奨より優先して緑の実線状態になる", () => {
    expect(treeCourseState("completed", ["completed"], [], [], ["completed"])).toBe("completed");
    expect(treeCourseState("completed", [], ["completed"], [], ["completed"])).toBe("completed");
    expect(treeCourseState("completed", [], [], ["completed"], ["completed"])).toBe("completed");
  });
});
