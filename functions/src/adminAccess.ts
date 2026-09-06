/** ツール1の操作を許可する運営者アカウント。利用者IDは小文字で管理する。 */
const ADMIN_ACCOUNT_USERNAMES = new Set(["k26008"]);

export function isAdministratorUsername(username: string) {
  return ADMIN_ACCOUNT_USERNAMES.has(username.trim().toLowerCase());
}
