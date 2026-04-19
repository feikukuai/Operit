import { AttachmentChip } from '../../AttachmentChip';
import { CustomXmlRenderer } from '../../part/CustomXmlRenderer';
import { assistantCompactMeta } from '../../../util/chatUtils';
import type { WebChatMessage, WebThemeSnapshot } from '../../../util/chatTypes';

export function AiMessageComposable({
  message,
  theme
}: {
  message: WebChatMessage;
  theme: WebThemeSnapshot | null;
}) {
  const detailText = assistantCompactMeta(message, theme);

  return (
    <article className="cursor-ai-message">
      <div className="cursor-message-header">
        <strong className="cursor-message-label">Response</strong>
        {detailText ? <span className="cursor-message-detail">{detailText}</span> : null}
      </div>
      <div className="chat-message-content cursor-ai-body">
        <CustomXmlRenderer
          blocks={message.content_blocks}
          content={message.content_raw}
          showStatusTags={theme?.show_status_tags ?? true}
          showThinking={theme?.show_thinking_process ?? true}
          streaming={message.streaming === true}
          toolCollapseMode={theme?.display.tool_collapse_mode ?? 'all'}
        />
      </div>
      {message.attachments.length ? (
        <div className="chat-message-attachments cursor-attachment-row">
          {message.attachments.map((attachment) => (
            <AttachmentChip attachment={attachment} key={attachment.id} />
          ))}
        </div>
      ) : null}
    </article>
  );
}
