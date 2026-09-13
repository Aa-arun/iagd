import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * 界面偏好：**快捷键**与**字体**（使用者 2026-09-13 要求）。
 *
 * ★ 为什么这些东西不进 C# 的 `settings.json`：
 *   它们纯粹是浏览器这边的观感，后端既不读也不用；而设置里能改的那些项
 *   （隐藏技能、仓库、备份目录）都是**后端真的会用**的东西。把纯前端偏好
 *   塞进后端设置意味着改一次 C# DTO + 存储 + 序列化，收益为零。
 *   所以这里跟视图 / 分页 / 过滤条件一样，存 localStorage。
 *
 * ★ 为什么要做成 Context：快捷键在主界面（AppShell）被消费、在设置页被修改，
 *   字体在设置页被修改、在列表与详情面板生效。分散成各自的 hook 就没法同步。
 */

/** 四个可自定义的快捷键。`search`（/）固定，但同样放在这里统一管。 */
export interface Shortcuts {
  /** 聚焦搜索框 */
  search: string;
  /** 主界面：展开 / 收起过滤面板；专注模式：打开过滤器设置 */
  filter: string;
  /** 打开 / 关闭高级搜索 */
  advanced: string;
  /** 进入 / 退出专注模式 */
  focus: string;
}

export interface UiPrefs {
  shortcuts: Shortcuts;
  /** 「详细对照」属性区的字体族；空 = 跟随全局默认 */
  compareFontFamily: string;
  /** 「详细对照」属性区的字号倍率（1 = 原始） */
  compareFontScale: number;
  /** 固定栏详情的字体族；空 = 跟随全局默认 */
  detailFontFamily: string;
  /** 固定栏详情的字号倍率（1 = 原始） */
  detailFontScale: number;
}

export const DEFAULT_SHORTCUTS: Shortcuts = {
  search: '/',
  filter: 'f',
  advanced: 's',
  focus: 'i',
};

export const DEFAULT_UI_PREFS: UiPrefs = {
  shortcuts: DEFAULT_SHORTCUTS,
  compareFontFamily: '',
  compareFontScale: 1,
  detailFontFamily: '',
  detailFontScale: 1,
};

/** 字号倍率的允许区间。太小的会看不清，太大的会把布局撑破。 */
export const SCALE_MIN = 0.5;
export const SCALE_MAX = 2;

const STORAGE_KEY = 'iagd.uiPrefs';

/** 读取存下来的倍率：非法值（手改坏 / 旧版本）一律退回默认。 */
function readScale(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(SCALE_MAX, Math.max(SCALE_MIN, value));
}

/** 快捷键必须是**单个字符**——多字符没法用 `keydown` 的 `e.key` 比对。 */
function readKey(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length === 1 ? value : fallback;
}

function readFont(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readPrefs(): UiPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_UI_PREFS;

    const stored = JSON.parse(raw) as Partial<UiPrefs> & { shortcuts?: Partial<Shortcuts> };
    const shortcuts: Partial<Shortcuts> = stored.shortcuts ?? {};

    return {
      shortcuts: {
        search: readKey(shortcuts.search, DEFAULT_SHORTCUTS.search),
        filter: readKey(shortcuts.filter, DEFAULT_SHORTCUTS.filter),
        advanced: readKey(shortcuts.advanced, DEFAULT_SHORTCUTS.advanced),
        focus: readKey(shortcuts.focus, DEFAULT_SHORTCUTS.focus),
      },
      compareFontFamily: readFont(stored.compareFontFamily),
      compareFontScale: readScale(stored.compareFontScale, 1),
      detailFontFamily: readFont(stored.detailFontFamily),
      detailFontScale: readScale(stored.detailFontScale, 1),
    };
  } catch {
    return DEFAULT_UI_PREFS;
  }
}

interface UiPrefsValue {
  prefs: UiPrefs;
  /** 合并式更新（只写传入的字段） */
  update: (patch: Partial<UiPrefs>) => void;
  updateShortcut: (key: keyof Shortcuts, value: string) => void;
  resetShortcuts: () => void;
}

const UiPrefsContext = createContext<UiPrefsValue | null>(null);

export function UiPrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<UiPrefs>(readPrefs);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* 存不了就算了，只是下次打开回到默认值 */
    }
  }, [prefs]);

  /**
   * 把字体偏好落到 CSS 变量上（`styles/global.css` 里定义默认值，这里只覆盖）。
   *
   * ★ 空字体族要 `removeProperty` 而不是设成空串：空串是**非法的 font-family**，
   *   会让整条声明失效——那倒也无害，但会让"跟着全局默认"这条 CSS 回退链看不出效果。
   */
  useEffect(() => {
    const root = document.documentElement;

    const setVar = (name: string, value: string) => {
      if (value) root.style.setProperty(name, value);
      else root.style.removeProperty(name);
    };

    setVar('--compare-font-family', prefs.compareFontFamily);
    setVar('--detail-font-family', prefs.detailFontFamily);
    root.style.setProperty('--compare-font-scale', String(prefs.compareFontScale));
    root.style.setProperty('--detail-font-scale', String(prefs.detailFontScale));
  }, [prefs]);

  const update = useCallback((patch: Partial<UiPrefs>) => {
    setPrefs((current) => ({ ...current, ...patch }));
  }, []);

  /**
   * 改一个快捷键。
   *
   * ★ 冲突处理：如果这个键已经被**另一个**功能占用，两项**互换**——
   *   不会出现两个功能共用一个键（那样按一下会触发两件事）。
   *   交换比"拒绝修改"顺手：键位总数固定，想腾出来通常就是想换过去。
   *
   * 输入框清空（Backspace）时退回默认键；默认键若也被占用，同样走交换。
   */
  const updateShortcut = useCallback((key: keyof Shortcuts, value: string) => {
    setPrefs((current) => {
      const next: Shortcuts = { ...current.shortcuts };
      const wanted = value || DEFAULT_SHORTCUTS[key];

      const clash = (Object.keys(next) as (keyof Shortcuts)[]).find(
        (other) => other !== key && next[other] === wanted,
      );
      if (clash) next[clash] = next[key];

      next[key] = wanted;
      return { ...current, shortcuts: next };
    });
  }, []);

  const resetShortcuts = useCallback(() => {
    setPrefs((current) => ({ ...current, shortcuts: DEFAULT_SHORTCUTS }));
  }, []);

  const value = useMemo<UiPrefsValue>(
    () => ({ prefs, update, updateShortcut, resetShortcuts }),
    [prefs, update, updateShortcut, resetShortcuts],
  );

  return <UiPrefsContext.Provider value={value}>{children}</UiPrefsContext.Provider>;
}

export function useUiPrefs(): UiPrefsValue {
  const ctx = useContext(UiPrefsContext);
  if (!ctx) {
    throw new Error('useUiPrefs 必须在 <UiPrefsProvider> 内使用');
  }
  return ctx;
}

/**
 * 判断键盘事件是不是"用户在输入框里打字"。
 *
 * ★ 快捷键处理里必须排除它：否则在搜索框里输入 "safe" 会依次触发 s…
 *   （同时把字符吞掉）。
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}
