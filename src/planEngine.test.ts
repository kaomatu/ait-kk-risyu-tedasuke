import { describe, expect, it } from "vitest";
import { mockCatalog } from "./mockCatalog";
import { activeAnnualCap, calculateProgress, creditsCountedForCurrentTerm, generatePlan } from "./planEngine";
import type { Course, Dataset, StudentProfile } from "./types";

function profile(overrides: Partial<StudentProfile> = {}): StudentProfile {
  return {
    currentGrade: 1,
    term: "spring",
    gpa: null,
    annualCapBonusLocked: false,
    completedCourseIds: [],
    wanted: {},
    rechallengeCourseIds: [],
    lotteryStates: {},
    hardBlockedSlots: [],
    softBlockedSlots: [],
    annualRegisteredCredits: 0,
    ...overrides,
  };
}

describe("履修計画エンジン", () => {
  it("現在入力したGPAだけでは年間上限を52単位へ変更しない", () => {
    expect(activeAnnualCap(mockCatalog, profile({ gpa: 4 }))).toBe(48);
    expect(activeAnnualCap(mockCatalog, profile({ gpa: 0, annualCapBonusLocked: true }))).toBe(52);
  });

  it("実線の前提科目を修得していない希望科目は登録候補から除外する", () => {
    const result = generatePlan(mockCatalog, profile({
      term: "fall",
      wanted: { "demo.P201": "must" },
    }));

    expect(result.selected.some((item) => item.course.id === "demo.P201")).toBe(false);
    expect(result.rejected[0]?.reasons.join(" ")).toContain("前提科目");
  });

  it("固定で空ける時限と重なるクラスは登録候補から除外する", () => {
    const result = generatePlan(mockCatalog, profile({
      wanted: { "demo.P101": "must" },
      hardBlockedSlots: ["mon-1"],
    }));

    expect(result.selected.some((item) => item.course.id === "demo.P101")).toBe(false);
    expect(result.rejected[0]?.reasons.join(" ")).toContain("時間割の重複");
  });

  it("学期上限を超える希望科目を採用しない", () => {
    const largeCourses: Course[] = [
      {
        id: "cap-a", code: "A", name: "A", credits: 20, category: "specialized", requirementType: "elective", recommendedGrade: 1, recommendedTerm: "spring",
        offerings: [{ id: "cap-a-1", term: "spring", classCode: "1", weekday: "mon", periods: [1], lottery: false }],
      },
      {
        id: "cap-b", code: "B", name: "B", credits: 15, category: "specialized", requirementType: "elective", recommendedGrade: 1, recommendedTerm: "spring",
        offerings: [{ id: "cap-b-1", term: "spring", classCode: "1", weekday: "tue", periods: [1], lottery: false }],
      },
    ];
    const dataset: Dataset = { ...mockCatalog, courses: largeCourses };
    const result = generatePlan(dataset, profile({ wanted: { "cap-a": "must", "cap-b": "must" } }));

    expect(result.capCountedCredits).toBe(20);
    expect(result.rejected[0]?.reasons.join(" ")).toContain("30単位");
  });

  it("通年科目は前期に全単位を上限へ算入し、後期には重ねて算入しない", () => {
    const fullYear: Course = {
      id: "full", code: "FY", name: "通年", credits: 4, category: "specialized", requirementType: "required", recommendedGrade: 4, recommendedTerm: "full_year", offerings: [],
    };
    expect(creditsCountedForCurrentTerm(fullYear, "spring")).toBe(4);
    expect(creditsCountedForCurrentTerm(fullYear, "fall")).toBe(0);
    expect(creditsCountedForCurrentTerm({ ...fullYear, countsTowardCreditCap: false }, "spring")).toBe(0);
  });

  it("再チャレンジ履修の単位を卒業・進級要件へ二重計上しない", () => {
    const course = mockCatalog.courses.find((item) => item.id === "demo.P101")!;
    const result = {
      selected: [{ course, offering: course.offerings[0]!, priority: "must" as const }],
      rejected: [], warnings: [], capCountedCredits: 3, lotteryCredits: 0,
    };
    const progress = calculateProgress(mockCatalog, profile({
      completedCourseIds: [course.id],
      rechallengeCourseIds: [course.id],
    }), result);

    expect(progress.completedProgression).toBe(3);
    expect(progress.projectedProgression).toBe(3);
    expect(progress.graduationTotal).toBe(3);
  });
});
