import { describe, expect, it } from "vitest";
import { filterPlannerCoursePicker } from "./coursePicker";
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
});
