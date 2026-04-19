import { ChevronDownIcon, ChevronUpIcon, HistoryIcon, LinkIcon, TuneIcon } from '../../../../util/chatIcons';

export function ClassicChatSettingsBar({
  contextPercent,
  onToggleSettings,
  settingsOpen
}: {
  contextPercent: number;
  onToggleSettings: () => void;
  settingsOpen: boolean;
}) {
  return (
    <div className="classic-chat-settings-bar">
      <button
        aria-expanded={settingsOpen}
        className={`classic-settings-anchor ${settingsOpen ? 'is-active' : ''}`}
        onClick={onToggleSettings}
        type="button"
      >
        <TuneIcon size={22} />
      </button>

      {settingsOpen ? (
        <div className="classic-settings-popup" role="dialog">
          <button className="classic-settings-popup-row" type="button">
            <span className="classic-settings-popup-icon">
              <HistoryIcon size={16} />
            </span>
            <span className="classic-settings-popup-copy">
              <strong>模型配置</strong>
              <em>{contextPercent}%</em>
            </span>
            <span className="classic-settings-popup-chevron">
              <ChevronUpIcon size={14} />
            </span>
          </button>

          <button className="classic-settings-popup-row" type="button">
            <span className="classic-settings-popup-icon">
              <LinkIcon size={16} />
            </span>
            <span className="classic-settings-popup-copy">
              <strong>记忆</strong>
              <em>{contextPercent}%</em>
            </span>
            <span className="classic-settings-popup-chevron">
              <ChevronDownIcon size={14} />
            </span>
          </button>

          <button className="classic-settings-popup-row" type="button">
            <span className="classic-settings-popup-icon">
              <TuneIcon size={16} />
            </span>
            <span className="classic-settings-popup-copy">
              <strong>设置选项</strong>
              <em>{contextPercent}%</em>
            </span>
            <span className="classic-settings-popup-chevron">
              <ChevronDownIcon size={14} />
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
