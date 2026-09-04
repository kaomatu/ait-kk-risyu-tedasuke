export type Term = "spring" | "fall" | "full_year";
export type ActiveTerm = "spring" | "fall";
export type RequirementType = "required" | "required_elective" | "elective" | "non_counting";
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri";

export interface Offering {
  id: string;
  term: ActiveTerm;
  classCode: string;
  weekday: Weekday;
  periods: number[];
  lottery: boolean;
  room?: string;
  instructor?: string;
  /** false は資料には載るがKK学生が選べない開講（八草C専用・他学科受入用など）。 */
  eligibleForProgram?: boolean;
  /** 再チャレンジ履修として指定した学生だけが選べる再履修クラス。 */
  rechallengeOnly?: boolean;
  /** 隔週開講。時間割上は該当時限を使用するものとして扱う。 */
  alternateWeeks?: boolean;
  notes?: string;
}

export interface Course {
  id: string;
  code: string;
  /** false のコードは資料内に公式コードがなく、内部識別子であることを示す。 */
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
  /** 選択必修を「最初の1科目は必修、以降は選択」と集計するための科目群ID。 */
  requiredElectiveGroup?: string;
  /** false の科目は学期・年間の履修上限に算入しない。単位要件への算入とは別に管理する。 */
  countsTowardCreditCap?: boolean;
  countForProgression?: boolean;
  countForGraduation?: boolean;
  offerings: Offering[];
}

export interface Dataset {
  datasetVersionId: string;
  status: "published" | string;
  sourceStatus: string;
  program: {
    faculty: string;
    department: string;
    name: string;
    code: string;
    entryDate: string;
  };
  policies: {
    termCap: number;
    normalAnnualCap: number;
    honorsAnnualCap: number;
    honorsGpaThreshold: number;
    progression: Array<{ toGrade: number; minCredits: number; minGpa?: number }>;
    graduation: {
      specializedRequired: number;
      specializedElective: number;
      specializedTotal: number;
      generalRequired: number;
      generalElective: number;
      generalTotal: number;
      english: number;
      total: number;
    };
  };
  courses: Course[];
}

export interface StudentProfile {
  currentGrade: number;
  term: ActiveTerm;
  gpa: number | null;
  annualCapBonusLocked: boolean;
  completedCourseIds: string[];
  wanted: Record<string, "must" | "prefer">;
  /** 今学期に開講しない科目も含む、中長期の履修目標。 */
  futureGoalCourseIds: string[];
  /** 今学期に履修したい単位数。未入力時は推薦を出さない。 */
  targetTermCredits: number | null;
  /** 現在の学期に開講する未修得必修として、ツールが自動で「必ず取りたい」にした科目。 */
  autoRequiredCourseIds: string[];
  /** ツール3で保存した卒業計画から、今学期に自動選択した科目と優先度。手動の希望と区別して管理する。 */
  autoGraduationPlanWanted: Record<string, "must" | "prefer">;
  rechallengeCourseIds: string[];
  lotteryStates: Record<string, "none" | "applied" | "lost" | "won">;
  hardBlockedSlots: string[];
  softBlockedSlots: string[];
  annualRegisteredCredits: number;
}

/** ツール3で保存する、卒業までの科目目標。各IDはCourse.idを参照する。 */
export interface GraduationPlan {
  schemaVersion: 1;
  datasetVersionId: string;
  programCode: string;
  /** 利用者が卒業までに取りたい・やりたい科目として選んだ科目。 */
  targetCourseIds: string[];
  /** targetCourseIds を履修するために、実線の先修条件から再帰的に求めた科目。 */
  requiredCourseIds: string[];
  /** targetCourseIds につながる、破線の推奨順序から再帰的に求めた科目。 */
  recommendedCourseIds: string[];
  savedAt: string;
}

/** 番号付きで保存する履修計画の一覧用メタデータ。 */
export interface ProfileSnapshotSummary {
  snapshotNo: number;
  savedAt: string;
}

/** 読み込み時に使う、入力内容を含む番号付き履修計画。 */
export interface ProfileSnapshot extends ProfileSnapshotSummary {
  profile: StudentProfile;
}

export interface PlanItem {
  course: Course;
  offering: Offering;
  priority: "must" | "prefer" | "suggested";
}

/** 目標単位に届かない場合に、利用者が追加を判断するための候補。自動登録はしない。 */
export interface CourseRecommendation {
  course: Course;
  offering: Offering;
  reasons: string[];
}

export interface RejectedCourse {
  course: Course;
  reasons: string[];
}

export interface PlanResult {
  selected: PlanItem[];
  rejected: RejectedCourse[];
  warnings: string[];
  capCountedCredits: number;
  lotteryCredits: number;
}

export const weekdayLabels: Record<Weekday, string> = {
  mon: "月",
  tue: "火",
  wed: "水",
  thu: "木",
  fri: "金",
};

export const termLabels: Record<ActiveTerm, string> = {
  spring: "前期",
  fall: "後期",
};

export function slotKey(weekday: Weekday, period: number) {
  return `${weekday}-${period}`;
}
