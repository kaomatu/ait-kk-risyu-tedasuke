/**
 * 2026年度・コンピュータシステム専攻のカリキュラムツリー用レイアウト。
 *
 * 座標は、提供されたカリキュラムツリー（教育課程 114–115頁）を基準にした
 * 1,506 × 1,064 の論理キャンバス上の値。画像を背景にせず、同じ位置に
 * 操作可能な科目ボタンと接続線を描画するために使う。
 */

export type TreePageId = "foundation" | "specialization";
export type TreeLinkKind = "hard" | "soft";

export type TreeCoursePlacement = {
  type: "course";
  courseId: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
};

/** 元図で複数科目を一つの帯にまとめている箇所。内部の各科目は個別に選択できる。 */
export type TreeCourseCluster = {
  type: "cluster";
  courseIds: string[];
  x: number;
  y: number;
  width: number;
  height: number;
  compact?: boolean;
};

export type TreePlacement = TreeCoursePlacement | TreeCourseCluster;

export type TreeArea = {
  title: string;
  description?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  tone?: "main" | "sub";
};

export type CurriculumTreePage = {
  id: TreePageId;
  title: string;
  height: number;
  showTerms?: boolean;
  areas: TreeArea[];
  placements: TreePlacement[];
};

/**
 * 元図で一本の線として確認した、科目間の接続台帳。
 *
 * - hard: 実線（単位修得が必要な前提条件）
 * - soft: 破線（関連・推奨順序）
 *
 * 表示と履修判定の両方がこの台帳と同じ向きになるよう、テストで
 * functions/src/kk2026Catalog.ts の先修条件と突き合わせる。
 */
export type TreeCourseLink = {
  sourceCourseId: string;
  targetCourseId: string;
  kind: TreeLinkKind;
  sourcePage: 114 | 115;
};

/** 元図のページ境界をまたいで続く、名前付きの接続線ではない補助線。 */
export type TreeContinuationLine = {
  kind: TreeLinkKind;
  path: string;
};

export type CurriculumTree = {
  id: "kk-2026-combined";
  width: number;
  height: number;
  areas: TreeArea[];
  placements: TreePlacement[];
  links: TreeCourseLink[];
  continuationLines: TreeContinuationLine[];
};

export const kkTreeTerms = [
  { label: "1年\n前期", x: 355, width: 145 },
  { label: "1年\n後期", x: 500, width: 145 },
  { label: "2年\n前期", x: 645, width: 145 },
  { label: "2年\n後期", x: 790, width: 145 },
  { label: "3年\n前期", x: 935, width: 145 },
  { label: "3年\n後期", x: 1080, width: 145 },
  { label: "4年\n通年", x: 1225, width: 145 },
] as const;

const course = (courseId: string, x: number, y: number, width = 116, height = 34): TreeCoursePlacement => ({ type: "course", courseId, x, y, width, height });
const cluster = (courseIds: string[], x: number, y: number, width: number, height: number, compact = false): TreeCourseCluster => ({ type: "cluster", courseIds, x, y, width, height, compact });

/** 114頁: 人間性・キャリア・基礎学力のツリー。 */
const foundation: CurriculumTreePage = {
  id: "foundation",
  title: "学習到達目標・基礎学力",
  height: 1064,
  showTerms: true,
  areas: [
    { title: "人間性を培う幅広い知識と素養の育成", description: "人間・社会・言語に関する知識を深め、多様な価値観を身につける。", x: 120, y: 203, width: 1250, height: 401 },
    { title: "人間性の教育・専門性の教育の統合（キャリア教育）", description: "社会的・職業的に自立した学生を育成する。", x: 120, y: 615, width: 1250, height: 172 },
    { title: "基礎学力・知識の修得", description: "自然科学と情報科学分野に共通する基礎力を身につける。", x: 120, y: 797, width: 1250, height: 177 },
  ],
  placements: [
    course("ait.general.G1829", 370, 213), course("ait.general.G1830", 517, 213),
    course("ait.general.G1831", 370, 252), course("ait.general.G3834", 517, 252),
    course("ait.general.G3832", 662, 252), course("ait.general.G3833", 808, 252),
    course("ait.general.G3845", 662, 291), course("ait.general.G3846", 808, 291),
    course("ait.general.G3843", 370, 329), course("ait.general.G3844", 517, 329), course("ait.general.G2838", 662, 329),
    course("ait.general.G3841", 370, 369), course("ait.general.G3842", 517, 369), course("ait.general.G2839", 662, 369),
    course("ait.general.G3839", 370, 409), course("ait.general.G3840", 517, 409), course("ait.general.G2840", 662, 409),
    course("ait.general.G2008", 370, 449), course("ait.general.G2009", 517, 449),
    cluster(["ait.general.G3835", "ait.general.G3836", "ait.general.G3837", "ait.general.G3838"], 370, 488, 260, 34, true),
    course("ait.general.G2837", 662, 449), course("ait.general.G2835", 808, 449),
    course("ait.general.G2836", 662, 474), course("ait.general.G2842", 808, 474), course("ait.general.G2834", 662, 499),
    cluster(["ait.general.G2036", "ait.general.G2001", "ait.general.G2026", "ait.general.G2064", "ait.general.G2065", "ait.general.G2014", "ait.general.G2013", "ait.general.G2066", "ait.general.G2048", "ait.general.G2010", "ait.general.G2821", "ait.general.G2069", "ait.general.G2070"], 370, 529, 990, 34, true),
    cluster(["ait.general.G2067", "ait.general.G2822"], 370, 569, 990, 34),

    course("ait.kk.K1021", 370, 626), course("ait.general.G2841", 517, 626),
    course("ait.kk.K2114", 952, 626), course("ait.kk.K2116", 1098, 626),
    course("ait.kk.K1022", 370, 667), course("ait.kk.K1023", 662, 667), course("ait.kk.K2113", 1098, 667),
    course("ait.kk.K2115", 1098, 708), cluster(["ait.kk.K2117"], 370, 750, 990, 34),

    course("ait.kk.K1019", 517, 807), course("ait.kk.K2087", 662, 807), course("ait.kk.K1013", 808, 807),
    course("ait.kk.K2058", 370, 847), course("ait.kk.K2059", 517, 847),
    course("ait.kk.K1020", 370, 887), course("ait.kk.K2062", 808, 887),
    course("ait.kk.K2060", 370, 926), course("ait.kk.K2061", 517, 926), course("ait.kk.K2063", 808, 926),
    course("ait.kk.K1005", 370, 966), course("ait.kk.K2016", 517, 966),
  ],
};

/** 115頁: 専門基礎・専門技術のツリー。 */
const specialization: CurriculumTreePage = {
  id: "specialization",
  title: "専門基礎・専門技術",
  height: 1064,
  areas: [
    { title: "専門基礎の修得", description: "ICTの基礎及び専門知識を修得し、柔軟な応用能力を育成する。", x: 120, y: 101, width: 1250, height: 101 },
    { title: "専門技術・知識の修得", description: "コンピュータシステムについての知識と技術を修得する。", x: 120, y: 215, width: 1250, height: 740 },
    { title: "(1) システム開発のための専門的な知識と技術", x: 120, y: 245, width: 235, height: 112, tone: "sub" },
    { title: "(2) ソフトウェア開発のための専門知識と技術", x: 120, y: 358, width: 235, height: 232, tone: "sub" },
    { title: "(3) ネットワークシステム開発のための専門知識と技術", x: 120, y: 590, width: 235, height: 135, tone: "sub" },
    { title: "(4) 組み込みシステム開発のための専門知識と技術", x: 120, y: 725, width: 235, height: 95, tone: "sub" },
    { title: "(5) 高度なICTシステムの研究開発を通して専門知識と技術を実践的に修得する。", x: 120, y: 820, width: 235, height: 135, tone: "sub" },
  ],
  placements: [
    course("ait.kk.K2094", 370, 115), course("ait.kk.K2071", 808, 115), course("ait.kk.K2076", 1098, 115),
    course("ait.kk.K2090", 808, 157), course("ait.kk.K2119", 952, 157),

    course("ait.kk.K2082", 662, 313),
    course("ait.kk.K2044", 808, 266), course("ait.kk.K2017", 952, 266), course("ait.kk.K2018", 1098, 266),
    course("ait.kk.K2012", 952, 313), course("ait.kk.K2014", 1098, 313),

    course("ait.kk.K1017", 370, 415), course("ait.kk.K1003", 370, 458), course("ait.kk.K2022", 517, 458),
    course("ait.kk.K2049", 662, 376), course("ait.kk.K2077", 1098, 376), course("ait.kk.K2097", 662, 416),
    course("ait.kk.K2065", 662, 457), course("ait.kk.K2066", 808, 457), course("ait.kk.K2089", 952, 457), course("ait.kk.K2088", 952, 499),
    course("ait.kk.K2095", 952, 416), course("ait.kk.K2037", 1098, 416), course("ait.kk.K3005", 952, 546),

    course("ait.kk.K1007", 662, 603), course("ait.kk.K2070", 808, 603), course("ait.kk.K2091", 952, 603), course("ait.kk.K3001", 952, 646),
    course("ait.kk.K2083", 517, 680), course("ait.kk.K3002", 1098, 680),

    course("ait.kk.K2035", 370, 737), course("ait.kk.K2068", 662, 737), course("ait.kk.K2069", 808, 737), course("ait.kk.K1015", 952, 737), course("ait.kk.K3003", 1098, 737),
    course("ait.kk.K2118", 808, 779), course("ait.kk.K3004", 952, 779),

    course("ait.kk.K3084", 662, 833), course("ait.kk.K2085", 808, 833), course("ait.kk.K1016", 952, 833, 260), course("ait.kk.K1018", 1242, 833),
    cluster(["ait.kk.K2053"], 370, 874, 990, 34), cluster(["ait.kk.K2054"], 370, 915, 990, 34),
  ],
};

export const kkCurriculumTreePages = [foundation, specialization] as const;

export function curriculumTreeCourseIds(page: CurriculumTreePage) {
  return page.placements.flatMap((placement) => placement.type === "course" ? [placement.courseId] : placement.courseIds);
}

// PDFの上下余白だけを詰める。114頁の図の末端（約974px）と115頁の図の
// 先頭（約101px）が連続するため、科目の相対座標・学期列の縮尺は変えない。
const pageTwoOffset = 944;

function offsetArea(area: TreeArea, offset: number): TreeArea {
  return { ...area, y: area.y + offset };
}

function offsetPlacement(placement: TreePlacement, offset: number): TreePlacement {
  return { ...placement, y: placement.y + offset };
}

/**
 * 114–115頁を、紙の切れ目で分割しない一枚の論理キャンバスにしたレイアウト。
 * 2頁目は紙面の余白のみを除いて下へ移し、同じ縮尺で連続して確認できる。
 */
export const kk2026TreeCourseLinks: TreeCourseLink[] = [
  // 114頁: 言語・キャリア・基礎学力
  { sourceCourseId: "ait.general.G1829", targetCourseId: "ait.general.G1830", kind: "hard", sourcePage: 114 },
  { sourceCourseId: "ait.general.G1831", targetCourseId: "ait.general.G3834", kind: "hard", sourcePage: 114 },
  { sourceCourseId: "ait.general.G3834", targetCourseId: "ait.general.G3832", kind: "soft", sourcePage: 114 },
  { sourceCourseId: "ait.general.G3834", targetCourseId: "ait.general.G3845", kind: "soft", sourcePage: 114 },
  { sourceCourseId: "ait.general.G3832", targetCourseId: "ait.general.G3833", kind: "hard", sourcePage: 114 },
  { sourceCourseId: "ait.general.G3845", targetCourseId: "ait.general.G3846", kind: "hard", sourcePage: 114 },
  { sourceCourseId: "ait.general.G3843", targetCourseId: "ait.general.G3844", kind: "hard", sourcePage: 114 },
  { sourceCourseId: "ait.general.G3844", targetCourseId: "ait.general.G2838", kind: "hard", sourcePage: 114 },
  { sourceCourseId: "ait.general.G3841", targetCourseId: "ait.general.G3842", kind: "hard", sourcePage: 114 },
  { sourceCourseId: "ait.general.G3842", targetCourseId: "ait.general.G2839", kind: "hard", sourcePage: 114 },
  { sourceCourseId: "ait.general.G3839", targetCourseId: "ait.general.G3840", kind: "hard", sourcePage: 114 },
  { sourceCourseId: "ait.general.G3840", targetCourseId: "ait.general.G2840", kind: "hard", sourcePage: 114 },
  { sourceCourseId: "ait.general.G2008", targetCourseId: "ait.general.G2009", kind: "hard", sourcePage: 114 },
  { sourceCourseId: "ait.kk.K1022", targetCourseId: "ait.kk.K1023", kind: "hard", sourcePage: 114 },
  { sourceCourseId: "ait.kk.K1023", targetCourseId: "ait.kk.K2113", kind: "hard", sourcePage: 114 },
  { sourceCourseId: "ait.kk.K1019", targetCourseId: "ait.kk.K2087", kind: "hard", sourcePage: 114 },
  { sourceCourseId: "ait.kk.K2087", targetCourseId: "ait.kk.K1013", kind: "soft", sourcePage: 114 },
  { sourceCourseId: "ait.kk.K2058", targetCourseId: "ait.kk.K2059", kind: "hard", sourcePage: 114 },
  { sourceCourseId: "ait.kk.K2059", targetCourseId: "ait.kk.K2063", kind: "soft", sourcePage: 114 },
  { sourceCourseId: "ait.kk.K1020", targetCourseId: "ait.kk.K2062", kind: "soft", sourcePage: 114 },
  { sourceCourseId: "ait.kk.K2060", targetCourseId: "ait.kk.K2061", kind: "hard", sourcePage: 114 },
  { sourceCourseId: "ait.kk.K1005", targetCourseId: "ait.kk.K2016", kind: "hard", sourcePage: 114 },

  // 115頁: 専門基礎・専門技術
  { sourceCourseId: "ait.kk.K2094", targetCourseId: "ait.kk.K2071", kind: "soft", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K2017", targetCourseId: "ait.kk.K2018", kind: "hard", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K2012", targetCourseId: "ait.kk.K2014", kind: "soft", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K2049", targetCourseId: "ait.kk.K2077", kind: "soft", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K1003", targetCourseId: "ait.kk.K2022", kind: "hard", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K2022", targetCourseId: "ait.kk.K2065", kind: "soft", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K2022", targetCourseId: "ait.kk.K2097", kind: "soft", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K2022", targetCourseId: "ait.kk.K3005", kind: "soft", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K2065", targetCourseId: "ait.kk.K2066", kind: "hard", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K2066", targetCourseId: "ait.kk.K2089", kind: "soft", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K2095", targetCourseId: "ait.kk.K2037", kind: "hard", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K1007", targetCourseId: "ait.kk.K2070", kind: "hard", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K2070", targetCourseId: "ait.kk.K2091", kind: "hard", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K1007", targetCourseId: "ait.kk.K3001", kind: "soft", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K2083", targetCourseId: "ait.kk.K3002", kind: "hard", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K3005", targetCourseId: "ait.kk.K3002", kind: "soft", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K2035", targetCourseId: "ait.kk.K2068", kind: "soft", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K2068", targetCourseId: "ait.kk.K2069", kind: "hard", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K2069", targetCourseId: "ait.kk.K1015", kind: "soft", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K2069", targetCourseId: "ait.kk.K3004", kind: "soft", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K2118", targetCourseId: "ait.kk.K3004", kind: "soft", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K1015", targetCourseId: "ait.kk.K3003", kind: "soft", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K3004", targetCourseId: "ait.kk.K3003", kind: "soft", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K3084", targetCourseId: "ait.kk.K2085", kind: "hard", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K2085", targetCourseId: "ait.kk.K1016", kind: "hard", sourcePage: 115 },
  { sourceCourseId: "ait.kk.K1016", targetCourseId: "ait.kk.K1018", kind: "hard", sourcePage: 115 },
];

/**
 * 114頁の下端から115頁の上端へ伸びる、元図に描かれている三本の継続線。
 * 線は科目箱を経由せず紙面外へ出るため、科目間の登録条件には混在させない。
 */
const kk2026TreeContinuationLines: TreeContinuationLine[] = [
  // 114頁の「線形代数Ⅱ／情報数学Ⅱ」側から、115頁の数理系へ続く実線。
  { kind: "hard", path: "M 640 943 V 1227 H 808" },
  { kind: "hard", path: "M 640 983 V 1274 H 662" },
  // 114頁の物理系から下へ伸び、115頁中央の縦幹へ続く実線。
  { kind: "hard", path: "M 784 824 V 1735" },
  // 114頁のデータサイエンス基礎処理側から続く破線。
  { kind: "soft", path: "M 799 904 V 1178 H 938 V 1227 H 952" },
];

export const kkCurriculumTree: CurriculumTree = {
  id: "kk-2026-combined",
  width: 1506,
  height: pageTwoOffset + specialization.height,
  areas: [...foundation.areas, ...specialization.areas.map((area) => offsetArea(area, pageTwoOffset))],
  placements: [...foundation.placements, ...specialization.placements.map((placement) => offsetPlacement(placement, pageTwoOffset))],
  links: kk2026TreeCourseLinks,
  continuationLines: kk2026TreeContinuationLines,
};

export function curriculumTreeCourseIdsFromTree(tree: CurriculumTree) {
  return tree.placements.flatMap((placement) => placement.type === "course" ? [placement.courseId] : placement.courseIds);
}
