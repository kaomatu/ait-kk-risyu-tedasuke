import { describe, expect, it } from "vitest";
import { mockCatalog } from "./mockCatalog";
import { activeAnnualCap, autoGraduationPlanWanted, autoRequiredCourseIds, calculateGraduationPlanProgress, calculateProgress, creditsCountedForCurrentTerm, deriveGraduationPlan, generatePlan, prerequisitePriorities, recommendCourses, requiredScheduleSlots } from "./planEngine";
import type { Course, Dataset, StudentProfile } from "./types";

function profile(overrides: Partial<StudentProfile> = {}): StudentProfile {
  return {
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
    ...overrides,
  };
}

describe("履修計画エンジン", () => {
  it("現在入力したGPAだけでは年間上限を52単位へ変更しない", () => {
    expect(activeAnnualCap(mockCatalog, profile({ gpa: 4 }))).toBe(48);
    expect(activeAnnualCap(mockCatalog, profile({ gpa: 0, annualCapBonusLocked: true }))).toBe(52);
  });

  it("取りたい科目に選択していない配当期の科目を、履修案へ勝手に追加しない", () => {
    const result = generatePlan(mockCatalog, profile({
      currentGrade: 1,
      term: "fall",
      completedCourseIds: ["demo.P101"],
      wanted: {},
    }));

    expect(result.selected).toHaveLength(0);
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

  it("複数クラスの抽選科目は、先に選んだ科目を別クラスへ振り替えて履修可能にする", () => {
    const flexibleA: Course = {
      id: "a", code: "A", name: "科目A", credits: 2, category: "general", requirementType: "elective", recommendedGrade: 1, recommendedTerm: "spring",
      offerings: [
        { id: "a-mon", term: "spring", classCode: "A1", weekday: "mon", periods: [1], lottery: false },
        { id: "a-wed", term: "spring", classCode: "A2", weekday: "wed", periods: [1], lottery: false },
      ],
    };
    const flexibleB: Course = {
      id: "b", code: "B", name: "科目B", credits: 2, category: "general", requirementType: "elective", recommendedGrade: 1, recommendedTerm: "spring",
      offerings: [
        { id: "b-tue", term: "spring", classCode: "B1", weekday: "tue", periods: [1], lottery: false },
        { id: "b-thu", term: "spring", classCode: "B2", weekday: "thu", periods: [1], lottery: false },
      ],
    };
    const constitution: Course = {
      id: "constitution", code: "G2048", name: "日本国憲法", credits: 2, category: "general", requirementType: "elective", recommendedGrade: 1, recommendedTerm: "spring",
      offerings: [
        { id: "constitution-mon", term: "spring", classCode: "A1", weekday: "mon", periods: [1], lottery: true },
        { id: "constitution-tue", term: "spring", classCode: "B1", weekday: "tue", periods: [1], lottery: true },
      ],
    };
    const dataset: Dataset = { ...mockCatalog, courses: [flexibleA, flexibleB, constitution] };
    const result = generatePlan(dataset, profile({ wanted: { a: "must", b: "must", constitution: "must" } }));

    expect(result.rejected).toHaveLength(0);
    expect(result.selected).toHaveLength(3);
    expect(new Set(result.selected.flatMap(({ offering }) => offering.periods.map((period) => `${offering.weekday}-${period}`))).size).toBe(3);
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

  it("上級年次では、過年度に未修得で今期に開講する必修も自動選択する", () => {
    const pastRequired: Course = {
      id: "past-required", code: "PR", name: "過年度必修", credits: 2, category: "specialized", requirementType: "required", recommendedGrade: 1, recommendedTerm: "fall",
      offerings: [{ id: "past-required-fall", term: "fall", classCode: "A", weekday: "mon", periods: [1], lottery: false }],
    };
    const futureRequired: Course = {
      id: "future-required", code: "FR", name: "将来必修", credits: 2, category: "specialized", requirementType: "required", recommendedGrade: 3, recommendedTerm: "fall",
      offerings: [{ id: "future-required-fall", term: "fall", classCode: "A", weekday: "tue", periods: [1], lottery: false }],
    };
    const dataset = { ...mockCatalog, courses: [pastRequired, futureRequired] };

    expect(autoRequiredCourseIds(dataset, profile({ currentGrade: 2, term: "fall" }))).toEqual(["past-required"]);
  });

  it("自動選択した必修は空けたい時限より優先し、必修枠として固定する", () => {
    const required: Course = {
      id: "locked-required", code: "LR", name: "固定必修", credits: 2, category: "specialized", requirementType: "required", recommendedGrade: 1, recommendedTerm: "spring",
      offerings: [{ id: "locked-required-a", term: "spring", classCode: "A", weekday: "mon", periods: [1], lottery: false }],
    };
    const dataset = { ...mockCatalog, courses: [required] };
    const student = profile({ wanted: { [required.id]: "must" }, autoRequiredCourseIds: [required.id], hardBlockedSlots: ["mon-1"] });

    expect(requiredScheduleSlots(dataset, student)).toEqual(["mon-1"]);
    expect(generatePlan(dataset, student).selected.map((item) => item.course.id)).toEqual([required.id]);
  });

  it("将来目標と必ず取りたい科目の実線前提を、優先度を引き継いで今期の候補へ追加する", () => {
    const foundation: Course = {
      id: "foundation", code: "F", name: "基礎", credits: 2, category: "specialized", requirementType: "elective", recommendedGrade: 1, recommendedTerm: "spring",
      offerings: [{ id: "foundation-a", term: "spring", classCode: "A", weekday: "mon", periods: [1], lottery: false }],
    };
    const target: Course = {
      id: "target", code: "T", name: "目標", credits: 2, category: "specialized", requirementType: "elective", recommendedGrade: 1, recommendedTerm: "spring", hardPrerequisites: [foundation.id],
      offerings: [{ id: "target-a", term: "spring", classCode: "A", weekday: "tue", periods: [1], lottery: false }],
    };
    const dataset = { ...mockCatalog, courses: [foundation, target] };
    const mustProfile = profile({ wanted: { [target.id]: "must" } });
    const futureProfile = profile({ futureGoalCourseIds: [target.id] });

    expect(prerequisitePriorities(dataset, mustProfile).get(foundation.id)).toBe("must");
    expect(prerequisitePriorities(dataset, futureProfile).get(foundation.id)).toBe("prefer");
    const result = generatePlan(dataset, mustProfile);
    expect(result.selected.map((item) => item.course.id)).toEqual([foundation.id]);
    expect(result.selected[0]?.priority).toBe("must");
    expect(result.rejected.map((item) => item.course.id)).toEqual([target.id]);
  });

  it("目標単位に不足する場合でも、候補を勝手に履修案へ追加しない", () => {
    const selected: Course = {
      id: "selected", code: "S", name: "選択済み", credits: 2, category: "specialized", requirementType: "elective", recommendedGrade: 1, recommendedTerm: "spring",
      offerings: [{ id: "selected-a", term: "spring", classCode: "A", weekday: "mon", periods: [1], lottery: false }],
    };
    const candidate: Course = {
      id: "candidate", code: "C", name: "候補", credits: 2, category: "general", requirementType: "required_elective", recommendedGrade: 1, recommendedTerm: "spring",
      offerings: [{ id: "candidate-a", term: "spring", classCode: "A", weekday: "tue", periods: [1], lottery: false }],
    };
    const dataset = { ...mockCatalog, courses: [selected, candidate] };
    const student = profile({ wanted: { [selected.id]: "must" }, targetTermCredits: 4 });
    const result = generatePlan(dataset, student);
    const recommendations = recommendCourses(dataset, student, result);

    expect(result.selected.map((item) => item.course.id)).toEqual([selected.id]);
    expect(recommendations.map((item) => item.course.id)).toEqual([candidate.id]);
    expect(result.selected.some((item) => item.course.id === candidate.id)).toBe(false);
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

  it("卒業計画は目標から実線の必要科目と破線の推奨科目を区別して再帰的に求める", () => {
    const foundation: Course = {
      id: "foundation", code: "F", name: "基礎", credits: 2, category: "specialized", requirementType: "elective", recommendedGrade: 1, recommendedTerm: "spring", offerings: [],
    };
    const preparation: Course = {
      id: "preparation", code: "P", name: "推奨の基礎", credits: 2, category: "specialized", requirementType: "elective", recommendedGrade: 1, recommendedTerm: "spring", offerings: [],
    };
    const intermediate: Course = {
      id: "intermediate", code: "I", name: "中間", credits: 2, category: "specialized", requirementType: "elective", recommendedGrade: 2, recommendedTerm: "spring", hardPrerequisites: [foundation.id], softPrerequisites: [preparation.id], offerings: [],
    };
    const target: Course = {
      id: "target", code: "T", name: "目標", credits: 2, category: "specialized", requirementType: "elective", recommendedGrade: 3, recommendedTerm: "spring", hardPrerequisites: [intermediate.id], offerings: [],
    };
    const derived = deriveGraduationPlan({ ...mockCatalog, courses: [foundation, preparation, intermediate, target] }, [target.id]);

    expect(derived.targetCourseIds).toEqual([target.id]);
    expect(derived.requiredCourseIds).toEqual([foundation.id, intermediate.id]);
    expect(derived.recommendedCourseIds).toEqual([preparation.id]);
  });

  it("保存済み卒業計画から、今学期に登録可能な必要・目標科目だけを自動選択する", () => {
    const requiredNow: Course = {
      id: "required-now", code: "RN", name: "必要な先修", credits: 2, category: "specialized", requirementType: "elective", recommendedGrade: 1, recommendedTerm: "spring", offerings: [{ id: "rn", term: "spring", classCode: "A", weekday: "mon", periods: [1], lottery: false }],
    };
    const futureTarget: Course = {
      id: "future-target", code: "FT", name: "後の目標", credits: 2, category: "specialized", requirementType: "elective", recommendedGrade: 2, recommendedTerm: "spring", hardPrerequisites: [requiredNow.id], offerings: [{ id: "ft", term: "spring", classCode: "A", weekday: "tue", periods: [1], lottery: false }],
    };
    const recommendedNow: Course = {
      id: "recommended-now", code: "RC", name: "推奨科目", credits: 2, category: "general", requirementType: "elective", recommendedGrade: 1, recommendedTerm: "spring", offerings: [{ id: "rc", term: "spring", classCode: "A", weekday: "wed", periods: [1], lottery: false }],
    };
    const dataset = { ...mockCatalog, courses: [requiredNow, futureTarget, recommendedNow] };
    const graduationPlan = {
      schemaVersion: 1 as const,
      datasetVersionId: dataset.datasetVersionId,
      programCode: dataset.program.code,
      targetCourseIds: [futureTarget.id],
      requiredCourseIds: [requiredNow.id],
      recommendedCourseIds: [recommendedNow.id],
      savedAt: "2026-04-01T00:00:00.000Z",
    };

    expect(autoGraduationPlanWanted(dataset, profile(), graduationPlan)).toEqual({ [requiredNow.id]: "must", [recommendedNow.id]: "prefer" });
  });

  it("卒業計画の進捗は修得済みと計画内の科目を重複せずに合算する", () => {
    const completed: Course = {
      id: "completed", code: "C", name: "修得済み", credits: 2, category: "specialized", requirementType: "required", recommendedGrade: 1, recommendedTerm: "spring", offerings: [],
    };
    const planned: Course = {
      id: "planned", code: "P", name: "計画中", credits: 3, category: "general", requirementType: "elective", recommendedGrade: 1, recommendedTerm: "spring", offerings: [],
    };
    const dataset = { ...mockCatalog, courses: [completed, planned] };
    const progress = calculateGraduationPlanProgress(dataset, profile({ completedCourseIds: [completed.id] }), {
      targetCourseIds: [completed.id, planned.id], requiredCourseIds: [], recommendedCourseIds: [],
    });

    expect(progress.specializedTotal).toBe(2);
    expect(progress.generalTotal).toBe(3);
    expect(progress.graduationTotal).toBe(5);
  });
});
