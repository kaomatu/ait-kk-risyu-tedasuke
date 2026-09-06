import type { Dataset } from "./types";

// 開発・自動テスト専用。実際の大学資料や科目名を含めず、production buildでは読み込まない。
export const mockCatalog: Dataset = {
  datasetVersionId: "local-preview",
  status: "published",
  sourceStatus: "local_preview_only",
  program: { faculty: "情報学部", department: "情報学科", name: "サンプル専攻", code: "DEMO", entryDate: "2026-04" },
  policies: {
    termCap: 30,
    normalAnnualCap: 48,
    honorsAnnualCap: 52,
    honorsGpaThreshold: 3,
    progression: [{ toGrade: 2, minCredits: 35, minGpa: 0.5 }, { toGrade: 3, minCredits: 70 }, { toGrade: 4, minCredits: 105 }],
    graduation: { specializedRequired: 32, specializedElective: 68, specializedTotal: 100, generalRequired: 8, generalElective: 16, generalTotal: 24, english: 6, language: 8, total: 124 },
  },
  courses: [
    {
      id: "demo.P101", code: "P101", name: "基礎プログラミング", credits: 3, category: "specialized", requirementType: "required", recommendedGrade: 1, recommendedTerm: "spring",
      offerings: [{ id: "demo-P101-A", term: "spring", classCode: "A", weekday: "mon", periods: [1, 2], lottery: false }],
    },
    {
      id: "demo.P201", code: "P201", name: "応用プログラミング", credits: 3, category: "specialized", requirementType: "required", recommendedGrade: 1, recommendedTerm: "fall", hardPrerequisites: ["demo.P101"],
      offerings: [{ id: "demo-P201-A", term: "fall", classCode: "A", weekday: "tue", periods: [1, 2], lottery: false }],
    },
    {
      id: "demo.G101", code: "G101", name: "アカデミック英語", credits: 2, category: "general", requirementType: "required_elective", recommendedGrade: 1, recommendedTerm: "spring", tags: ["english", "graduation_language"],
      offerings: [{ id: "demo-G101-A", term: "spring", classCode: "A", weekday: "wed", periods: [3], lottery: true }],
    },
    {
      id: "demo.D201", code: "D201", name: "データ分析", credits: 2, category: "specialized", requirementType: "elective", recommendedGrade: 2, recommendedTerm: "spring", softPrerequisites: ["demo.P101"],
      offerings: [{ id: "demo-D201-A", term: "spring", classCode: "A", weekday: "thu", periods: [2], lottery: false }],
    },
  ],
};
