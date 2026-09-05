import { describe, expect, it } from "vitest";
import { cycleCurrentTermCourseIntent, cycleFutureCourseIntent, filterPlannerCoursePicker, profileForPickerSchedulePreview, selectedPlannerCourseIds } from "./coursePicker";
import type { Course, StudentProfile } from "./types";

const profile: StudentProfile = {
  currentGrade: 1,
  term: "spring",
  gpa: null,
  annualCapBonusLocked: false,
  completedCourseIds: [],
  wanted: {},
  futureGoalCourseIds: [],
  targetTermCredits: null,
  autoRequiredCourseIds: [],
  autoGraduationPlanWanted: {},
  rechallengeCourseIds: [],
  lotteryStates: {},
  hardBlockedSlots: [],
  softBlockedSlots: [],
  annualRegisteredCredits: 0,
};

const courses: Course[] = [
  { id: "spring", code: "S101", name: "前期科目", credits: 2, category: "specialized", requirementType: "elective", recommendedGrade: 1, recommendedTerm: "spring", offerings: [{ id: "spring-a", term: "spring", classCode: "A", weekday: "mon", periods: [1], lottery: false }] },
  { id: "fall", code: "F101", name: "後期科目", credits: 2, category: "specialized", requirementType: "elective", recommendedGrade: 1, recommendedTerm: "fall", offerings: [{ id: "fall-a", term: "fall", classCode: "A", weekday: "tue", periods: [1], lottery: false }] },
  { id: "second", code: "S201", name: "二年次科目", credits: 2, category: "specialized", requirementType: "elective", recommendedGrade: 2, recommendedTerm: "spring", offerings: [{ id: "second-a", term: "spring", classCode: "A", weekday: "wed", periods: [1], lottery: false }] },
];

describe("ツール2の科目選択欄の絞り込み", () => {
  it("初期の今期表示は、現在の学年かつ今期に開講する科目へ絞る", () => {
    const result = filterPlannerCoursePicker(courses, profile, { grade: 1, termScope: "current", query: "", selectedCourseIds: [] });
    expect(result.map((course) => course.id)).toEqual(["spring"]);
  });

  it("今期に開講しない選択済み科目は、解除・確認できるよう表示に残す", () => {
    const result = filterPlannerCoursePicker(courses, profile, { grade: 1, termScope: "current", query: "", selectedCourseIds: ["fall"] });
    expect(result.map((course) => course.id)).toEqual(["fall", "spring"]);
  });

  it("配当学期すべての表示と科目名・コード検索に対応する", () => {
    const result = filterPlannerCoursePicker(courses, profile, { grade: 1, termScope: "all", query: "後期", selectedCourseIds: [] });
    expect(result.map((course) => course.id)).toEqual(["fall"]);
  });

  it("検索中でも、すでに選んだ科目は上部で確認・解除できる", () => {
    const result = filterPlannerCoursePicker(courses, profile, { grade: 1, termScope: "all", query: "後期", selectedCourseIds: ["spring"] });
    expect(result.map((course) => course.id)).toEqual(["fall", "spring"]);
  });

  it("自動選択の補助情報だけが残っても、選択済み欄には表示しない", () => {
    const ids = selectedPlannerCourseIds({
      ...profile,
      wanted: { spring: "prefer" },
      futureGoalCourseIds: ["fall"],
      autoRequiredCourseIds: ["second"],
      autoGraduationPlanWanted: { stale: "must" },
    });
    expect(ids.sort()).toEqual(["fall", "second", "spring"]);
  });

  it("卒業計画から自動選択された今期科目を解除すると、選択済み・自動選択の両方から外す", () => {
    const next = cycleCurrentTermCourseIntent({
      ...profile,
      wanted: { fall: "must" },
      autoGraduationPlanWanted: { fall: "must" },
    }, "fall");
    expect(next.wanted).toEqual({});
    expect(next.autoGraduationPlanWanted).toEqual({});
    expect(selectedPlannerCourseIds({ ...profile, ...next })).not.toContain("fall");
  });

  it("今期外の将来目標も、解除すると選択済み欄から外す", () => {
    const next = cycleFutureCourseIntent({ ...profile, futureGoalCourseIds: ["fall"] }, "fall");
    expect(next.futureGoalCourseIds).toEqual([]);
    expect(selectedPlannerCourseIds({ ...profile, ...next })).not.toContain("fall");
  });

  it("選択済み科目の時間割プレビューには、表示年次で今期に開講する科目だけを渡す", () => {
    const preview = profileForPickerSchedulePreview({
      ...profile,
      wanted: { spring: "must", fall: "prefer" },
      futureGoalCourseIds: ["second"],
      autoRequiredCourseIds: ["spring", "fall"],
      autoGraduationPlanWanted: { spring: "must", fall: "prefer" },
    }, ["spring"]);
    expect(preview.wanted).toEqual({ spring: "must" });
    expect(preview.autoRequiredCourseIds).toEqual(["spring"]);
    expect(preview.futureGoalCourseIds).toEqual([]);
    expect(preview.autoGraduationPlanWanted).toEqual({ spring: "must" });
  });
});
