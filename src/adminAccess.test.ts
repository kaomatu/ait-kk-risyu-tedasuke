import { describe, expect, it } from "vitest";
import { isAdministratorUsername } from "../functions/src/adminAccess";

describe("ツール1の管理者アクセス", () => {
  it("指定された管理者IDだけがツール1の権限を受け取る", () => {
    expect(isAdministratorUsername("k26008")).toBe(true);
    expect(isAdministratorUsername("student_01")).toBe(false);
    expect(isAdministratorUsername("K26008")).toBe(true);
  });
});
