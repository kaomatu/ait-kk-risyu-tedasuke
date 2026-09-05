import { describe, expect, it } from "vitest";
import { treeCourseState } from "./GraduationPlanner";

describe("卒業カリキュラムツリーの修得済み表示", () => {
  it("修得済み科目は目標・実線前提・破線推奨より優先して緑の実線状態になる", () => {
    expect(treeCourseState("completed", ["completed"], [], [], ["completed"])).toBe("completed");
    expect(treeCourseState("completed", [], ["completed"], [], ["completed"])).toBe("completed");
    expect(treeCourseState("completed", [], [], ["completed"], ["completed"])).toBe("completed");
  });
});
