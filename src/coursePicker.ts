import { canUseOffering } from "./planEngine";
import type { Course, StudentProfile } from "./types";

export type CoursePickerTermScope = "current" | "all";

export interface CoursePickerFilters {
  grade: number;
  termScope: CoursePickerTermScope;
  query: string;
  /** 今期外の将来目標・自動選択済み科目を、絞り込み中にも見失わないためのID。 */
  selectedCourseIds: string[];
}

/**
 * COURSE PICKER の「選択済み」欄に表示する科目を返す。
 *
 * autoGraduationPlanWanted は「ツール3から自動で追加した理由」を表す補助情報であり、
 * 選択中かどうかの根拠にはしない。実際の選択状態は wanted / futureGoalCourseIds /
 * autoRequiredCourseIds だけで決める。これにより、利用者が自動追加の科目を解除した後に
 * 選択済み欄へ残り続けることを防ぐ。
 */
export function selectedPlannerCourseIds(profile: StudentProfile) {
  return Array.from(new Set([
    ...Object.keys(profile.wanted),
    ...profile.futureGoalCourseIds,
    ...profile.autoRequiredCourseIds,
  ]));
}

/**
 * 今期に開講する科目の選択状態を「できれば」→「必ず」→解除で切り替える。
 * 自動選択された科目でも、利用者が操作した時点で自動選択の補助情報を外す。
 * 必修の固定科目は呼び出し側で操作不可としている。
 */
export function cycleCurrentTermCourseIntent(profile: StudentProfile, courseId: string) {
  const wanted = { ...profile.wanted };
  const current = wanted[courseId];
  if (!current) wanted[courseId] = "prefer";
  else if (current === "prefer") wanted[courseId] = "must";
  else delete wanted[courseId];

  const autoGraduationPlanWanted = { ...(profile.autoGraduationPlanWanted ?? {}) };
  delete autoGraduationPlanWanted[courseId];

  return {
    wanted,
    futureGoalCourseIds: profile.futureGoalCourseIds.filter((id) => id !== courseId),
    autoGraduationPlanWanted,
  };
}

/** 今期外の科目を将来目標として追加・解除する。 */
export function cycleFutureCourseIntent(profile: StudentProfile, courseId: string) {
  const futureGoalCourseIds = profile.futureGoalCourseIds.includes(courseId)
    ? profile.futureGoalCourseIds.filter((id) => id !== courseId)
    : [...profile.futureGoalCourseIds, courseId];
  const autoGraduationPlanWanted = { ...(profile.autoGraduationPlanWanted ?? {}) };
  delete autoGraduationPlanWanted[courseId];
  return { futureGoalCourseIds, autoGraduationPlanWanted };
}

/**
 * 「この年次で選択済み」の時間割プレビュー専用のプロフィールを作る。
 * 一覧にある今期開講科目だけを仮配置し、別年次の選択や将来目標の先修条件を
 * 混ぜない。実際の履修案を生成するときのプロフィールは変更しない。
 */
export function profileForPickerSchedulePreview(profile: StudentProfile, courseIds: string[]): StudentProfile {
  const selected = new Set(courseIds);
  return {
    ...profile,
    wanted: Object.fromEntries(Object.entries(profile.wanted).filter(([id]) => selected.has(id))),
    futureGoalCourseIds: [],
    autoRequiredCourseIds: profile.autoRequiredCourseIds.filter((id) => selected.has(id)),
    autoGraduationPlanWanted: Object.fromEntries(Object.entries(profile.autoGraduationPlanWanted ?? {}).filter(([id]) => selected.has(id))),
  };
}

/**
 * ツール2の科目選択欄に表示する科目を返す。
 * 通常は「今期に開講する、指定年次の科目」へ絞る。科目名・コードを入力した
 * 検索中は、学年・配当学期を問わずカタログ全体から一致する科目を返す。
 * すでに選んだ科目は検索語に一致しなくても上部に残し、選択解除を可能にする。
 */
export function filterPlannerCoursePicker(courses: Course[], profile: StudentProfile, filters: CoursePickerFilters) {
  const selected = new Set(filters.selectedCourseIds);
  const normalizedQuery = filters.query.trim().toLocaleLowerCase("ja-JP");
  const isSearching = normalizedQuery.length > 0;

  return courses
    .filter((course) => isSearching || course.recommendedGrade === filters.grade)
    .filter((course) => isSearching || filters.termScope === "all"
      || selected.has(course.id)
      || course.offerings.some((offering) => canUseOffering(course, offering, profile)))
    .filter((course) => selected.has(course.id) || !isSearching || `${course.code} ${course.name}`.toLocaleLowerCase("ja-JP").includes(normalizedQuery))
    .sort((a, b) => a.category.localeCompare(b.category) || a.code.localeCompare(b.code, "ja"));
}
