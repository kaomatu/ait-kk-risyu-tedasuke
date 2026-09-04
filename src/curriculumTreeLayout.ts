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
  /** 元資料上で測定した、科目枠の論理サイズ。 */
  width: number;
  height: number;
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
  /**
   * 元資料のページ座標で記録した SVG 経路。
   *
   * 自動配線は使わない。これにより、画面幅や科目名の長さが変わっても
   * 接続線の折れ方・分岐位置を資料どおりに再現できる。
   */
  path: string;
  sourcePage: 114 | 115;
};

/** 元図のページ境界をまたいで続く、名前付きの接続線ではない補助線。 */
export type TreeContinuationLine = {
  kind: TreeLinkKind;
  /** path の座標系。115頁の線は合成キャンバス上で自動的に下へ移動する。 */
  sourcePage: 114 | 115;
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
    // この5科目は元図で25px間隔の小さな枠として並ぶため、通常枠(34px)を
    // 使わない。個別ボタン同士が重ならないよう元資料の実寸に合わせる。
    course("ait.general.G2837", 662, 449, 116, 22), course("ait.general.G2835", 808, 449, 116, 22),
    course("ait.general.G2836", 662, 474, 116, 22), course("ait.general.G2842", 808, 474, 116, 22), course("ait.general.G2834", 662, 499, 116, 22),
    cluster(["ait.general.G2036", "ait.general.G2001", "ait.general.G2026", "ait.general.G2064", "ait.general.G2065", "ait.general.G2014", "ait.general.G2013", "ait.general.G2066", "ait.general.G2048", "ait.general.G2010", "ait.general.G2821", "ait.general.G2069", "ait.general.G2070"], 370, 529, 990, 34, true),
    cluster(["ait.general.G2067", "ait.general.G2822"], 370, 569, 990, 34),

    course("ait.kk.K1021", 370, 626), course("ait.general.G2841", 517, 626),
    course("ait.kk.K2114", 952, 626), course("ait.kk.K2116", 1098, 626),
    course("ait.kk.K1022", 370, 667), course("ait.kk.K1023", 662, 667), course("ait.kk.K2113", 1098, 667),
    course("ait.kk.K2115", 1098, 708), cluster(["ait.kk.K2117"], 370, 750, 990, 34),

    // 114頁下部は、通常の34px枠・40px間隔ではなく、元画像では約26〜28px枠・
    // 31px間隔で組まれている。選択時の操作枠が画像の科目枠と重なるよう実測値を使う。
    course("ait.kk.K1019", 517, 805, 116, 28), course("ait.kk.K2087", 662, 805, 116, 28), course("ait.kk.K1013", 808, 805, 116, 28),
    course("ait.kk.K2058", 370, 845, 116, 28), course("ait.kk.K2059", 517, 845, 116, 28),
    course("ait.kk.K1020", 370, 876, 116, 28), course("ait.kk.K2062", 808, 876, 116, 28),
    course("ait.kk.K2060", 370, 907, 116, 28), course("ait.kk.K2061", 517, 907, 116, 28), course("ait.kk.K2063", 808, 907, 116, 28),
    course("ait.kk.K1005", 370, 939, 116, 28), course("ait.kk.K2016", 517, 939, 116, 28),
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
/** 115頁を合成キャンバスで開始する Y 座標。SVG の 115頁経路にも使う。 */
export const kkTreePageTwoOffset = 944;

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
  { sourceCourseId: "ait.general.G1829", targetCourseId: "ait.general.G1830", kind: "hard", sourcePage: 114, path: "M 486 230 H 517" },
  { sourceCourseId: "ait.general.G1831", targetCourseId: "ait.general.G3834", kind: "hard", sourcePage: 114, path: "M 486 269 H 517" },
  { sourceCourseId: "ait.general.G3834", targetCourseId: "ait.general.G3832", kind: "soft", sourcePage: 114, path: "M 633 269 H 662" },
  { sourceCourseId: "ait.general.G3834", targetCourseId: "ait.general.G3845", kind: "soft", sourcePage: 114, path: "M 633 269 H 647 V 308 H 662" },
  { sourceCourseId: "ait.general.G3832", targetCourseId: "ait.general.G3833", kind: "hard", sourcePage: 114, path: "M 778 269 H 808" },
  { sourceCourseId: "ait.general.G3845", targetCourseId: "ait.general.G3846", kind: "hard", sourcePage: 114, path: "M 778 308 H 808" },
  { sourceCourseId: "ait.general.G3843", targetCourseId: "ait.general.G3844", kind: "hard", sourcePage: 114, path: "M 486 346 H 517" },
  { sourceCourseId: "ait.general.G3844", targetCourseId: "ait.general.G2838", kind: "hard", sourcePage: 114, path: "M 633 346 H 662" },
  { sourceCourseId: "ait.general.G3841", targetCourseId: "ait.general.G3842", kind: "hard", sourcePage: 114, path: "M 486 386 H 517" },
  { sourceCourseId: "ait.general.G3842", targetCourseId: "ait.general.G2839", kind: "hard", sourcePage: 114, path: "M 633 386 H 662" },
  { sourceCourseId: "ait.general.G3839", targetCourseId: "ait.general.G3840", kind: "hard", sourcePage: 114, path: "M 486 426 H 517" },
  { sourceCourseId: "ait.general.G3840", targetCourseId: "ait.general.G2840", kind: "hard", sourcePage: 114, path: "M 633 426 H 662" },
  { sourceCourseId: "ait.general.G2008", targetCourseId: "ait.general.G2009", kind: "hard", sourcePage: 114, path: "M 486 466 H 517" },
  { sourceCourseId: "ait.kk.K1022", targetCourseId: "ait.kk.K1023", kind: "hard", sourcePage: 114, path: "M 486 684 H 662" },
  { sourceCourseId: "ait.kk.K1023", targetCourseId: "ait.kk.K2113", kind: "hard", sourcePage: 114, path: "M 778 684 H 1098" },
  { sourceCourseId: "ait.kk.K1019", targetCourseId: "ait.kk.K2087", kind: "hard", sourcePage: 114, path: "M 633 824 H 662" },
  { sourceCourseId: "ait.kk.K1019", targetCourseId: "ait.kk.K1013", kind: "hard", sourcePage: 114, path: "M 633 819 H 790 V 819 H 808" },
  { sourceCourseId: "ait.kk.K2087", targetCourseId: "ait.kk.K1013", kind: "soft", sourcePage: 114, path: "M 778 824 H 808" },
  { sourceCourseId: "ait.kk.K2058", targetCourseId: "ait.kk.K2059", kind: "hard", sourcePage: 114, path: "M 486 864 H 517" },
  { sourceCourseId: "ait.kk.K1020", targetCourseId: "ait.kk.K2063", kind: "soft", sourcePage: 114, path: "M 486 890 H 797 V 921 H 808" },
  { sourceCourseId: "ait.kk.K1020", targetCourseId: "ait.kk.K2062", kind: "soft", sourcePage: 114, path: "M 486 904 H 808" },
  { sourceCourseId: "ait.kk.K2060", targetCourseId: "ait.kk.K2061", kind: "hard", sourcePage: 114, path: "M 486 943 H 517" },
  { sourceCourseId: "ait.kk.K1005", targetCourseId: "ait.kk.K2016", kind: "hard", sourcePage: 114, path: "M 486 983 H 517" },

  // 115頁: 専門基礎・専門技術
  { sourceCourseId: "ait.kk.K2094", targetCourseId: "ait.kk.K2071", kind: "soft", sourcePage: 115, path: "M 486 132 H 808" },
  // 114頁下部から115頁へ連続する、数学・物理系の先修／推奨関係。
  { sourceCourseId: "ait.kk.K2061", targetCourseId: "ait.kk.K2017", kind: "hard", sourcePage: 115, path: "M 780 0 V 283 H 952" },
  { sourceCourseId: "ait.kk.K2059", targetCourseId: "ait.kk.K2017", kind: "soft", sourcePage: 115, path: "M 797 0 V 230 H 938 V 283 H 952" },
  { sourceCourseId: "ait.kk.K2061", targetCourseId: "ait.kk.K2044", kind: "hard", sourcePage: 115, path: "M 780 0 V 283 H 808" },
  { sourceCourseId: "ait.kk.K2059", targetCourseId: "ait.kk.K2044", kind: "hard", sourcePage: 115, path: "M 637 0 V 283 H 808" },
  { sourceCourseId: "ait.kk.K2059", targetCourseId: "ait.kk.K2044", kind: "soft", sourcePage: 115, path: "M 797 0 V 230 H 780 V 283 H 808" },
  { sourceCourseId: "ait.kk.K2061", targetCourseId: "ait.kk.K2082", kind: "hard", sourcePage: 115, path: "M 780 0 V 330 H 662" },
  { sourceCourseId: "ait.kk.K2061", targetCourseId: "ait.kk.K2118", kind: "hard", sourcePage: 115, path: "M 780 0 V 796 H 808" },
  { sourceCourseId: "ait.kk.K2059", targetCourseId: "ait.kk.K2118", kind: "hard", sourcePage: 115, path: "M 637 0 V 796 H 808" },
  { sourceCourseId: "ait.kk.K2087", targetCourseId: "ait.kk.K2118", kind: "hard", sourcePage: 115, path: "M 789 0 V 796 H 808" },
  { sourceCourseId: "ait.kk.K2017", targetCourseId: "ait.kk.K2018", kind: "hard", sourcePage: 115, path: "M 1068 283 H 1098" },
  { sourceCourseId: "ait.kk.K2012", targetCourseId: "ait.kk.K2014", kind: "soft", sourcePage: 115, path: "M 1068 330 H 1098" },
  { sourceCourseId: "ait.kk.K2049", targetCourseId: "ait.kk.K2077", kind: "soft", sourcePage: 115, path: "M 778 393 H 1098" },
  { sourceCourseId: "ait.kk.K1003", targetCourseId: "ait.kk.K2022", kind: "hard", sourcePage: 115, path: "M 486 475 H 517" },
  { sourceCourseId: "ait.kk.K2022", targetCourseId: "ait.kk.K2065", kind: "soft", sourcePage: 115, path: "M 633 475 H 662" },
  { sourceCourseId: "ait.kk.K2022", targetCourseId: "ait.kk.K2089", kind: "soft", sourcePage: 115, path: "M 633 475 H 952" },
  { sourceCourseId: "ait.kk.K2022", targetCourseId: "ait.kk.K2097", kind: "soft", sourcePage: 115, path: "M 633 475 H 647 V 433 H 662" },
  { sourceCourseId: "ait.kk.K2083", targetCourseId: "ait.kk.K3005", kind: "hard", sourcePage: 115, path: "M 633 697 H 647 V 563 H 952" },
  { sourceCourseId: "ait.kk.K2065", targetCourseId: "ait.kk.K2066", kind: "hard", sourcePage: 115, path: "M 778 474 H 808" },
  { sourceCourseId: "ait.kk.K2095", targetCourseId: "ait.kk.K2037", kind: "hard", sourcePage: 115, path: "M 1068 433 H 1098" },
  { sourceCourseId: "ait.kk.K1007", targetCourseId: "ait.kk.K2070", kind: "hard", sourcePage: 115, path: "M 778 620 H 808" },
  { sourceCourseId: "ait.kk.K2070", targetCourseId: "ait.kk.K2091", kind: "hard", sourcePage: 115, path: "M 924 620 H 952" },
  { sourceCourseId: "ait.kk.K1007", targetCourseId: "ait.kk.K3001", kind: "soft", sourcePage: 115, path: "M 778 620 H 797 V 663 H 952" },
  { sourceCourseId: "ait.kk.K2083", targetCourseId: "ait.kk.K3002", kind: "hard", sourcePage: 115, path: "M 633 697 H 1098" },
  { sourceCourseId: "ait.kk.K3005", targetCourseId: "ait.kk.K3002", kind: "soft", sourcePage: 115, path: "M 1068 563 H 1082 V 697 H 1098" },
  { sourceCourseId: "ait.kk.K2035", targetCourseId: "ait.kk.K2068", kind: "soft", sourcePage: 115, path: "M 486 754 H 662" },
  { sourceCourseId: "ait.kk.K2068", targetCourseId: "ait.kk.K2069", kind: "hard", sourcePage: 115, path: "M 778 754 H 808" },
  { sourceCourseId: "ait.kk.K2069", targetCourseId: "ait.kk.K1015", kind: "soft", sourcePage: 115, path: "M 924 754 H 952" },
  { sourceCourseId: "ait.kk.K2069", targetCourseId: "ait.kk.K3004", kind: "soft", sourcePage: 115, path: "M 924 754 H 938 V 796 H 952" },
  { sourceCourseId: "ait.kk.K2118", targetCourseId: "ait.kk.K1015", kind: "soft", sourcePage: 115, path: "M 924 796 H 938 V 754 H 952" },
  { sourceCourseId: "ait.kk.K1015", targetCourseId: "ait.kk.K3003", kind: "soft", sourcePage: 115, path: "M 1068 754 H 1098" },
  { sourceCourseId: "ait.kk.K3004", targetCourseId: "ait.kk.K3003", kind: "soft", sourcePage: 115, path: "M 1068 796 H 1082 V 754 H 1098" },
  { sourceCourseId: "ait.kk.K3084", targetCourseId: "ait.kk.K2085", kind: "hard", sourcePage: 115, path: "M 778 850 H 808" },
  { sourceCourseId: "ait.kk.K2085", targetCourseId: "ait.kk.K1016", kind: "hard", sourcePage: 115, path: "M 924 850 H 952" },
  { sourceCourseId: "ait.kk.K1016", targetCourseId: "ait.kk.K1018", kind: "hard", sourcePage: 115, path: "M 1212 850 H 1242" },
];

/**
 * 114頁の下端と115頁の上端で続く、元図上の名前を持たない幹線。
 *
 * 先修条件そのものではないため科目データには混在させない。各ページの
 * 元座標で記録し、合成時だけ115頁を kkTreePageTwoOffset 分だけ移動する。
 */
const kk2026TreeContinuationLines: TreeContinuationLine[] = [
  // 114頁の下端: 線形代数Ⅱ・物理系から紙面外へ続く3本の実線。
  { kind: "hard", sourcePage: 114, path: "M 640 943 V 1064" },
  { kind: "hard", sourcePage: 114, path: "M 782 824 V 1064" },
  { kind: "hard", sourcePage: 114, path: "M 790 824 V 1064" },
  // 114頁のデータサイエンス基礎数理から続く破線。
  { kind: "soft", sourcePage: 114, path: "M 720 904 V 1064" },
  { kind: "soft", sourcePage: 114, path: "M 800 824 V 1064" },

  // 115頁の上端: 上記の幹線を、資料と同じ X 座標・太さで受ける。
  { kind: "hard", sourcePage: 115, path: "M 637 0 V 690" },
  { kind: "hard", sourcePage: 115, path: "M 780 0 V 790" },
  { kind: "hard", sourcePage: 115, path: "M 789 0 V 790" },
  { kind: "soft", sourcePage: 115, path: "M 797 0 V 230 H 938 V 286" },
  { kind: "soft", sourcePage: 115, path: "M 647 432 V 558 H 1082 V 697" },
];

export const kkCurriculumTree: CurriculumTree = {
  id: "kk-2026-combined",
  width: 1506,
  height: kkTreePageTwoOffset + specialization.height,
  areas: [...foundation.areas, ...specialization.areas.map((area) => offsetArea(area, kkTreePageTwoOffset))],
  placements: [...foundation.placements, ...specialization.placements.map((placement) => offsetPlacement(placement, kkTreePageTwoOffset))],
  links: kk2026TreeCourseLinks,
  continuationLines: kk2026TreeContinuationLines,
};

export function curriculumTreeCourseIdsFromTree(tree: CurriculumTree) {
  return tree.placements.flatMap((placement) => placement.type === "course" ? [placement.courseId] : placement.courseIds);
}

export type TreeCourseBounds = {
  courseId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * 選択可能な各科目ボタンの実際の矩形。帯状に表示する科目も、クリック領域
 * ごとに分解して返す。テストで重なりを検出するため、描画側と同じ算出式にする。
 */
export function curriculumTreeCourseBounds(tree: CurriculumTree): TreeCourseBounds[] {
  return tree.placements.flatMap((placement) => {
    if (placement.type === "course") return [{ courseId: placement.courseId, x: placement.x, y: placement.y, width: placement.width, height: placement.height }];
    const itemWidth = placement.width / placement.courseIds.length;
    return placement.courseIds.map((courseId, index) => ({
      courseId,
      x: placement.x + itemWidth * index,
      y: placement.y,
      width: itemWidth,
      height: placement.height,
    }));
  });
}
