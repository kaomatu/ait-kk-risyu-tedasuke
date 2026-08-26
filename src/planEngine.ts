import type { Course, Dataset, PlanItem, PlanResult, StudentProfile } from "./types";
import { slotKey } from "./types";

const isCountedForProgression = (course: Course) => course.countForProgression !== false;
const isCountedForGraduation = (course: Course) => course.countForGraduation !== false;

export function creditsCountedForCurrentTerm(course: Course, term: StudentProfile["term"]) {
  if (course.countsTowardCreditCap === false) return 0;
  // 通年科目は前期に全単位を上限へ算入する、という今回の運用ルール。
  return course.recommendedTerm === "full_year" && term === "fall" ? 0 : course.credits;
}

export function activeAnnualCap(dataset: Dataset, profile: StudentProfile) {
  // 52単位は「前年度の進級判定で取得済み」の資格。現在入力中のGPAで即時に上げない。
  return profile.annualCapBonusLocked
    ? dataset.policies.honorsAnnualCap
    : dataset.policies.normalAnnualCap;
}

function offeringForTerm(course: Course, term: StudentProfile["term"]) {
  return course.offerings.filter((offering) => offering.term === term);
}

function courseReasons(course: Course, profile: StudentProfile) {
  const reasons: string[] = [];
  if (profile.completedCourseIds.includes(course.id) && !profile.rechallengeCourseIds.includes(course.id)) {
    reasons.push("すでに修得済みです。再チャレンジ履修として指定すると候補へ戻せます。");
  }
  const missing = (course.hardPrerequisites ?? []).filter((id) => !profile.completedCourseIds.includes(id));
  if (missing.length > 0) reasons.push(`実線の前提科目が${missing.length}件、過去学期までに修得されていません。`);
  if (offeringForTerm(course, profile.term).length === 0) reasons.push("今学期の開講クラスがありません。");
  return reasons;
}

function priorityOf(course: Course, profile: StudentProfile): PlanItem["priority"] {
  return profile.wanted[course.id] ?? "suggested";
}

export function generatePlan(dataset: Dataset, profile: StudentProfile): PlanResult {
  const wantedIds = Object.keys(profile.wanted);
  const ranking = [...dataset.courses]
    .filter((course) => wantedIds.includes(course.id) || (course.recommendedGrade === profile.currentGrade && course.recommendedTerm === profile.term))
    .sort((a, b) => {
      const score = (course: Course) => priorityOf(course, profile) === "must" ? 3 : priorityOf(course, profile) === "prefer" ? 2 : course.requirementType === "required" ? 1 : 0;
      return score(b) - score(a) || a.code.localeCompare(b.code, "ja");
    });

  const selected: PlanItem[] = [];
  const rejected: PlanResult["rejected"] = [];
  const occupied = new Set<string>();
  let capCredits = 0;
  const annualCap = activeAnnualCap(dataset, profile);

  for (const course of ranking) {
    const initialReasons = courseReasons(course, profile);
    if (initialReasons.length) {
      if (wantedIds.includes(course.id)) rejected.push({ course, reasons: initialReasons });
      continue;
    }

    const candidate = offeringForTerm(course, profile.term).find((offering) => {
      const slots = offering.periods.map((period) => slotKey(offering.weekday, period));
      return !slots.some((slot) => occupied.has(slot) || profile.hardBlockedSlots.includes(slot));
    });
    if (!candidate) {
      if (wantedIds.includes(course.id)) rejected.push({ course, reasons: ["時間割の重複、または空けたい時限（固定）と重なります。"] });
      continue;
    }
    const currentTermCredits = creditsCountedForCurrentTerm(course, profile.term);
    if (capCredits + currentTermCredits > dataset.policies.termCap) {
      if (wantedIds.includes(course.id)) rejected.push({ course, reasons: ["今学期の履修上限30単位を超えます。"] });
      continue;
    }
    if (profile.annualRegisteredCredits + capCredits + currentTermCredits > annualCap) {
      if (wantedIds.includes(course.id)) rejected.push({ course, reasons: [`年間上限${annualCap}単位を超えます。`] });
      continue;
    }

    selected.push({ course, offering: candidate, priority: priorityOf(course, profile) });
    capCredits += currentTermCredits;
    candidate.periods.forEach((period) => occupied.add(slotKey(candidate.weekday, period)));
  }

  const warnings: string[] = [];
  selected.forEach(({ course, offering }) => {
    const lotteryState = profile.lotteryStates[course.id] ?? "none";
    if (offering.lottery && lotteryState === "won") warnings.push(`${course.name}は当選済みです。同一科目の別クラスには申請できません。`);
    else if (offering.lottery && lotteryState === "lost") warnings.push(`${course.name}は前回落選です。次回の抽選へ再申請できます。`);
    else if (offering.lottery) warnings.push(`${course.name}は抽選対象です。当選は保証されません。`);
    if ((course.softPrerequisites ?? []).some((id) => !profile.completedCourseIds.includes(id))) {
      warnings.push(`${course.name}には未修得の推奨科目がありますが、登録は禁止されていません。`);
    }
  });

  return {
    selected,
    rejected,
    warnings: [...new Set(warnings)],
    capCountedCredits: capCredits,
    lotteryCredits: selected
      .filter((item) => item.offering.lottery && (profile.lotteryStates[item.course.id] ?? "none") === "applied")
      .reduce((sum, item) => sum + item.course.credits, 0),
  };
}

export function calculateProgress(dataset: Dataset, profile: StudentProfile, plan: PlanResult | null) {
  const completed = dataset.courses.filter((course) => profile.completedCourseIds.includes(course.id));
  // 再チャレンジ履修は上限には算入するが、同じ単位を要件へ二重計上しない。
  const planned = (plan?.selected.map((item) => item.course) ?? []).filter((course) => !profile.completedCourseIds.includes(course.id));
  const creditSum = (courses: Course[], predicate: (course: Course) => boolean) => courses.filter(predicate).reduce((sum, course) => sum + course.credits, 0);
  const completedProgression = creditSum(completed, isCountedForProgression);
  const plannedProgression = creditSum(planned, isCountedForProgression);
  const allGraduation = [...completed, ...planned].filter(isCountedForGraduation);
  const specializedRequired = creditSum(allGraduation, (course) => course.category === "specialized" && course.requirementType === "required");
  const specializedRequiredElective = allGraduation.filter((course) => course.category === "specialized" && course.requirementType === "required_elective");
  const requiredElectiveGroups = new Map<string, Course[]>();
  specializedRequiredElective.forEach((course) => {
    // group 未設定の選択必修は、抽出レビューが終わるまで必修側へ勝手に配分しない。
    if (!course.requiredElectiveGroup) return;
    const courses = requiredElectiveGroups.get(course.requiredElectiveGroup) ?? [];
    courses.push(course);
    requiredElectiveGroups.set(course.requiredElectiveGroup, courses);
  });
  let requiredFromGroups = 0;
  let electiveFromGroups = 0;
  requiredElectiveGroups.forEach((courses) => {
    const [first, ...rest] = courses;
    requiredFromGroups += first?.credits ?? 0;
    electiveFromGroups += rest.reduce((sum, course) => sum + course.credits, 0);
  });
  const specializedElective = creditSum(allGraduation, (course) => course.category === "specialized" && course.requirementType === "elective") + electiveFromGroups;
  const specializedRequiredWithGroup = specializedRequired + requiredFromGroups;
  const generalRequired = creditSum(allGraduation, (course) => course.category === "general" && (course.requirementType === "required" || course.requirementType === "required_elective"));
  const generalElective = creditSum(allGraduation, (course) => course.category === "general" && course.requirementType === "elective");
  const english = creditSum(allGraduation, (course) => course.tags?.includes("english") ?? false);

  return {
    completedProgression,
    projectedProgression: completedProgression + plannedProgression,
    specializedRequired: specializedRequiredWithGroup,
    specializedElective,
    specializedTotal: specializedRequiredWithGroup + specializedElective,
    generalRequired,
    generalElective,
    generalTotal: generalRequired + generalElective,
    english,
    graduationTotal: creditSum(allGraduation, () => true),
  };
}
