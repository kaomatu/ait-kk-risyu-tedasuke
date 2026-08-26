export type Term = "spring" | "fall" | "full_year";
export type RequirementType = "required" | "required_elective" | "elective" | "non_counting";

export interface SeedCourse {
  id: string;
  code: string;
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
  offerings: Array<{
    id: string;
    term: "spring" | "fall";
    classCode: string;
    weekday: "mon" | "tue" | "wed" | "thu" | "fri";
    periods: number[];
    lottery: boolean;
    room?: string;
    instructor?: string;
  }>;
}

const specialized = (
  code: string,
  name: string,
  credits: number,
  requirementType: RequirementType,
  recommendedGrade: number,
  recommendedTerm: Term,
  offerings: SeedCourse["offerings"] = [],
  hardPrerequisites: string[] = [],
  softPrerequisites: string[] = [],
  requiredElectiveGroup?: string,
): SeedCourse => ({
  id: `ait.kk.${code}`,
  code,
  name,
  credits,
  category: "specialized",
  requirementType,
  recommendedGrade,
  recommendedTerm,
  offerings,
  hardPrerequisites,
  softPrerequisites,
  ...(requiredElectiveGroup ? { requiredElectiveGroup } : {}),
});

const general = (
  code: string,
  name: string,
  credits: number,
  requirementType: RequirementType,
  recommendedGrade: number,
  recommendedTerm: Term,
  tags: string[] = [],
  offerings: SeedCourse["offerings"] = [],
  countForProgression = true,
  countForGraduation = true,
): SeedCourse => ({
  id: `ait.general.${code}`,
  code,
  name,
  credits,
  category: "general",
  requirementType,
  recommendedGrade,
  recommendedTerm,
  tags,
  offerings,
  countForProgression,
  countForGraduation,
});

export const kkSeedCourses: SeedCourse[] = [
  specialized("K1017", "コンピュータリテラシ", 2, "required", 1, "spring", [
    { id: "2026-spring-K1017-11", term: "spring", classCode: "11", weekday: "mon", periods: [1], lottery: false, room: "14-301" },
    { id: "2026-spring-K1017-21", term: "spring", classCode: "21", weekday: "mon", periods: [1], lottery: false, room: "14-302" },
  ]),
  specialized("K1003", "プログラミング及び演習Ⅰ", 3, "required", 1, "spring", [
    { id: "2026-spring-K1003-11", term: "spring", classCode: "11", weekday: "thu", periods: [1, 2], lottery: false, room: "1-502" },
    { id: "2026-spring-K1003-21", term: "spring", classCode: "21", weekday: "thu", periods: [1, 2], lottery: false, room: "14-201" },
  ]),
  specialized("K2022", "プログラミング及び演習Ⅱ", 3, "required", 1, "fall", [
    { id: "2026-fall-K2022-11", term: "fall", classCode: "11", weekday: "thu", periods: [1, 2], lottery: false, room: "14-301" },
    { id: "2026-fall-K2022-21", term: "fall", classCode: "21", weekday: "thu", periods: [1, 2], lottery: false, room: "14-201" },
  ], ["ait.kk.K1003"]),
  specialized("K1005", "情報数学Ⅰ", 2, "required", 1, "spring", [
    { id: "2026-spring-K1005-11", term: "spring", classCode: "11", weekday: "wed", periods: [2], lottery: false, room: "14-301" },
    { id: "2026-spring-K1005-21", term: "spring", classCode: "21", weekday: "wed", periods: [2], lottery: false, room: "14-302" },
  ]),
  specialized("K2016", "情報数学Ⅱ", 2, "elective", 1, "fall", [
    { id: "2026-fall-K2016-11", term: "fall", classCode: "11", weekday: "wed", periods: [3], lottery: false, room: "14-301" },
    { id: "2026-fall-K2016-21", term: "fall", classCode: "21", weekday: "wed", periods: [3], lottery: false, room: "14-302" },
  ], ["ait.kk.K1005"]),
  specialized("K1020", "データサイエンス基礎数理", 2, "required", 1, "spring", [
    { id: "2026-spring-K1020-11", term: "spring", classCode: "11", weekday: "thu", periods: [3], lottery: false, room: "G2311" },
    { id: "2026-spring-K1020-21", term: "spring", classCode: "21", weekday: "thu", periods: [3], lottery: false, room: "G2209" },
  ]),
  specialized("K1019", "物理学（力学）", 2, "elective", 1, "spring"),
  specialized("K2087", "物理学（電磁気学）", 2, "elective", 1, "fall"),
  specialized("K2058", "微分積分Ⅰ", 2, "elective", 1, "spring"),
  specialized("K2059", "微分積分Ⅱ", 2, "elective", 1, "fall", [], ["ait.kk.K2058"]),
  specialized("K2060", "線形代数Ⅰ", 2, "elective", 1, "spring"),
  specialized("K2061", "線形代数Ⅱ", 2, "elective", 1, "fall", [], ["ait.kk.K2060"]),
  specialized("K2062", "確率統計Ⅰ", 2, "elective", 2, "spring"),
  specialized("K2063", "幾何学", 2, "elective", 2, "spring"),
  specialized("K2049", "人工知能", 2, "elective", 2, "fall", [
    { id: "2026-fall-K2049-X1", term: "fall", classCode: "X1", weekday: "wed", periods: [3], lottery: false, room: "G2210" },
  ], ["ait.kk.K1003"]),
  specialized("K2090", "オペレーティングシステム", 2, "elective", 2, "spring"),
  specialized("K2071", "情報システム概論", 2, "elective", 2, "fall", [
    { id: "2026-fall-K2071-X1", term: "fall", classCode: "X1", weekday: "wed", periods: [4], lottery: false, room: "G2210" },
  ]),
  specialized("K1007", "コンピュータネットワーク", 2, "elective", 2, "fall", [
    { id: "2026-fall-K1007-X1", term: "fall", classCode: "X1", weekday: "wed", periods: [4], lottery: false, room: "1-502" },
  ]),
  specialized("K2088", "アルゴリズムとデータ構造", 2, "elective", 2, "spring", [], ["ait.kk.K1003"]),
  specialized("K2089", "アルゴリズムとデータ構造演習", 1, "elective", 2, "spring", [], ["ait.kk.K2088"]),
  specialized("K2035", "論理回路", 2, "elective", 2, "spring"),
  specialized("K2044", "数値計算", 2, "elective", 2, "fall", [
    { id: "2026-fall-K2044-X1", term: "fall", classCode: "X1", weekday: "tue", periods: [4], lottery: false, room: "1-501" },
  ]),
  specialized("K2065", "オブジェクト指向プログラミング及び演習Ⅰ", 3, "elective", 2, "fall", [
    { id: "2026-fall-K2065-X1", term: "fall", classCode: "X1", weekday: "thu", periods: [3, 4], lottery: false, room: "1-501" },
  ], ["ait.kk.K2022"]),
  specialized("K2066", "オブジェクト指向プログラミング及び演習Ⅱ", 3, "elective", 3, "spring", [
    { id: "2026-spring-K2066-X1", term: "spring", classCode: "X1", weekday: "thu", periods: [1, 2], lottery: false, room: "1-401" },
  ], ["ait.kk.K2065"]),
  specialized("K3001", "ネットワーク及び演習", 3, "required_elective", 3, "spring", [
    { id: "2026-spring-K3001-X1", term: "spring", classCode: "X1", weekday: "thu", periods: [1, 2], lottery: false, room: "14-302" },
  ], ["ait.kk.K1007"], [], "kk-2026-star2"),
  specialized("K3002", "Ｗｅｂプログラミング及び演習", 3, "required_elective", 3, "fall", [
    { id: "2026-fall-K3002-X1", term: "fall", classCode: "X1", weekday: "thu", periods: [1, 2], lottery: false, room: "14-302" },
  ], ["ait.kk.K2022"], [], "kk-2026-star2"),
  specialized("K3003", "組み込みプログラミング及び演習", 3, "required_elective", 3, "spring", [
    { id: "2026-spring-K3003-X1", term: "spring", classCode: "X1", weekday: "thu", periods: [3, 4], lottery: false, room: "1-502" },
  ], ["ait.kk.K2022"], [], "kk-2026-star2"),
  specialized("K3004", "マイコン制御及び演習", 3, "required_elective", 3, "spring", [
    { id: "2026-spring-K3004-X1", term: "spring", classCode: "X1", weekday: "thu", periods: [1, 2], lottery: false, room: "マイコン第1" },
  ], ["ait.kk.K2035"], [], "kk-2026-star2"),
  specialized("K1015", "組み込みシステム概論", 2, "elective", 3, "spring"),
  specialized("K2091", "情報セキュリティ", 2, "elective", 3, "fall", [
    { id: "2026-fall-K2091-X1", term: "fall", classCode: "X1", weekday: "thu", periods: [3], lottery: false, room: "14-301" },
  ]),
  specialized("K2095", "ソフトウェア工学Ⅰ", 2, "elective", 3, "spring"),
  specialized("K2037", "ソフトウェア工学Ⅱ", 2, "elective", 3, "fall"),
  specialized("K2068", "コンピュータアーキテクチャⅠ", 2, "elective", 3, "spring"),
  specialized("K2069", "コンピュータアーキテクチャⅡ", 2, "elective", 3, "fall"),
  specialized("K2118", "システム制御", 2, "elective", 3, "fall", [
    { id: "2026-fall-K2118-X1", term: "fall", classCode: "X1", weekday: "mon", periods: [2], lottery: false, room: "1-502" },
  ]),
  specialized("K3084", "プロジェクト演習Ⅰ", 1, "elective", 3, "fall", [
    { id: "2026-fall-K3084-X1", term: "fall", classCode: "X1", weekday: "tue", periods: [5], lottery: false, room: "14-202" },
  ]),
  specialized("K2085", "プロジェクト演習Ⅱ", 1, "elective", 4, "spring"),
  specialized("K1018", "卒業研究", 4, "required", 4, "full_year"),
  general("G1829", "コミュニカティブイングリッシュＡ", 1, "required", 1, "spring", ["english"], [
    { id: "2026-spring-G1829-A1", term: "spring", classCode: "A1", weekday: "tue", periods: [1], lottery: false },
  ]),
  general("G1830", "コミュニカティブイングリッシュＢ", 1, "required", 1, "fall", ["english"]),
  general("G1831", "コミュニカティブイングリッシュＣ", 1, "required", 1, "spring", ["english"]),
  general("G3832", "ＴＯＥＩＣ・視聴覚英語Ａ", 1, "required_elective", 2, "spring", ["english"], [
    { id: "2026-spring-G3832-A1", term: "spring", classCode: "A1", weekday: "mon", periods: [1], lottery: true },
  ]),
  general("G3833", "ＴＯＥＩＣ・視聴覚英語Ｂ", 1, "required_elective", 2, "fall", ["english"], [
    { id: "2026-fall-G3833-A2", term: "fall", classCode: "A2", weekday: "mon", periods: [1], lottery: true },
  ]),
  general("G2834", "英語圏のことばと文化Ａ", 2, "elective", 2, "spring", ["english"], [
    { id: "2026-spring-G2834-A1", term: "spring", classCode: "A1", weekday: "mon", periods: [3], lottery: true },
  ]),
  general("G2038", "人間性の探究", 2, "elective", 1, "spring", [], [
    { id: "2026-spring-G2038-A1", term: "spring", classCode: "A1", weekday: "wed", periods: [1], lottery: true },
  ]),
  general("G2010", "健康の科学", 2, "elective", 1, "spring", [], [
    { id: "2026-spring-G2010-A1", term: "spring", classCode: "A1", weekday: "wed", periods: [4], lottery: true },
  ]),
  general("G2048", "日本国憲法", 2, "elective", 1, "spring", [], [
    { id: "2026-spring-G2048-B1", term: "spring", classCode: "B1", weekday: "thu", periods: [1], lottery: true },
  ]),
  general("G2828", "健康・スポーツ科学実習Ⅰ", 1, "elective", 1, "spring", [], [
    { id: "2026-spring-G2828-X5", term: "spring", classCode: "X5", weekday: "fri", periods: [4], lottery: false },
  ]),
  general("G2009", "健康・スポーツ科学実習Ⅱ", 1, "elective", 1, "fall", [], [
    { id: "2026-fall-G2009-X5", term: "fall", classCode: "X5", weekday: "fri", periods: [4], lottery: false },
  ]),
  general("G2823", "日本語コミュニケーション", 2, "non_counting", 1, "spring", [], [
    { id: "2026-spring-G2823-X1", term: "spring", classCode: "X1", weekday: "thu", periods: [5], lottery: false },
  ], false, false),
];

export function createKkSeedDataset() {
  return {
    datasetVersionId: "ait-is-kk-entry2026-offering2026-v1",
    status: "published",
    sourceStatus: "initial_seed_requires_tool1_review",
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
