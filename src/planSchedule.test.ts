import { describe, expect, it } from "vitest";
import { createPlanScheduleSegments } from "./planSchedule";
import type { Course, PlanItem } from "./types";

const course: Course = {
  id: "course-a", code: "A101", name: "時間割テスト", credits: 2, category: "specialized", requirementType: "elective", recommendedGrade: 1, recommendedTerm: "spring", offerings: [],
};

function item(periods: number[]): PlanItem {
  return {
    course,
    offering: { id: `class-${periods.join("-")}`, term: "spring", classCode: "A", weekday: "mon", periods, lottery: false },
    priority: "must",
  };
}

describe("履修案の時間割表示", () => {
  it("連続する時限はひとつの科目ブロックにまとめる", () => {
    expect(createPlanScheduleSegments([item([1, 2])])).toMatchObject([{ startPeriod: 1, span: 2 }]);
  });

  it("非連続の時限は別の科目ブロックとして表示する", () => {
    expect(createPlanScheduleSegments([item([1, 3, 4])])).toMatchObject([
      { startPeriod: 1, span: 1 },
      { startPeriod: 3, span: 2 },
    ]);
  });
});
