// 世界书版本自检：酒馆导入新卡时如果已有同名世界书，会沿用旧的那本，补丁更新的内容进不去。
// 构建时世界书末尾有一条不启用的版本标记，这里拿它和角色卡版本比，对不上就提示玩家一键更新。
export const VERSION_ENTRY_NAME = '【版本标记】请勿修改';
const DISMISS_PREFIX = 'destiny-worldbook-check:';

export type WorldbookCheck =
  | { action: 'none' }
  | { action: 'prompt'; worldbook: string; cardVersion: string; bookVersion: string | null };

export function decideWorldbookCheck(input: {
  cardVersion: string | undefined;
  worldbook: string | null;
  hasEmbeddedBook: boolean;
  bookEntries: { name: string; content: string }[] | null;
}): WorldbookCheck {
  const { cardVersion, worldbook, hasEmbeddedBook, bookEntries } = input;
  // 没有版本号、没绑世界书、卡里没带世界书、世界书不存在：都交给酒馆自己处理。
  if (!cardVersion || !worldbook || !hasEmbeddedBook || !bookEntries) return { action: 'none' };
  const marker = bookEntries.find(entry => entry.name === VERSION_ENTRY_NAME);
  const bookVersion = marker?.content.trim() || null;
  if (bookVersion === cardVersion.trim()) return { action: 'none' };
  return { action: 'prompt', worldbook, cardVersion: cardVersion.trim(), bookVersion };
}

const escape = (text: string) => $('<div>').text(text).html();
const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};
function dismissed(key: string): boolean {
  try {
    return localStorage.getItem(DISMISS_PREFIX + key) === '1';
  } catch {
    return false;
  }
}
function dismiss(key: string): void {
  try {
    localStorage.setItem(DISMISS_PREFIX + key, '1');
  } catch {
    /* 浏览器不让存就算了，下次再提示 */
  }
}

let checkedFor = '';
let running = false;

export async function checkWorldbookVersion(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const char = getCharData('current');
    if (!char) return;
    const cardVersion = char.data?.character_version;
    const book = char.data?.character_book;
    const checkKey = `${char.avatar}|${cardVersion}`;
    if (checkedFor === checkKey) return;
    checkedFor = checkKey;
    const worldbook = getCharWorldbookNames('current').primary;
    let entries: { name: string; content: string }[] | null = null;
    if (worldbook) entries = await getWorldbook(worldbook).catch(() => null);
    const result = decideWorldbookCheck({
      cardVersion,
      worldbook,
      hasEmbeddedBook: Array.isArray(book?.entries) && book.entries.length > 0,
      bookEntries: entries,
    });
    if (result.action === 'none') return;
    const dismissKey = `${result.worldbook}|${result.cardVersion}|${result.bookVersion ?? '无标记'}`;
    if (dismissed(dismissKey)) return;

    const st = SillyTavern;
    const old = result.bookVersion ?? '更早的版本（没有版本标记）';
    const choice = await st.callGenericPopup(
      `<h3>世界书版本和角色卡不一致</h3>
       <p>角色卡是 <b>${escape(result.cardVersion)}</b>，正在用的世界书「${escape(result.worldbook)}」是 <b>${escape(old)}</b>。</p>
       <p>导入新卡时如果酒馆里已经有同名世界书，会沿用旧的那本，这次更新的设定就用不上。</p>
       <p>点「更新世界书」会用角色卡里自带的世界书替换它，旧世界书先另存一份备份。你自己改过世界书的话，改动在备份里。</p>`,
      st.POPUP_TYPE.CONFIRM,
      '',
      {
        okButton: '更新世界书',
        cancelButton: '这次先不更新',
        customButtons: [{ text: '这个版本不再提醒', result: st.POPUP_RESULT.CUSTOM1 }],
      },
    );
    if (choice === st.POPUP_RESULT.CUSTOM1) {
      dismiss(dismissKey);
      return;
    }
    if (choice !== st.POPUP_RESULT.AFFIRMATIVE) return;

    const backupName = `${result.worldbook}（${result.bookVersion ?? '旧版'} 备份 ${stamp()}）`;
    await createWorldbook(backupName, await getWorldbook(result.worldbook));
    await st.saveWorldInfo(result.worldbook, st.convertCharacterBook(book), true);
    await st.updateWorldInfoList();
    const after = await getWorldbook(result.worldbook);
    const marker = after.find(entry => entry.name === VERSION_ENTRY_NAME)?.content.trim();
    if (marker !== result.cardVersion) throw new Error('更新后读回的世界书版本不对');
    toastr.success(`世界书已更新到 ${result.cardVersion}，旧的另存为「${backupName}」`, '命定之诗', { timeOut: 8000 });
  } catch (error) {
    checkedFor = '';
    console.error('[命定之诗] 世界书版本检查失败', error);
    toastr.error(`世界书更新失败：${error instanceof Error ? error.message : String(error)}`, '命定之诗');
  } finally {
    running = false;
  }
}
