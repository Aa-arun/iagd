import { useEffect, useState } from 'react';
import { fetchSettings, saveSettings, type AppSettings, type SettingsUpdate } from '../../api';
import './SettingsView.css';

/** 公共仓库数量（游戏固定 6 个；C# 那边 `StashTabPicker` 也硬编码 6） */
const STASH_COUNT = 6;

/**
 * 设置。
 *
 * 改动**立即保存**（不做"保存"按钮）：设置项都是单个开关，多一步确认只会碍事。
 * 提交的是**增量**——只发改动的那个字段，后端按"未提供的字段 = 不改"处理。
 */
export default function SettingsView() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

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

  const update = (patch: SettingsUpdate) => {
    // 乐观更新：先改界面，再发请求。设置都是幂等的开关，失败时下面会显示错误。
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    saveSettings(patch)
      .then(() => setSavedAt(Date.now()))
      .catch((err: Error) => setError(err.message));
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
          label="压缩备份"
          hint="备份打成 zip，省磁盘"
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

      <p className="settings-saved">{savedAt ? '已保存' : '\u00a0'}</p>
    </div>
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
