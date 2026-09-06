import type { Course, CourseRecommendation, Dataset, GraduationPlan, PlanItem, PlanResult, StudentProfile } from "./types";
import { slotKey } from "./types";

const isCountedForProgression = (course: Course) => course.countForProgression !== false;
const isCountedForGraduation = (course: Course) => course.countForGraduation !== false;
// 2026年度KKの総合教育科目は、必修3単位と選択必修5単位で必修欄の8単位を構成する。
const GENERAL_REQUIRED_ELECTIVE_CREDITS = 5;

export type GraduationPlanContents = Pick<GraduationPlan, "targetCourseIds" | "requiredCourseIds" | "recommendedCourseIds">;

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
      // 過年度に未修得の必修は、通常クラスであっても今期に開講していれば自動対象にする。
      // ただし、将来学年の科目を先取りすることはしない。
      return availableOfferings.some((offering) => offering.rechallengeOnly) || course.recommendedGrade <= profile.currentGrade;
    })
    .filter((course) => offeringForTerm(course, profile).length > 0)
    .map((course) => course.id);
}

/**
 * ツール3で選んだ目標科目から、実線（登録に必要）と破線（履修推奨）の関係を辿る。
 * 元データに破線関係がない時は、推測で補完せず recommendedCourseIds を空にする。
 */
export function deriveGraduationPlan(dataset: Dataset, targetCourseIds: string[]): GraduationPlanContents {
  const byId = new Map(dataset.courses.map((course) => [course.id, course]));
  const target = new Set(targetCourseIds.filter((id) => byId.has(id)));
  const required = new Set<string>();
  const recommended = new Set<string>();

  function visitHard(courseId: string, visiting: Set<string>) {
    const course = byId.get(courseId);
    if (!course || visiting.has(courseId)) return;
    const nextVisiting = new Set(visiting).add(courseId);
    for (const prerequisiteId of course.hardPrerequisites ?? []) {
      if (!byId.has(prerequisiteId) || target.has(prerequisiteId)) continue;
      required.add(prerequisiteId);
      visitHard(prerequisiteId, nextVisiting);
    }
  }

  for (const courseId of target) visitHard(courseId, new Set());

  function visitSoft(courseId: string, visiting: Set<string>) {
    const course = byId.get(courseId);
    if (!course || visiting.has(courseId)) return;
    const nextVisiting = new Set(visiting).add(courseId);
    for (const prerequisiteId of course.softPrerequisites ?? []) {
      if (!byId.has(prerequisiteId)) continue;
      if (!target.has(prerequisiteId) && !required.has(prerequisiteId)) recommended.add(prerequisiteId);
      visitSoft(prerequisiteId, nextVisiting);
    }
  }

  for (const courseId of [...target, ...required]) visitSoft(courseId, new Set());

  return {
    targetCourseIds: [...target].sort(),
    requiredCourseIds: [...required].sort(),
    recommendedCourseIds: [...recommended].sort(),
  };
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

/** ツール3の保存済み計画から、今学期に実際に登録できる科目だけをツール2へ自動選択として渡す。 */
export function autoGraduationPlanWanted(dataset: Dataset, profile: StudentProfile, plan: GraduationPlan | null): Record<string, DesiredPriority> {
  if (!plan || plan.datasetVersionId !== dataset.datasetVersionId || plan.programCode !== dataset.program.code) return {};
  const byId = new Map(dataset.courses.map((course) => [course.id, course]));
  // 今期の必修は autoRequiredCourseIds が担当する。卒業計画側で二重に表示・管理しない。
  const automaticRequired = new Set(autoRequiredCourseIds(dataset, profile));
  const result: Record<string, DesiredPriority> = {};
  const setPriority = (courseId: string, priority: DesiredPriority) => {
    const course = byId.get(courseId);
    if (!course || automaticRequired.has(courseId) || profile.completedCourseIds.includes(courseId)) return;
    // 専門科目の先取りは従来の登録判定と同じく行わない。通年科目は前期にだけ候補にする。
    if (course.category === "specialized" && course.recommendedGrade > profile.currentGrade) return;
    if (course.recommendedTerm === "full_year" && profile.term === "fall") return;
    if (courseReasons(course, profile).length > 0) return;
    result[courseId] = result[courseId] === "must" || priority === "must" ? "must" : "prefer";
  };

  plan.recommendedCourseIds.forEach((courseId) => setPriority(courseId, "prefer"));
  plan.requiredCourseIds.forEach((courseId) => setPriority(courseId, "must"));
  plan.targetCourseIds.forEach((courseId) => setPriority(courseId, "must"));
  return result;
}

type DesiredPriority = "must" | "prefer";

function priorityOf(course: Course, priorities: Map<string, DesiredPriority>): PlanItem["priority"] {
  return priorities.get(course.id) ?? "suggested";
}

type Offering = Course["offerings"][number];

function offeringSlots(offering: Offering) {
  return offering.periods.map((period) => slotKey(offering.weekday, period));
}

/**
 * 同一科目の複数クラスを含め、選択済み科目全体で重複しないクラスの組合せを探す。
 * 先に処理した科目の最初のクラスに固定せず、後から抽選科目を追加しても、
 * 必要なら既存科目を別クラスへ振り替える。
 */
function findCompatibleSchedule(courses: Course[], profile: StudentProfile, fixedAssignments = new Map<string, Offering>()): Map<string, Offering> | null {
  const candidateCourses = courses
    .map((course) => ({
      course,
      // 現在学期の必修として固定されたクラスは、空き希望より優先する。
      offerings: fixedAssignments.has(course.id)
        ? [fixedAssignments.get(course.id)!]
        : offeringForTerm(course, profile)
          .filter((offering) => !offeringSlots(offering).some((slot) => profile.hardBlockedSlots.includes(slot))),
    }))
    // 選択肢の少ない科目を先に置くと、必要な探索回数を大きく抑えられる。
    .sort((a, b) => a.offerings.length - b.offerings.length || a.course.code.localeCompare(b.course.code, "ja"));

  if (candidateCourses.some(({ offerings }) => offerings.length === 0)) return null;

  const occupied = new Set<string>();
  const assignment = new Map<string, Offering>();

  function place(index: number): boolean {
    if (index === candidateCourses.length) return true;
    const { course, offerings } = candidateCourses[index]!;
    for (const offering of offerings) {
      const slots = offeringSlots(offering);
      if (slots.some((slot) => occupied.has(slot))) continue;
      slots.forEach((slot) => occupied.add(slot));
      assignment.set(course.id, offering);
      if (place(index + 1)) return true;
      assignment.delete(course.id);
      slots.forEach((slot) => occupied.delete(slot));
    }
    return false;
  }

  return place(0) ? assignment : null;
}

/**
 * 「取りたい科目」と将来目標から、未修得の実線前提科目を再帰的に取り出す。
 * 必ず取りたい科目からの前提は必須扱い、それ以外からの前提は希望扱いにする。
 */
export function prerequisitePriorities(dataset: Dataset, profile: StudentProfile) {
  const byId = new Map(dataset.courses.map((course) => [course.id, course]));
  const priorities = new Map<string, DesiredPriority>();

  function stronger(existing: DesiredPriority | undefined, next: DesiredPriority) {
    return existing === "must" || next === "must" ? "must" : "prefer";
  }

  function visit(courseId: string, priority: DesiredPriority, visiting: Set<string>) {
    const course = byId.get(courseId);
    if (!course || visiting.has(courseId)) return;
    const nextVisiting = new Set(visiting).add(courseId);
    for (const prerequisiteId of course.hardPrerequisites ?? []) {
      if (profile.completedCourseIds.includes(prerequisiteId)) continue;
      const previous = priorities.get(prerequisiteId);
      const inherited = stronger(previous, priority);
      if (previous !== inherited) priorities.set(prerequisiteId, inherited);
      visit(prerequisiteId, inherited, nextVisiting);
    }
  }

  for (const [courseId, priority] of Object.entries(profile.wanted)) visit(courseId, priority, new Set());
  // 旧保存データを読み込んだ直後でも安全に扱えるよう、未定義は空配列として扱う。
  for (const courseId of profile.futureGoalCourseIds ?? []) visit(courseId, "prefer", new Set());
  return priorities;
}

/** 今期に実際に履修案へ追加できる、先修条件由来の科目だけを返す。 */
export function effectiveWantedPriorities(dataset: Dataset, profile: StudentProfile) {
  const priorities = new Map<string, DesiredPriority>(Object.entries(profile.wanted));
  const derived = prerequisitePriorities(dataset, profile);
  for (const [courseId, priority] of derived) {
    if (priorities.has(courseId)) continue;
    const course = dataset.courses.find((item) => item.id === courseId);
    // 実線前提は同時履修できないため、前提科目自身が既に履修可能な場合だけ今期案へ足す。
    if (course && courseReasons(course, profile).length === 0) priorities.set(courseId, priority);
  }
  return priorities;
}

function automaticRequiredAssignments(dataset: Dataset, profile: StudentProfile) {
  const automaticCourses = profile.autoRequiredCourseIds
    .map((id) => dataset.courses.find((course) => course.id === id))
    .filter((course): course is Course => Boolean(course))
    .filter((course) => courseReasons(course, profile).length === 0);
  // 必修同士の時間割を確定する時点では、利用者の空き希望は適用しない。
  return findCompatibleSchedule(automaticCourses, { ...profile, hardBlockedSlots: [] });
}

/** 自動選択された必修が使う時限。空けたい時限には指定できない。 */
export function requiredScheduleSlots(dataset: Dataset, profile: StudentProfile) {
  const assignments = automaticRequiredAssignments(dataset, profile);
  return assignments ? [...assignments.values()].flatMap((offering) => offeringSlots(offering)) : [];
}

export function generatePlan(dataset: Dataset, profile: StudentProfile): PlanResult {
  const wantedIds = Object.keys(profile.wanted);
  const effectivePriorities = effectiveWantedPriorities(dataset, profile);
  const automaticIds = new Set(profile.autoRequiredCourseIds);
  const fixedRequiredAssignments = automaticRequiredAssignments(dataset, profile) ?? new Map<string, Offering>();
  const ranking = [...dataset.courses]
    // 履修案に入れるのは、利用者が選択した科目だけ。
    // 未修得の必修は画面側で「必ず取りたい」として wanted に自動追加されるため、
    // 配当学年・学期だけを根拠に選択必修／選択科目を勝手に追加しない。
    .filter((course) => effectivePriorities.has(course.id))
    .sort((a, b) => {
      const score = (course: Course) => automaticIds.has(course.id) ? 4 : priorityOf(course, effectivePriorities) === "must" ? 3 : 2;
      return score(b) - score(a) || a.code.localeCompare(b.code, "ja");
    });

  const selected: PlanItem[] = [];
  const rejected: PlanResult["rejected"] = [];
  let capCredits = 0;
  const annualCap = activeAnnualCap(dataset, profile);

  for (const course of ranking) {
    const initialReasons = courseReasons(course, profile);
    if (initialReasons.length) {
      if (wantedIds.includes(course.id)) rejected.push({ course, reasons: initialReasons });
      continue;
    }

    const coursesToSchedule = [...selected.map((item) => item.course), course];
    const assignment = findCompatibleSchedule(coursesToSchedule, profile, fixedRequiredAssignments);
    if (!assignment) {
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

    // 組合せ探索で選ばれたクラスを、すでに採用済みの科目にも反映する。
    selected.splice(0, selected.length, ...coursesToSchedule.map((scheduledCourse) => ({
      course: scheduledCourse,
      offering: assignment.get(scheduledCourse.id)!,
      priority: priorityOf(scheduledCourse, effectivePriorities),
    })));
    capCredits += currentTermCredits;
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

/**
 * 目標単位に届かない時の候補。候補は表示だけで、履修案には自動追加しない。
 * 既に組めた履修案を崩さずに追加できる科目だけに限定する。
 */
export function recommendCourses(dataset: Dataset, profile: StudentProfile, plan: PlanResult): CourseRecommendation[] {
  const target = profile.targetTermCredits;
  const plannedCredits = plan.selected.reduce((sum, item) => sum + item.course.credits, 0);
  if (target === null || !Number.isFinite(target) || plannedCredits >= target) return [];

  const futurePrerequisites = prerequisitePriorities(dataset, { ...profile, wanted: {}, autoRequiredCourseIds: [] });
  const progress = calculateProgress(dataset, profile, plan);
  const selectedIds = new Set(plan.selected.map((item) => item.course.id));
  const effectiveWanted = effectiveWantedPriorities(dataset, profile);

  return dataset.courses
    .filter((course) => !profile.completedCourseIds.includes(course.id))
    .filter((course) => !effectiveWanted.has(course.id))
    .filter((course) => courseReasons(course, profile).length === 0)
    .map((course) => {
      const trial = generatePlan(dataset, {
        ...profile,
        wanted: { ...profile.wanted, [course.id]: "prefer" },
      });
      const trialItem = trial.selected.find((item) => item.course.id === course.id);
      // 既存の履修案を失わず、この候補そのものも選べた時だけ採用する。
      if (!trialItem || ![...selectedIds].every((id) => trial.selected.some((item) => item.course.id === id))) return null;

      const reasons: string[] = [];
      let score = 0;
      if (futurePrerequisites.has(course.id)) {
        reasons.push("将来の目標科目につながる先修条件です");
        score += 100;
      }
      if (course.requirementType === "required_elective") {
        reasons.push("選択必修として要件に役立ちます");
        score += 35;
      }
      if (course.tags?.includes("english") && progress.english < dataset.policies.graduation.english) {
        reasons.push("英語系の卒業要件を補えます");
        score += 30;
      }
      if (course.tags?.includes("graduation_language") && progress.language < dataset.policies.graduation.language) {
        reasons.push("言語系（8単位）の卒業要件を補えます");
        score += 30;
      }
      if (course.category === "specialized" && course.recommendedGrade === profile.currentGrade) {
        reasons.push("現在の学年に配当された専門科目です");
        score += 15;
      }
      if (!trialItem.offering.lottery) score += 5;
      if (reasons.length === 0) reasons.push("今学期に無理なく追加できる開講科目です");
      return { course, offering: trialItem.offering, reasons, score };
    })
    .filter((item): item is (CourseRecommendation & { score: number }) => item !== null)
    .sort((a, b) => b.score - a.score || a.course.code.localeCompare(b.course.code, "ja"))
    .slice(0, 6)
    .map(({ course, offering, reasons }) => ({ course, offering, reasons }));
}

function calculateCreditProgress(dataset: Dataset, profile: StudentProfile, planned: Course[]) {
  const completed = dataset.courses.filter((course) => profile.completedCourseIds.includes(course.id));
  // 再チャレンジ履修は上限には算入するが、同じ単位を要件へ二重計上しない。
  const uncompletedPlanned = planned.filter((course) => !profile.completedCourseIds.includes(course.id));
  const creditSum = (courses: Course[], predicate: (course: Course) => boolean) => courses.filter(predicate).reduce((sum, course) => sum + course.credits, 0);
  const completedProgression = creditSum(completed, isCountedForProgression);
  const plannedProgression = creditSum(uncompletedPlanned, isCountedForProgression);
  const allGraduation = [...completed, ...uncompletedPlanned].filter(isCountedForGraduation);
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
  const language = creditSum(allGraduation, (course) => course.tags?.includes("graduation_language") ?? false);

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
    language,
    graduationTotal: creditSum(allGraduation, () => true),
  };
}

/** 修得済み科目と、今学期の履修案を合算した進級・卒業要件の概算。 */
export function calculateProgress(dataset: Dataset, profile: StudentProfile, plan: PlanResult | null) {
  return calculateCreditProgress(dataset, profile, plan?.selected.map((item) => item.course) ?? []);
}

/** 修得済み科目と、ツール3の卒業計画全体を合算した長期要件の概算。 */
export function calculateGraduationPlanProgress(dataset: Dataset, profile: StudentProfile, plan: GraduationPlanContents | null) {
  if (!plan) return calculateCreditProgress(dataset, profile, []);
  const plannedIds = new Set([
    ...plan.targetCourseIds,
    ...plan.requiredCourseIds,
    ...plan.recommendedCourseIds,
  ]);
  return calculateCreditProgress(dataset, profile, dataset.courses.filter((course) => plannedIds.has(course.id)));
}
