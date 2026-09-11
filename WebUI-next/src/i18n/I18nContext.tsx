import { createContext, useContext, type ReactNode } from 'react';
import type { I18nMap } from '../api';

/**
 * 翻译表通过 Context 下发，而不是一层层传 props。
 *
 * 这样视图组件仍然只接收 `items`（见 views/types.ts 的架构约束），
 * 却随时能拿到文案——两者不再互相污染。
 */
const I18nContext = createContext<I18nMap>({});

export function I18nProvider({ map, children }: { map: I18nMap; children: ReactNode }) {
  return <I18nContext.Provider value={map}>{children}</I18nContext.Provider>;
}

/**
 * 返回一个翻译函数。
 *
 * 找不到 key 时**原样返回 key**，而不是空串——界面上会显示
 * `iatag_slot_xxx`，比一片空白更容易定位"哪条漏翻了"。
 */
export function useTranslation(): (key: string) => string {
  const map = useContext(I18nContext);
  return (key: string) => map[key] ?? key;
}
