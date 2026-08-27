import { createKk2026Courses } from "./kk2026Catalog";

export type Term = "spring" | "fall" | "full_year";
export type RequirementType = "required" | "required_elective" | "elective" | "non_counting";

export interface SeedOffering {
  id: string;
  term: "spring" | "fall";
  classCode: string;
  weekday: "mon" | "tue" | "wed" | "thu" | "fri";
  periods: number[];
  lottery: boolean;
  room?: string;
  instructor?: string;
  /** KK学生が選択できない開講（八草C専用・他学科受入用など）はfalse。証跡としては保持する。 */
  eligibleForProgram?: boolean;
  /** 再履修を選択した学生だけに提示する開講。 */
  rechallengeOnly?: boolean;
  /** 隔週開講。時限の衝突判定は当該時限を占有する保守的な扱いにする。 */
  alternateWeeks?: boolean;
  notes?: string;
}
export interface SeedCourse {
  id: string;
  /** 教育課程表に正式な科目コードがない場合は「資料記載コードなし」。 */
  code: string;
  officialCode?: boolean;
  name: string;
  credits: number;
  category: "specialized" | "general";
  requirementType: RequirementType;
  recommendedGrade: number;
  recommendedTerm: Term;
  tags?: string[];
  hardPrerequisites?: string[];
  softPrerequisites?: string[];
  requiredElectiveGroup?: string;
  countsTowardCreditCap?: boolean;
  countForProgression?: boolean;
  countForGraduation?: boolean;
  offerings: SeedOffering[];
}

export const kkSeedCourses: SeedCourse[] = createKk2026Courses();

export function createKkSeedDataset() {
  return {
    datasetVersionId: "ait-is-kk-entry2026-offering2026-v3",
    status: "published",
    sourceStatus: "attached_sources_reconciled_requirement_types_reviewed",
    program: {
      faculty: "情報科学部",
      department: "情報科学科",
      name: "コンピュータシステム専攻",
      code: "KK",
      entryDate: "2026-04",
    },
    policies: {
      termCap: 30,
      normalAnnualCap: 48,
      honorsAnnualCap: 52,
      honorsGpaThreshold: 3.0,
      progression: [
        { toGrade: 2, minCredits: 35, minGpa: 0.5 },
        { toGrade: 3, minCredits: 70 },
        { toGrade: 4, minCredits: 105 },
      ],
      graduation: {
        specializedRequired: 32,
        specializedElective: 68,
        specializedTotal: 100,
        generalRequired: 8,
        generalElective: 16,
        generalTotal: 24,
        english: 6,
        total: 124,
      },
    },
    courses: kkSeedCourses,
  };
}
