import { useCallback, useEffect, useState } from 'react';
import {
  configureGrimDawn,
  fetchGrimDawnInstalls,
  fetchGrimDawnMods,
  fetchMaintenanceStatus,
  startClearCache,
  startLoadDatabase,
  type GrimDawnLocation,
  type LiveMaintenance,
  type MaintenanceState,
} from '../../api';
import './MaintenanceView.css';

interface Props {
  /**
   * WebSocket 推来的维护状态。
   *
   * 只用它判断"忙不忙"（禁用按钮）。**进度显示不在这里**——整屏的维护遮罩
   * 已经显示了任务名、阶段和百分比，在这里再放一份就是同一件事说两遍
   * （2026-09-12 使用者反馈）。
   */
  live: LiveMaintenance | null;
}

/** 一次提示：成功/失败 + 文案。 */
interface Feedback {
  ok: boolean;
  text: string;
}

/**
 * 「数据库」页：把原来 WinForms 的数据库 / Mods 维护窗口搬过来。
 *
 * 三个操作：
 * - **加载数据库**：重新解析游戏数据（分钟级、会先清空游戏数据）
 * - **配置**：手工指定 Grim Dawn 安装目录
 * - **更新项目统计**：重算所有物品的属性（旧界面上叫 Clear cache）
 *
 * ⚠️ 旧界面上的「清除数据库」**故意没有搬过来**：它做的事
 *    「加载数据库」的第一步就做了（先 `Clean()` 再解析），没有它做不到的事，
 *    却能把界面变成一个"物品还在、但没名字没属性"的状态。
 *    后端端点 `/api/maintenance/clean` 仍在，但网页不提供入口。
 */
export default function MaintenanceView({ live }: Props) {
  const [installs, setInstalls] = useState<GrimDawnLocation[]>([]);
  const [mods, setMods] = useState<GrimDawnLocation[]>([]);
  const [install, setInstall] = useState('');
  const [mod, setMod] = useState('');
  const [status, setStatus] = useState<MaintenanceState | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [pathInput, setPathInput] = useState('');
  const [loading, setLoading] = useState(true);

  const refreshLists = useCallback(async () => {
    const [nextInstalls, nextMods] = await Promise.all([fetchGrimDawnInstalls(), fetchGrimDawnMods()]);
    setInstalls(nextInstalls);
    setMods(nextMods);
    setInstall((current) => current || nextInstalls[0]?.path || '');
  }, []);

  // 初次加载：列表 + 当前状态（页面刷新后靠它恢复进度，WS 只在状态变化时推）
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [nextInstalls, nextMods, nextStatus] = await Promise.all([
          fetchGrimDawnInstalls(),
          fetchGrimDawnMods(),
          fetchMaintenanceStatus(),
        ]);
        if (cancelled) return;

        setInstalls(nextInstalls);
        setMods(nextMods);
        setStatus(nextStatus);
        setInstall(nextInstalls[0]?.path ?? '');
      } catch (err) {
        if (!cancelled) setFeedback({ ok: false, text: (err as Error).message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // WS 推来的状态优先；没有推送时（页面刚打开、或任务刚结束）回落到 REST 状态。
  const busy = live ? live.active : (status?.busy ?? false);

  // ⚠️ 维护结束时 App 会把状态置成 `null`（而不是 `{active:false}`），
  // 所以这里不能只等 `live.active === false` —— 那样 `status` 永远停在旧的
  // `busy: true`，按钮会一直禁用、要切一次标签页（组件重新挂载）才恢复。
  // 2026-09-12 使用者实测反馈。
  useEffect(() => {
    if (live) {
      return;
    }

    // `live` 为空：要么是刚打开页面，要么是任务刚结束。两种情况都该拉一次权威状态。
    fetchMaintenanceStatus()
      .then(setStatus)
      .catch(() => undefined);
    refreshLists().catch(() => undefined);
  }, [live, refreshLists]);

  const run = async (label: string, action: () => Promise<{ success: boolean; error?: string }>) => {
    setFeedback(null);
    try {
      const result = await action();
      if (!result.success) {
        setFeedback({ ok: false, text: result.error ?? `${label}失败` });
        return;
      }

      // 成功不报文案：接下来遮罩会立刻接管整个界面，这里再写一句"已开始…"
      // 就是同一件事说两遍（使用者反馈过这个重复）。
      // 状态本身由 WS 推来；这里只是立刻拿一次，避免页面刚打开时的空档。
      fetchMaintenanceStatus().then(setStatus).catch(() => undefined);
    } catch (err) {
      setFeedback({ ok: false, text: (err as Error).message });
    }
  };

  const onLoad = () => {
    if (!install) {
      setFeedback({ ok: false, text: '先选一个 Grim Dawn 安装。' });
      return;
    }

    // 会先清空整个游戏数据库，然后解析几分钟——值得确认一次
    const ok = window.confirm(
      '加载数据库会先清空游戏数据，然后重新解析（可能要好几分钟）。\n' +
        '这期间网页上的物品查询会被暂停。确定继续吗？',
    );
    if (!ok) return;

    run('加载数据库', () => startLoadDatabase(install, mod || undefined));
  };

  const onClearCache = () => run('更新项目统计', startClearCache);

  const onConfigure = async () => {
    const value = pathInput.trim();
    if (!value) {
      setFeedback({ ok: false, text: '请填写 Grim Dawn 安装目录的完整路径。' });
      return;
    }

    setFeedback(null);
    try {
      const result = await configureGrimDawn(value);
      if (!result.success) {
        setFeedback({ ok: false, text: result.error ?? '添加失败' });
        return;
      }

      setPathInput('');
      setFeedback({ ok: true, text: '已添加。' });
      await refreshLists();
    } catch (err) {
      setFeedback({ ok: false, text: (err as Error).message });
    }
  };

  const errorText = live?.error ?? status?.error;

  return (
    <section className="maintenance">
      <p className="maintenance__intro">
        这些操作针对的是**游戏数据**（物品的名称与属性从游戏文件里解析而来），
        不是你自己拥有的物品。游戏更新后如果新物品显示不出名字，就来这里重新加载。
      </p>

      {errorText && <div className="maintenance__error">上次任务出错：{errorText}</div>}

      {loading ? (
        <p className="app__loading">加载中…</p>
      ) : (
        <>
          <div className="maintenance__row">
            <label className="maintenance__label" htmlFor="maintenance-install">
              游戏安装
            </label>
            <select
              id="maintenance-install"
              className="maintenance__select"
              value={install}
              onChange={(e) => setInstall(e.target.value)}
              disabled={busy}
            >
              {installs.length === 0 && <option value="">（没找到 Grim Dawn 安装）</option>}
              {installs.map((entry) => (
                <option key={entry.path} value={entry.path}>
                  {entry.name} — {entry.path}
                </option>
              ))}
            </select>
          </div>

          <div className="maintenance__row">
            <label className="maintenance__label" htmlFor="maintenance-mod">
              Mod
            </label>
            <select
              id="maintenance-mod"
              className="maintenance__select"
              value={mod}
              onChange={(e) => setMod(e.target.value)}
              disabled={busy}
            >
              <option value="">（原版，不加载 mod）</option>
              {mods.map((entry) => (
                <option key={entry.path} value={entry.path}>
                  {entry.name}
                </option>
              ))}
            </select>
          </div>

          <div className="maintenance__actions">
            <button type="button" className="maintenance__button" onClick={onLoad} disabled={busy}>
              加载数据库
            </button>
            <button type="button" className="maintenance__button" onClick={onClearCache} disabled={busy}>
              更新项目统计
            </button>
          </div>

          <div className="maintenance__configure">
            <h3>配置</h3>
            <p className="maintenance__hint">
              IA 一般能自己找到游戏。找不到时，把 Grim Dawn 安装目录的完整路径粘到这里
              （目录里应当有 <code>Grim Dawn.exe</code>）。
              <br />
              浏览器出于安全不允许网页打开系统的文件夹选择框，所以这里是手填路径。
            </p>
            <div className="maintenance__configure-row">
              <input
                className="maintenance__input"
                type="text"
                placeholder="例如 C:\Program Files (x86)\Steam\steamapps\common\Grim Dawn"
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                disabled={busy}
              />
              <button type="button" className="maintenance__button" onClick={onConfigure} disabled={busy}>
                添加
              </button>
            </div>
          </div>
        </>
      )}

      {feedback && (
        <p className={feedback.ok ? 'maintenance__ok' : 'maintenance__fail'}>{feedback.text}</p>
      )}
    </section>
  );
}
