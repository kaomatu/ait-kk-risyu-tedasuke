import type { Course, Dataset, PlanItem, PlanResult, StudentProfile } from "./types";
import { slotKey } from "./types";

const isCountedForProgression = (course: Course) => course.countForProgression !== false;
const isCountedForGraduation = (course: Course) => course.countForGraduation !== false;
// 2026年度KKの総合教育科目は、必修3単位と選択必修5単位で必修欄の8単位を構成する。
const GENERAL_REQUIRED_ELECTIVE_CREDITS = 5;

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

export function canUseOffering(course: Course, offering: Course["offerings"][number], profile: StudentProfile) {
  if (offering.term !== profile.term || offering.eligibleForProgram === false) return false;
  if (!offering.rechallengeOnly) return true;
  // 不合格・未履修の再履修は修得済みではないため、そのまま登録候補にする。
  // 修得済みの再チャレンジ履修だけは、本人が明示した場合に限定する。
  return !profile.completedCourseIds.includes(course.id) || profile.rechallengeCourseIds.includes(course.id);
}

function offeringForTerm(course: Course, profile: StudentProfile) {
  return course.offerings.filter((offering) => canUseOffering(course, offering, profile));
}

/** 現在学期に開講する未修得の必修科目。画面で「必ず取りたい」に自動設定する。 */
export function autoRequiredCourseIds(dataset: Dataset, profile: StudentProfile) {
  return dataset.courses
    .filter((course) => course.requirementType === "required")
    .filter((course) => !profile.completedCourseIds.includes(course.id))
    .filter((course) => course.recommendedTerm !== "full_year" || profile.term === "spring")
    .filter((course) => {
      const availableOfferings = offeringForTerm(course, profile);
      // 正規開講は配当学年に限る。未修得者向けの再履修クラスだけは上級年次でも対象にする。
      return availableOfferings.some((offering) => offering.rechallengeOnly) || course.recommendedGrade === profile.currentGrade;
    })
    .filter((course) => offeringForTerm(course, profile).length > 0)
    .map((course) => course.id);
}

function courseReasons(course: Course, profile: StudentProfile) {
  const reasons: string[] = [];
  if (profile.completedCourseIds.includes(course.id) && !profile.rechallengeCourseIds.includes(course.id)) {
    reasons.push("すでに修得済みです。再チャレンジ履修として指定すると候補へ戻せます。");
  }
  if (course.category === "specialized" && course.recommendedGrade > profile.currentGrade && !profile.rechallengeCourseIds.includes(course.id)) {
    reasons.push(`標準履修学年（${course.recommendedGrade}年次）前の科目です。`);
  }
  if (course.recommendedTerm === "full_year" && profile.term === "fall") {
    reasons.push("通年科目は前期から履修登録します。後期から新規登録はできません。");
  }
  const missing = (course.hardPrerequisites ?? []).filter((id) => !profile.completedCourseIds.includes(id));
  if (missing.length > 0) reasons.push(`実線の前提科目が${missing.length}件、過去学期までに修得されていません。`);
  if (offeringForTerm(course, profile).length === 0) reasons.push("今学期の開講クラスがありません。");
  return reasons;
}

function priorityOf(course: Course, profile: StudentProfile): PlanItem["priority"] {
  return profile.wanted[course.id] ?? "suggested";
}

export function generatePlan(dataset: Dataset, profile: StudentProfile): PlanResult {
  const wantedIds = Object.keys(profile.wanted);
  const ranking = [...dataset.courses]
    // 履修案に入れるのは、利用者が選択した科目だけ。
    // 未修得の必修は画面側で「必ず取りたい」として wanted に自動追加されるため、
    // 配当学年・学期だけを根拠に選択必修／選択科目を勝手に追加しない。
    .filter((course) => wantedIds.includes(course.id))
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

    const candidate = offeringForTerm(course, profile).find((offering) => {
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
  const generalCompulsory = creditSum(allGraduation, (course) => course.category === "general" && course.requirementType === "required");
  const generalRequiredElective = creditSum(allGraduation, (course) => course.category === "general" && course.requirementType === "required_elective");
  const generalRequired = generalCompulsory + Math.min(generalRequiredElective, GENERAL_REQUIRED_ELECTIVE_CREDITS);
  const generalElective = creditSum(allGraduation, (course) => course.category === "general" && course.requirementType === "elective")
    + Math.max(0, generalRequiredElective - GENERAL_REQUIRED_ELECTIVE_CREDITS);
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
