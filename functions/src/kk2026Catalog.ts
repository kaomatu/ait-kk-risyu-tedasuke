import type { RequirementType, SeedCourse, Term } from "./seed";
import { lotteryOfferingLedger, normalOfferingLedger } from "./kk2026Ledgers";

type CourseDefinition = Omit<SeedCourse, "offerings"> & { aliases?: string[] };
type RawOffering = SeedCourse["offerings"][number];

const weekdays: Record<string, RawOffering["weekday"]> = {
  月: "mon", 火: "tue", 水: "wed", 木: "thu", 金: "fri",
};

const periodNumbers: Record<string, number> = { I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6 };

function specialized(
  code: string,
  name: string,
  credits: number,
  requirementType: RequirementType,
  recommendedGrade: number,
  recommendedTerm: Term,
  options: Pick<CourseDefinition, "hardPrerequisites" | "softPrerequisites" | "requiredElectiveGroup" | "countsTowardCreditCap" | "countForProgression" | "countForGraduation" | "aliases"> = {},
): CourseDefinition {
  return {
    id: `ait.kk.${code}`,
    code,
    name,
    credits,
    category: "specialized",
    requirementType,
    recommendedGrade,
    recommendedTerm,
    ...options,
  };
}

function general(
  code: string,
  name: string,
  credits: number,
  requirementType: RequirementType,
  tags: string[] = [],
  options: Pick<CourseDefinition, "hardPrerequisites" | "softPrerequisites" | "countsTowardCreditCap" | "countForProgression" | "countForGraduation" | "aliases"> = {},
): CourseDefinition {
  return {
    id: `ait.general.${code}`,
    code,
    name,
    credits,
    category: "general",
    requirementType,
    recommendedGrade: 1,
    recommendedTerm: "spring",
    tags,
    ...options,
  };
}

/** 教育課程表（116〜117頁）を科目マスタとして転記した一覧。 */
const curriculumCourses: CourseDefinition[] = [
  specialized("K1021", "情報社会及び情報倫理", 2, "required", 1, "spring"),
  specialized("K1022", "キャリアデザインⅠ", 2, "required", 1, "spring"),
  specialized("K1023", "キャリア意識形成", 2, "required", 2, "fall", { hardPrerequisites: ["ait.kk.K1022"] }),
  specialized("K2113", "キャリアデザインⅡ", 2, "elective", 3, "fall", { hardPrerequisites: ["ait.kk.K1023"] }),
  specialized("K2114", "経済基礎知識", 2, "elective", 3, "spring"),
  specialized("K2115", "知的財産権", 2, "elective", 3, "fall"),
  specialized("K2116", "情報と職業", 2, "elective", 3, "fall"),
  specialized("K2117", "インターンシップ", 2, "elective", 2, "fall", { countsTowardCreditCap: false }),
  specialized("K1020", "データサイエンス基礎数理", 2, "required", 1, "spring"),
  specialized("K2058", "微分積分Ⅰ", 2, "elective", 1, "spring"),
  specialized("K2059", "微分積分Ⅱ", 2, "elective", 1, "fall", { hardPrerequisites: ["ait.kk.K2058"] }),
  specialized("K2060", "線形代数Ⅰ", 2, "elective", 1, "spring"),
  specialized("K2061", "線形代数Ⅱ", 2, "elective", 1, "fall", { hardPrerequisites: ["ait.kk.K2060"] }),
  specialized("K2062", "確率統計Ⅰ", 2, "elective", 2, "fall"),
  specialized("K2063", "幾何学", 2, "elective", 2, "fall"),
  specialized("K1019", "物理学（力学）", 2, "required", 1, "fall"),
  specialized("K2087", "物理学（電磁気学）", 2, "elective", 2, "spring", { hardPrerequisites: ["ait.kk.K1019"] }),
  specialized("K1013", "物理実験", 2, "elective", 2, "fall"),
  specialized("K1005", "情報数学Ⅰ", 2, "required", 1, "spring"),
  specialized("K2016", "情報数学Ⅱ", 2, "elective", 1, "fall", { hardPrerequisites: ["ait.kk.K1005"] }),
  specialized("K2094", "コンピュータ概論", 2, "elective", 1, "spring"),
  specialized("K2049", "人工知能", 2, "elective", 2, "spring"),
  specialized("K2090", "オペレーティングシステム", 2, "elective", 2, "fall"),
  specialized("K3005", "データベース及び演習", 3, "elective", 3, "spring"),
  specialized("K2071", "情報システム概論", 2, "elective", 2, "fall"),
  specialized("K2076", "ＣＡＤ及び演習Ⅰ", 3, "elective", 2, "fall", { aliases: ["CAD及び演習Ⅰ"] }),
  specialized("K2119", "マルチメディア情報処理及び演習Ⅰ", 3, "elective", 3, "spring"),
  specialized("K1017", "コンピュータリテラシ", 2, "required", 1, "spring"),
  specialized("K1003", "プログラミング及び演習Ⅰ", 3, "required", 1, "spring"),
  specialized("K2022", "プログラミング及び演習Ⅱ", 3, "elective", 1, "fall", { hardPrerequisites: ["ait.kk.K1003"] }),
  specialized("K2088", "アルゴリズムとデータ構造", 2, "elective", 3, "spring"),
  specialized("K2089", "アルゴリズムとデータ構造演習", 1, "elective", 3, "spring"),
  specialized("K1007", "コンピュータネットワーク", 2, "elective", 2, "spring"),
  specialized("K2070", "モバイルネットワーク", 2, "elective", 2, "fall", { hardPrerequisites: ["ait.kk.K1007"] }),
  specialized("K3001", "ネットワーク及び演習", 3, "required_elective", 3, "spring", { requiredElectiveGroup: "kk-2026-star2" }),
  specialized("K2091", "情報セキュリティ", 2, "elective", 3, "spring", { hardPrerequisites: ["ait.kk.K2070"] }),
  specialized("K3002", "Ｗｅｂプログラミング及び演習", 3, "required_elective", 3, "fall", { requiredElectiveGroup: "kk-2026-star2", aliases: ["Webプログラミング及び演習"], hardPrerequisites: ["ait.kk.K2083"] }),
  specialized("K2035", "論理回路", 2, "elective", 2, "spring"),
  specialized("K2044", "数値計算", 2, "elective", 2, "fall"),
  specialized("K2017", "オペレーションズ・リサーチⅠ", 2, "elective", 3, "spring"),
  specialized("K2018", "オペレーションズ・リサーチⅡ", 2, "elective", 3, "fall", { hardPrerequisites: ["ait.kk.K2017"] }),
  specialized("K2082", "数理論理学", 2, "elective", 2, "spring"),
  specialized("K2012", "言語理論及びコンパイラ", 2, "elective", 3, "spring"),
  specialized("K2014", "計算の理論", 2, "elective", 3, "fall"),
  specialized("K2077", "ソフトコンピューティング", 2, "elective", 3, "fall"),
  specialized("K2065", "オブジェクト指向プログラミング及び演習Ⅰ", 3, "elective", 2, "spring"),
  specialized("K2066", "オブジェクト指向プログラミング及び演習Ⅱ", 3, "elective", 2, "fall", { hardPrerequisites: ["ait.kk.K2065"] }),
  specialized("K2095", "ソフトウェア工学Ⅰ", 2, "elective", 3, "spring"),
  specialized("K2037", "ソフトウェア工学Ⅱ", 2, "elective", 3, "fall", { hardPrerequisites: ["ait.kk.K2095"] }),
  specialized("K2083", "Ｗｅｂプログラミング基礎", 2, "elective", 1, "fall", { aliases: ["Webプログラミング基礎"] }),
  specialized("K2068", "コンピュータアーキテクチャⅠ", 2, "elective", 2, "spring"),
  specialized("K2069", "コンピュータアーキテクチャⅡ", 2, "elective", 2, "fall", { hardPrerequisites: ["ait.kk.K2068"] }),
  specialized("K2118", "システム制御", 2, "elective", 2, "fall"),
  specialized("K1015", "組み込みシステム概論", 2, "elective", 3, "spring"),
  specialized("K3003", "組み込みプログラミング及び演習", 3, "required_elective", 3, "fall", { requiredElectiveGroup: "kk-2026-star2" }),
  specialized("K3004", "マイコン制御及び演習", 3, "required_elective", 3, "spring", { requiredElectiveGroup: "kk-2026-star2" }),
  specialized("K3084", "プロジェクト演習Ⅰ", 1, "elective", 2, "spring"),
  specialized("K2085", "プロジェクト演習Ⅱ", 1, "elective", 2, "fall", { hardPrerequisites: ["ait.kk.K3084"] }),
  specialized("K2097", "画像処理及び演習", 3, "elective", 2, "spring"),
  specialized("K1016", "セミナー", 2, "required", 3, "full_year", { hardPrerequisites: ["ait.kk.K2085"] }),
  specialized("K2053", "特別講義Ⅰ", 2, "elective", 3, "spring"),
  specialized("K2054", "特別講義Ⅱ", 2, "elective", 3, "spring"),
  specialized("K1018", "卒業研究", 4, "required", 4, "full_year", { hardPrerequisites: ["ait.kk.K1016"] }),
  specialized("K2079", "高大連携特別講義Ａ", 2, "non_counting", 4, "spring", { countForProgression: false }),
  specialized("K2080", "高大連携特別講義Ｂ", 2, "non_counting", 4, "spring", { countForProgression: false }),
  specialized("K2081", "高大連携特別講義Ｃ", 1, "non_counting", 4, "spring", { countForProgression: false }),

  general("G1829", "コミュニカティブイングリッシュＡ", 1, "required", ["english"]),
  general("G1830", "コミュニカティブイングリッシュＢ", 1, "required_elective", ["english"], { hardPrerequisites: ["ait.general.G1829"] }),
  general("G1831", "コミュニカティブイングリッシュＣ", 1, "required", ["english"]),
  general("G3834", "コミュニカティブイングリッシュＤ", 1, "required", ["english"], { hardPrerequisites: ["ait.general.G1831"] }),
  general("G3832", "ＴＯＥＩＣ・視聴覚英語Ａ", 1, "required_elective", ["english"]),
  general("G3833", "ＴＯＥＩＣ・視聴覚英語Ｂ", 1, "required_elective", ["english"], { hardPrerequisites: ["ait.general.G3832"] }),
  general("G3835", "英語ワークショップＡ：スピーキング＆プレゼンテーション", 1, "required_elective", ["english"], { aliases: ["英語ワークショップA：スピーキング＆プレゼンテーション"] }),
  general("G3836", "英語ワークショップＢ：上級リーディング", 1, "required_elective", ["english"], { aliases: ["英語ワークショップB：上級リーディング"] }),
  general("G3837", "英語ワークショップＣ：ビジネスコミュニケーション＆TOEIC演習", 1, "required_elective", ["english"], { aliases: ["英語ワークショップC：ビジネスコミュニケーション＆TOEIC演習"] }),
  general("G3838", "英語ワークショップＤ：海外留学英語", 1, "required_elective", ["english"], { aliases: ["英語ワークショップD：海外留学英語"] }),
  general("G3845", "英語圏のことばと文化Ａ", 2, "required_elective", ["english"]),
  general("G3846", "英語圏のことばと文化Ｂ", 2, "required_elective", ["english"], { hardPrerequisites: ["ait.general.G3845"] }),
  general("G3843", "中国語Ａ", 1, "required_elective", ["language"], { aliases: ["中国語A"] }),
  general("G3844", "中国語Ｂ", 1, "required_elective", ["language"], { aliases: ["中国語B"], hardPrerequisites: ["ait.general.G3843"] }),
  general("G3841", "フランス語Ａ", 1, "required_elective", ["language"], { aliases: ["フランス語A"] }),
  general("G3842", "フランス語Ｂ", 1, "required_elective", ["language"], { aliases: ["フランス語B"], hardPrerequisites: ["ait.general.G3841"] }),
  general("G3839", "ドイツ語Ａ", 1, "required_elective", ["language"], { aliases: ["ドイツ語A"] }),
  general("G3840", "ドイツ語Ｂ", 1, "required_elective", ["language"], { aliases: ["ドイツ語B"], hardPrerequisites: ["ait.general.G3839"] }),
  general("G2834", "複素関数論", 2, "elective"),
  general("G2835", "代数学", 2, "elective"),
  general("G2836", "統計物理", 2, "elective"),
  general("G2837", "質点系と剛体の力学", 2, "elective"),
  general("G2036", "人間性の探究", 2, "elective"),
  general("G2001", "こころの科学", 2, "elective"),
  general("G2026", "人間の行動", 2, "elective"),
  general("G2064", "科学技術と自然と人間", 2, "elective"),
  general("G2065", "表現文化", 2, "elective"),
  general("G2014", "現代社会の探究", 2, "elective"),
  general("G2013", "現代の経済", 2, "elective"),
  general("G2066", "現代社会と法", 2, "elective"),
  general("G2048", "日本国憲法", 2, "elective"),
  general("G2010", "健康の科学", 2, "elective"),
  general("G2067", "ものづくり文化", 2, "elective"),
  general("G2821", "環境と地域共創", 2, "elective"),
  general("G2069", "創造と倫理", 2, "elective"),
  general("G2842", "カーボンニュートラル概論", 2, "elective"),
  general("G2841", "日本語リテラシ", 2, "elective"),
  general("G2822", "ものづくり文化実習", 1, "elective"),
  general("G2008", "健康・スポーツ科学実習Ⅰ", 1, "elective", [], { aliases: ["健康・スポーツ科学実習I"] }),
  general("G2009", "健康・スポーツ科学実習Ⅱ", 1, "elective", [], { aliases: ["健康・スポーツ科学実習II"], hardPrerequisites: ["ait.general.G2008"] }),
  general("G2838", "中国のことばと文化", 2, "elective", ["language"], { hardPrerequisites: ["ait.general.G3844"] }),
  general("G2839", "フランスのことばと文化", 2, "elective", ["language"], { hardPrerequisites: ["ait.general.G3842"] }),
  general("G2840", "ドイツのことばと文化", 2, "elective", ["language"], { hardPrerequisites: ["ait.general.G3840"] }),
  general("G2070", "特別講義", 2, "elective"),
  general("G2823", "日本語コミュニケーション", 2, "non_counting", [], { countForProgression: false, countForGraduation: false }),
  general("G2824", "海外研修英語", 1, "non_counting", ["english"], { countForProgression: false, countForGraduation: false }),
  general("G2833", "海外留学英語", 4, "non_counting", ["english"], { countForProgression: false, countForGraduation: false }),
];

/**
 * カリキュラムツリーの「連携・関連科目」（破線）を、後の科目から前の科目へ辿れる形で記録する。
 *
 * - sourceCourseId: 先に履修しておくとよい科目
 * - targetCourseId: 目標として選んだときに sourceCourseId を「取っておいた方がよい科目」として提示する科目
 * - sourcePage: 添付のコンピュータシステム専攻カリキュラムツリーの資料ページ
 *
 * 実線の前提条件は hardPrerequisites で別管理する。ここには、元図で破線として確認できる対応だけを登録する。
 */
export const kk2026DottedTreeRelationships = [
  { sourceCourseId: "ait.general.G3834", targetCourseId: "ait.general.G3832", sourcePage: 114 },
  { sourceCourseId: "ait.general.G3834", targetCourseId: "ait.general.G3845", sourcePage: 114 },
  { sourceCourseId: "ait.kk.K2087", targetCourseId: "ait.kk.K1013", sourcePage: 114 },
  { sourceCourseId: "ait.kk.K1020", targetCourseId: "ait.kk.K2062", sourcePage: 114 },
  { sourceCourseId: "ait.kk.K2059", targetCourseId: "ait.kk.K2063", sourcePage: 114 },

  { sourceCourseId: "ait.kk.K2094", targetCourseId: "ait.kk.K2071", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K2022", targetCourseId: "ait.kk.K2065", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K2012", targetCourseId: "ait.kk.K2014", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K2049", targetCourseId: "ait.kk.K2077", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K2022", targetCourseId: "ait.kk.K2097", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K2022", targetCourseId: "ait.kk.K3005", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K2066", targetCourseId: "ait.kk.K2089", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K1007", targetCourseId: "ait.kk.K3001", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K3005", targetCourseId: "ait.kk.K3002", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K2035", targetCourseId: "ait.kk.K2068", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K2069", targetCourseId: "ait.kk.K1015", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K2069", targetCourseId: "ait.kk.K3004", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K2118", targetCourseId: "ait.kk.K3004", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K1015", targetCourseId: "ait.kk.K3003", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K3004", targetCourseId: "ait.kk.K3003", sourcePage: 115 },
] as const;

function addDottedTreeRelationships(courses: CourseDefinition[]) {
  const courseIds = new Set(courses.map((course) => course.id));
  const prerequisitesByTarget = new Map<string, string[]>();

  for (const relationship of kk2026DottedTreeRelationships) {
    if (!courseIds.has(relationship.sourceCourseId) || !courseIds.has(relationship.targetCourseId)) {
      throw new Error(`カリキュラムツリー破線の科目IDが見つかりません: ${relationship.sourceCourseId} -> ${relationship.targetCourseId}`);
    }
    const prerequisites = prerequisitesByTarget.get(relationship.targetCourseId) ?? [];
    prerequisites.push(relationship.sourceCourseId);
    prerequisitesByTarget.set(relationship.targetCourseId, prerequisites);
  }

  return courses.map((course) => {
    const dottedPrerequisites = prerequisitesByTarget.get(course.id) ?? [];
    if (dottedPrerequisites.length === 0) return course;
    return {
      ...course,
      softPrerequisites: [...new Set([...(course.softPrerequisites ?? []), ...dottedPrerequisites])],
    };
  });
}

function normalizeName(value: string) {
  return value
    .replace(/[（）()]/g, "")
    .replace(/再履修用/g, "")
    .replace(/[\s　]/g, "")
    .replace(/Web/g, "Ｗｅｂ")
    .replace(/CAD/g, "ＣＡＤ")
    .replace(/III/g, "Ⅲ")
    .replace(/II/g, "Ⅱ")
    .replace(/IV/g, "Ⅳ")
    .replace(/VI/g, "Ⅵ")
    .replace(/I/g, "Ⅰ")
    .replace(/V/g, "Ⅴ");
}

function periodsFrom(value: string) {
  const roman = value.match(/VI|IV|III|II|I|V/g) ?? [];
  const periods = roman.map((token) => periodNumbers[token]).filter((period): period is number => Boolean(period));
  return [...new Set(periods)].sort((a, b) => a - b);
}

/**
 * 元のクラス記号には日本語や全角数字も使われる。英数字だけを残すと
 * 「再履修２」と「再履修６」が同じIDになってしまうため、各文字の
 * Unicode code point を含めた衝突しない識別子にする。
 */
function offeringIdToken(value: string) {
  return Array.from(value)
    .map((character) => /[a-zA-Z0-9.-]/.test(character)
      ? character
      : `u${character.codePointAt(0)!.toString(16)}`)
    .join("-");
}

function requirementFromLabel(value: string, notes: string): RequirementType {
  if (notes.includes("教職")) return "non_counting";
  if (value.includes("選必")) return "required_elective";
  if (value.includes("必修")) return "required";
  return "elective";
}

function termFromLabel(value: string): Term {
  if (value.includes("通年")) return "full_year";
  return value.includes("後期") ? "fall" : "spring";
}

function makeScheduleOnlyCourse(name: string, credits: number, requirementType: RequirementType, notes: string, sequence: string): CourseDefinition {
  const isTeacherTraining = notes.includes("教職");
  const kkDedicated = notes.includes("KK専攻専用");
  return {
    id: `ait.kk.schedule-only.${sequence}`,
    code: "資料記載コードなし",
    officialCode: false,
    name,
    credits,
    category: kkDedicated ? "specialized" : "general",
    requirementType: isTeacherTraining ? "non_counting" : requirementType,
    recommendedGrade: 1,
    recommendedTerm: "spring",
    tags: isTeacherTraining ? ["teacher_training"] : kkDedicated ? ["kk_dedicated", "official_code_unconfirmed"] : ["official_code_unconfirmed"],
    countsTowardCreditCap: !isTeacherTraining,
    countForProgression: !isTeacherTraining,
    countForGraduation: !isTeacherTraining,
  };
}

function parseLedger(ledger: string, lottery: boolean, definitionsByCode: Map<string, CourseDefinition>, definitionsByName: Map<string, CourseDefinition>) {
  const unknownByName = new Map<string, CourseDefinition>();
  let unknownSequence = 1;
  const offeringsByCourse = new Map<string, RawOffering[]>();

  for (const sourceLine of ledger.split("\n")) {
    if (!sourceLine.includes("|")) continue;
    const cells = sourceLine.split("|").map((cell) => cell.trim());
    if (cells.length !== 8) throw new Error(`開講原簿の列数が不正です: ${sourceLine}`);
    const [courseLabel, classCode, termLabel, weekdayLabel, periodLabel, creditLabel, room, notes] = cells;
    const matched = courseLabel.match(/^([A-Z]\d{4})\s+(.+)$/);
    const rawCode = matched?.[1];
    const rawName = (matched?.[2] ?? courseLabel).trim();
    const normalized = normalizeName(rawName);
    const credits = Number((creditLabel.match(/\d+/) ?? ["0"])[0]);
    const requirementType = requirementFromLabel(creditLabel, notes);
    const definition = (rawCode ? definitionsByCode.get(rawCode) : undefined)
      ?? definitionsByName.get(normalized)
      ?? unknownByName.get(normalized)
      ?? makeScheduleOnlyCourse(rawName, credits, requirementType, notes, `${lottery ? "lottery" : "normal"}-${unknownSequence++}`);
    if (!definitionsByCode.has(definition.code) && !unknownByName.has(normalized)) unknownByName.set(normalized, definition);

    const excluded = notes.includes("対象外") || notes.includes("八草C専用");
    const rechallengeOnly = notes.includes("再履修");
    const baseId = `${lottery ? "lottery" : "regular"}-${termLabel.includes("後期") ? "fall" : "spring"}-${offeringIdToken(definition.id)}-${offeringIdToken(classCode)}`;
    const periods = periodsFrom(periodLabel);
    if (periods.length === 0 || !weekdays[weekdayLabel]) throw new Error(`開講原簿の曜日時限を解釈できません: ${sourceLine}`);
    const ledgerTerm = termFromLabel(termLabel);
    // 時間割原簿には通年科目も前期・後期の掲載行がそれぞれある。
    // ここで後期クラスを複製すると同一科目・同一クラスの実在しない重複になるため、
    // 「通年」と書かれた掲載行は前期の開講として1回だけ保持する。
    const terms: Array<"spring" | "fall"> = [ledgerTerm === "full_year" ? "spring" : ledgerTerm];
    for (const term of terms) {
      const offering: RawOffering = {
        id: `${baseId}-${term}`,
        term,
        classCode,
        weekday: weekdays[weekdayLabel],
        periods,
        lottery,
        room,
        ...(notes.match(/担当:(.+)$/)?.[1] ? { instructor: notes.match(/担当:(.+)$/)![1] } : {}),
        eligibleForProgram: !excluded,
        rechallengeOnly,
        alternateWeeks: periodLabel.includes("隔週"),
        ...(notes ? { notes } : {}),
      };
      const current = offeringsByCourse.get(definition.id) ?? [];
      current.push(offering);
      offeringsByCourse.set(definition.id, current);
    }
  }
  return { offeringsByCourse, unknownCourses: [...unknownByName.values()] };
}

export function createKk2026Courses(): SeedCourse[] {
  const byCode = new Map(curriculumCourses.map((course) => [course.code, course]));
  const byName = new Map<string, CourseDefinition>();
  for (const course of curriculumCourses) {
    byName.set(normalizeName(course.name), course);
    for (const alias of course.aliases ?? []) byName.set(normalizeName(alias), course);
  }

  const normal = parseLedger(normalOfferingLedger, false, byCode, byName);
  const lottery = parseLedger(lotteryOfferingLedger, true, byCode, byName);
  const unknownDefinitions = [...normal.unknownCourses, ...lottery.unknownCourses]
    .filter((course, index, all) => all.findIndex((candidate) => candidate.id === course.id) === index);
  const allDefinitions = addDottedTreeRelationships([...curriculumCourses, ...unknownDefinitions]);
  const offeringsByCourse = new Map<string, RawOffering[]>();
  for (const source of [normal.offeringsByCourse, lottery.offeringsByCourse]) {
    for (const [courseId, offerings] of source) offeringsByCourse.set(courseId, [...(offeringsByCourse.get(courseId) ?? []), ...offerings]);
  }

  return allDefinitions
    .map(({ aliases: _aliases, ...course }) => ({
      ...course,
      offerings: offeringsByCourse.get(course.id) ?? [],
    }))
    // 「他学科受入用」等の対象外開講しか持たない時間割専用科目は、KK用の選択肢には出さない。
    // 原簿には残るため、取込監査では除外理由を追跡できる。
    .filter((course) => !course.id.startsWith("ait.kk.schedule-only.") || course.offerings.some((offering) => offering.eligibleForProgram !== false));
}
