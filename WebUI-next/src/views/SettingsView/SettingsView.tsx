import { useEffect, useRef, useState } from 'react';
import {
  fetchSettings,
  importSettings,
  openFolder,
  resetSettings,
  saveSettings,
  SETTINGS_EXPORT_URL,
  type AppSettings,
  type SettingsUpdate,
} from '../../api';
import './SettingsView.css';

/** 公共仓库数量（游戏固定 6 个；C# 那边 `StashTabPicker` 也硬编码 6） */
const STASH_COUNT = 6;

/** "已保存"提示显示多久后开始淡出 */
const SAVED_VISIBLE_MS = 1000;

/**
 * 设置。
 *
 * 改动**立即保存**（不做"保存"按钮）：设置项都是单个开关，多一步确认只会碍事。
 * 提交的是**增量**——只发改动的那个字段，后端按"未提供的字段 = 不改"处理。
 */
export default function SettingsView() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  /** 淡出定时器：连续改动时要把上一个清掉，否则提示会提前消失 */
  const hideTimer = useRef<number | null>(null);
  /** 第二栏「动作」的反馈（重置/导入的后果比保存设置严重得多，要单独说清楚） */
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSettings()
      .then((res) => {
        if (!cancelled) setSettings(res);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 卸载时清掉定时器，避免对已卸载的组件 setState
  useEffect(
    () => () => {
      if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    },
    [],
  );

  const flashSaved = () => {
    if (hideTimer.current !== null) window.clearTimeout(hideTimer.current);
    setShowSaved(true); // 立即出现（CSS 里这一步是"硬切入"，没有过渡）
    hideTimer.current = window.setTimeout(() => setShowSaved(false), SAVED_VISIBLE_MS);
  };

  const update = (patch: SettingsUpdate) => {
    // 乐观更新：先改界面，再发请求。设置都是幂等的开关，失败时下面会显示错误。
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    saveSettings(patch)
      .then(flashSaved)
      .catch((err: Error) => setError(err.message));
  };

  // ── 第二栏：动作 ──────────────────────────────────────────────────────

  const handleReset = async () => {
    const confirmed = window.confirm(
      '确定要重置设置吗？\n\n' +
        '· 当前的设置文件会先自动备份一份\n' +
        '· 物品数据不受影响\n' +
        '· 立即生效，不需要重启程序',
    );
    if (!confirmed) return;

    setActionMessage('正在重置…');
    try {
      const result = await resetSettings();
      // 用后端返回的新值直接刷新界面——热重置，程序没重启
      setSettings(result.settings);
      flashSaved();
      setActionMessage(
        result.backup ? `已重置，原设置已备份到：${result.backup}` : '已重置',
      );
    } catch (err) {
      setActionMessage('重置失败：' + (err as Error).message);
    }
  };

  const handleImportFile = async (file: File) => {
    setActionMessage('正在导入…');
    try {
      await importSettings(await file.text());
      setActionMessage('设置已导入，程序正在重启…');
    } catch (err) {
      setActionMessage('导入失败：' + (err as Error).message);
    }
  };

  const handleOpen = async (target: 'backups' | 'logs') => {
    try {
      await openFolder(target);
    } catch (err) {
      setActionMessage('打开目录失败：' + (err as Error).message);
    }
  };

  if (error) {
    return <p className="app__loading">读取设置失败：{error}</p>;
  }
  if (!settings) {
    return <p className="app__loading">加载中…</p>;
  }

  // 与 C# 的 StashTabPicker 同一条约束：两个仓库不能是同一个（且都非 0），
  // 否则存进去的物品会被自己取出来，来回打架。
  const stashConflict =
    settings.stashToDepositTo === settings.stashToLootFrom && settings.stashToDepositTo !== 0;

  return (
    <div className="settings-layout">
      {/* ── 第一栏：设置项 ── */}
      <div className="settings">
        <section className="settings-section">
        <h2 className="settings-section__title">界面</h2>

        <Toggle
          label="隐藏技能"
          hint="物品上的技能说明默认收起"
          checked={settings.hideSkills}
          onChange={(v) => update({ hideSkills: v })}
        />
      </section>

      <section className="settings-section">
        <h2 className="settings-section__title">搜索</h2>

        <Toggle
          label="搜索延迟"
          hint="输入后稍等片刻再查询，减少连续输入时的请求"
          checked={settings.preferDelayedSearch}
          onChange={(v) => update({ preferDelayedSearch: v })}
        />
      </section>

      <section className="settings-section">
        <h2 className="settings-section__title">物品转移</h2>

        <Toggle
          label="转移到任意 Mod"
          hint="允许把物品转移到任意 Mod 的仓库，而不限于当前 Mod"
          checked={settings.transferAnyMod}
          onChange={(v) => update({ transferAnyMod: v })}
        />

        <p className="settings-note">
          下面决定「物品从哪个公共仓库取出、存到哪个公共仓库」。
        </p>

        <div className="settings-stash">
          <StashGroup
            title="将物品移至"
            specialLabel="倒数第二个 公共仓库"
            value={settings.stashToDepositTo}
            onChange={(v) => update({ stashToDepositTo: v })}
          />
          <StashGroup
            title="放入"
            specialLabel="最后一个 公共仓库"
            value={settings.stashToLootFrom}
            onChange={(v) => update({ stashToLootFrom: v })}
          />
        </div>

        {stashConflict && (
          <p className="settings-warning">
            两项不能指向同一个仓库——那样存进去的物品会被立刻取回来。请换一个。
          </p>
        )}

        <p className="settings-note settings-note--dim">
          改动这项后，可能需要重启 Grim Dawn 才生效。
        </p>
      </section>

      <section className="settings-section">
        <h2 className="settings-section__title">备份</h2>

        <Toggle
          label="额外备份到自定义目录"
          hint="备份内容是「角色存档 + 物品数据库」，打成按星期命名的 zip，每 30 分钟一次、保留最近 7 天（Monday.zip … Sunday.zip）。开启后会往下面的目录再存一份；默认位置（用户数据目录的 backup\\）始终会备份，关不掉。常见用法是指向 OneDrive 之类的同步目录"
          checked={settings.backupCustom}
          onChange={(v) => update({ backupCustom: v })}
        />

        <label className="settings-field">
          <span className="settings-field__label">备份目录</span>
          <input
            type="text"
            className="settings-field__input"
            value={settings.backupCustomLocation}
            placeholder="（默认位置）"
            onChange={(e) => setSettings({ ...settings, backupCustomLocation: e.target.value })}
            // 文本输入不做逐字保存，失焦时才提交
            onBlur={(e) => update({ backupCustomLocation: e.target.value })}
          />
        </label>
      </section>

        <p className={`settings-saved ${showSaved ? 'is-visible' : ''}`} aria-live="polite">
          已保存
        </p>
      </div>

      {/* ── 第二栏：动作 ── */}
      <aside className="settings-actions">
        <h2 className="settings-section__title">动作</h2>

        <ActionButton
          label="重置设置"
          hint="先自动备份一份设置，然后重启程序（物品数据不受影响）"
          onClick={handleReset}
          danger
        />

        <ActionButton
          label="导出设置"
          hint="把当前设置保存成文件"
          onClick={() => {
            // 直接指向后端的下载端点，浏览器会按 Content-Disposition 存成文件
            window.location.href = SETTINGS_EXPORT_URL;
          }}
        />

        <ActionButton
          label="导入设置"
          hint="从文件恢复设置（会重启程序）"
          onClick={() => fileInput.current?.click()}
        />
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            // 清空 value，否则连续选同一个文件不会再触发 change
            e.target.value = '';
            if (file) void handleImportFile(file);
          }}
        />

        <ActionButton label="查看备份" hint="打开备份目录" onClick={() => handleOpen('backups')} />
        <ActionButton label="查看日志" hint="打开日志目录" onClick={() => handleOpen('logs')} />

        {actionMessage && <p className="settings-action-message">{actionMessage}</p>}
      </aside>
    </div>
  );
}

function ActionButton({
  label,
  hint,
  onClick,
  danger,
}: {
  label: string;
  hint?: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`settings-action ${danger ? 'is-danger' : ''}`}
      onClick={onClick}
    >
      <span className="settings-action__label">{label}</span>
      {hint && <span className="settings-action__hint">{hint}</span>}
    </button>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="settings-toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="settings-toggle__label">{label}</span>
      {hint && <span className="settings-toggle__hint">{hint}</span>}
    </label>
  );
}

function StashGroup({
  title,
  specialLabel,
  value,
  onChange,
}: {
  title: string;
  specialLabel: string;
  value: number;
  onChange: (value: number) => void;
}) {
  // 两个组用同一个 name 会互相干扰，所以把 title 拼进 name 里
  const name = `stash-${title}`;

  const options = [
    { value: 0, label: specialLabel },
    ...Array.from({ length: STASH_COUNT }, (_, i) => ({
      value: i + 1,
      label: `公共仓库 ${i + 1}`,
    })),
  ];

  return (
    <fieldset className="stash-group">
      <legend className="stash-group__title">{title}</legend>
      {options.map((opt) => (
        <label className="stash-option" key={opt.value}>
          <input
            type="radio"
            name={name}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          <span>{opt.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
