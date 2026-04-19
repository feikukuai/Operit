import { formatTime } from '../../../util/chatUtils';
import type { WebChatMessage } from '../../../util/chatTypes';

export function SummaryMessageComposable({
  message
}: {
  message: WebChatMessage;
}) {
  return (
    <article className="summary-message-composable">
      <div className="summary-message-meta">
        <strong>系统摘要</strong>
        <span>{formatTime(message.timestamp)}</span>
      </div>
      <p>{message.content_raw}</p>
    </article>
  );
}
