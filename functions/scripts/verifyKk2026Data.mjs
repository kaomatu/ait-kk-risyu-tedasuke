import assert from "node:assert/strict";
import { kkSeedCourses } from "../lib/seed.js";
import { normalOfferingLedger, lotteryOfferingLedger } from "../lib/kk2026Ledgers.js";

const sourceRows = (ledger) => ledger.split("\n").filter((line) => line.includes("|"));
const normalRows = sourceRows(normalOfferingLedger);
const lotteryRows = sourceRows(lotteryOfferingLedger);
const offerings = kkSeedCourses.flatMap((course) => course.offerings.map((offering) => ({ ...offering, course })));

function assertNoUndefined(value, path = "dataset") {
  assert.notEqual(value, undefined, `${path} に undefined が含まれています`);
  if (Array.isArray(value)) value.forEach((item, index) => assertNoUndefined(item, `${path}[${index}]`));
  else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => assertNoUndefined(item, `${path}.${key}`));
}

assert.equal(normalRows.length, 147, "通常時間割（PDF 1〜8頁）の原簿件数");
assert.equal(lotteryRows.length, 216, "抽選時間割（PDF 9〜12頁）の原簿件数");
assert.equal(new Set(normalRows).size, normalRows.length, "通常時間割の原簿に重複行がないこと");
assert.equal(new Set(lotteryRows).size, lotteryRows.length, "抽選時間割の原簿に重複行がないこと");
assert.equal(offerings.length, 349, "KK用データセットの開講数（原簿の実在する掲載行のみ）");
assert.equal(offerings.filter((offering) => offering.lottery).length, 202, "抽選開講数");
assert.equal(offerings.filter((offering) => offering.lottery && offering.eligibleForProgram !== false).length, 202, "KK学生が申請可能な抽選開講数");
assert.equal(new Set(offerings.map((offering) => offering.id)).size, offerings.length, "開講IDが一意であること");
assert.ok(offerings.every((offering) => offering.lottery || !offering.notes?.includes("抽選")), "抽選の注記がある開講は必ず抽選扱いになること");
assert.ok(kkSeedCourses.every((course) => !course.id.startsWith("ait.kk.schedule-only.") || course.offerings.some((offering) => offering.eligibleForProgram !== false)), "対象外のみの時間割専用科目をKKの候補に出さないこと");

const courseByCode = new Map(kkSeedCourses.map((course) => [course.code, course]));
const linearAlgebra2 = courseByCode.get("K2061");
assert.deepEqual(
  linearAlgebra2?.offerings.map((offering) => [offering.term, offering.weekday, offering.periods, offering.classCode, offering.room]),
  [["fall", "tue", [3], "11", "G2507"], ["fall", "tue", [3], "21", "G2505"]],
  "線形代数Ⅱを1年後期・火曜III限の2クラスとして取り込むこと",
);
assert.equal(courseByCode.get("G2008")?.name, "健康・スポーツ科学実習Ⅰ", "教育課程表の正式コードを使用すること");

const kkLotteryWithoutOfficialCode = [
  "インターネットビジネス論", "カラーデザイン", "ゲームプログラミング", "サウンドメディア論",
  "ディジタル映像処理及び演習", "デジタルコンテンツ基礎", "ベンチャービジネス論", "メディア文化論",
  "メディア英語", "ユーザインタフェース", "映像制作及び演習", "映像制作概論", "経営学概論",
];
for (const name of kkLotteryWithoutOfficialCode) {
  const course = kkSeedCourses.find((candidate) => candidate.name === name);
  assert.equal(course?.officialCode, false, `${name} は資料内で公式コード未確認として扱うこと`);
  assert.ok(course?.offerings.some((offering) => offering.lottery && offering.eligibleForProgram !== false), `${name} の抽選開講を取り込むこと`);
}

assertNoUndefined(kkSeedCourses);
console.log(JSON.stringify({
  courses: kkSeedCourses.length,
  offerings: offerings.length,
  lotteryOfferings: offerings.filter((offering) => offering.lottery).length,
  eligibleOfferings: offerings.filter((offering) => offering.eligibleForProgram !== false).length,
  status: "ok",
}, null, 2));
