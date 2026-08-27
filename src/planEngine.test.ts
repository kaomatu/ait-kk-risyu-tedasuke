import { describe, expect, it } from "vitest";
import { mockCatalog } from "./mockCatalog";
import { activeAnnualCap, autoRequiredCourseIds, calculateProgress, creditsCountedForCurrentTerm, generatePlan } from "./planEngine";
import type { Course, Dataset, StudentProfile } from "./types";

function profile(overrides: Partial<StudentProfile> = {}): StudentProfile {
  return {
    currentGrade: 1,
    term: "spring",
    gpa: null,
    annualCapBonusLocked: false,
    completedCourseIds: [],
    wanted: {},
    autoRequiredCourseIds: [],
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

  it("総合教育科目の選択必修は5単位まで必修、超過分は選択として集計する", () => {
    const mandatory: Course = {
      id: "general-mandatory", code: "GM", name: "総合必修", credits: 3, category: "general", requirementType: "required", recommendedGrade: 1, recommendedTerm: "spring", offerings: [],
    };
    const requiredElective: Course = {
      id: "general-required-elective", code: "GRE", name: "総合選択必修", credits: 6, category: "general", requirementType: "required_elective", recommendedGrade: 1, recommendedTerm: "spring", offerings: [],
    };
    const progress = calculateProgress(
      { ...mockCatalog, courses: [mandatory, requiredElective] },
      profile({ completedCourseIds: [mandatory.id, requiredElective.id] }),
      null,
    );

    expect(progress.generalRequired).toBe(8);
    expect(progress.generalElective).toBe(1);
    expect(progress.generalTotal).toBe(9);
  });

  it("対象外として記録したクラスはKK学生の候補に入れない", () => {
    const course: Course = {
      id: "excluded", code: "EX", name: "対象外", credits: 2, category: "general", requirementType: "elective", recommendedGrade: 1, recommendedTerm: "spring",
      offerings: [{ id: "excluded-1", term: "spring", classCode: "C", weekday: "mon", periods: [1], lottery: true, eligibleForProgram: false }],
    };
    const result = generatePlan({ ...mockCatalog, courses: [course] }, profile({ wanted: { excluded: "must" } }));

    expect(result.selected).toHaveLength(0);
    expect(result.rejected[0]?.reasons.join(" ")).toContain("開講クラスがありません");
  });

  it("未修得の再履修クラスは候補に入り、修得済みなら再チャレンジ指定が必要", () => {
    const course: Course = {
      id: "retry", code: "RE", name: "再履修", credits: 2, category: "general", requirementType: "required", recommendedGrade: 1, recommendedTerm: "spring",
      offerings: [{ id: "retry-1", term: "spring", classCode: "再履修1", weekday: "mon", periods: [1], lottery: true, rechallengeOnly: true }],
    };
    const dataset = { ...mockCatalog, courses: [course] };
    const incomplete = generatePlan(dataset, profile({ wanted: { retry: "must" } }));
    const completedWithoutRetry = generatePlan(dataset, profile({ completedCourseIds: ["retry"], wanted: { retry: "must" } }));
    const withRetry = generatePlan(dataset, profile({ completedCourseIds: ["retry"], rechallengeCourseIds: ["retry"], wanted: { retry: "must" } }));

    expect(incomplete.selected.map((item) => item.course.id)).toEqual(["retry"]);
    expect(completedWithoutRetry.selected).toHaveLength(0);
    expect(withRetry.selected.map((item) => item.course.id)).toEqual(["retry"]);
  });

  it("当該学期に開講する未修得の必修科目だけを自動選択する", () => {
    const requiredSpring: Course = { id: "required-spring", code: "RS", name: "前期必修", credits: 2, category: "specialized", requirementType: "required", recommendedGrade: 1, recommendedTerm: "spring", offerings: [{ id: "rs", term: "spring", classCode: "X1", weekday: "mon", periods: [1], lottery: false }] };
    const requiredFall: Course = { id: "required-fall", code: "RF", name: "後期必修", credits: 2, category: "specialized", requirementType: "required", recommendedGrade: 1, recommendedTerm: "fall", offerings: [{ id: "rf", term: "fall", classCode: "X1", weekday: "tue", periods: [1], lottery: false }] };
    const electiveSpring: Course = { id: "elective-spring", code: "ES", name: "前期選択", credits: 2, category: "specialized", requirementType: "elective", recommendedGrade: 1, recommendedTerm: "spring", offerings: [{ id: "es", term: "spring", classCode: "X1", weekday: "wed", periods: [1], lottery: false }] };
    const futureRequired: Course = { id: "future-required", code: "FR", name: "上級必修", credits: 2, category: "specialized", requirementType: "required", recommendedGrade: 2, recommendedTerm: "spring", offerings: [{ id: "fr", term: "spring", classCode: "X1", weekday: "thu", periods: [1], lottery: false }] };
    const retakeRequired: Course = { id: "retake-required", code: "RR", name: "再履修必修", credits: 2, category: "specialized", requirementType: "required", recommendedGrade: 1, recommendedTerm: "spring", offerings: [{ id: "rr", term: "spring", classCode: "再履修1", weekday: "fri", periods: [1], lottery: false, rechallengeOnly: true }] };
    const dataset = { ...mockCatalog, courses: [requiredSpring, requiredFall, electiveSpring, futureRequired, retakeRequired] };

    expect(autoRequiredCourseIds(dataset, profile())).toEqual(["required-spring", "retake-required"]);
    expect(autoRequiredCourseIds(dataset, profile({ completedCourseIds: ["required-spring"] }))).toEqual(["retake-required"]);
    expect(autoRequiredCourseIds(dataset, profile({ term: "fall" }))).toEqual(["required-fall"]);
  });

  it("通年科目は後期から新規に履修登録できない", () => {
    const course: Course = {
      id: "annual", code: "AN", name: "通年科目", credits: 4, category: "specialized", requirementType: "required", recommendedGrade: 3, recommendedTerm: "full_year",
      offerings: [{ id: "annual-fall", term: "fall", classCode: "X1", weekday: "tue", periods: [1], lottery: false }],
    };
    const result = generatePlan({ ...mockCatalog, courses: [course] }, profile({ currentGrade: 3, term: "fall", wanted: { annual: "must" } }));

    expect(result.selected).toHaveLength(0);
    expect(result.rejected[0]?.reasons.join(" ")).toContain("後期から新規登録はできません");
  });
});
