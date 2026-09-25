import ErrorBoundary from "@components/ErrorBoundary";
import { classNameFactory } from "@utils/css";
import { Channel, RenderModalProps } from "@vencord/discord-types";
import { Modal, openModal, Parser, useState } from "@webpack/common";

import { clearLogs, getLog, loadChannelLog, LoggedMessage } from "./logger";

const cl = classNameFactory("vc-mhl-");

export function openHistoryModal(channel: Channel) {
    void loadChannelLog(channel.id)
        .catch(() => {})
        .then(() => {
            openModal(modalProps =>
                <ErrorBoundary>
                    <HistoryModal modalProps={modalProps} channel={channel} />
                </ErrorBoundary>
            );
        });
}

function authorColor(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = (hash * 31 + id.charCodeAt(i)) | 0;
    }
    return `hsl(${Math.abs(hash) % 360}, 60%, 55%)`;
}

function formatTime(timestamp: string): string {
    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? timestamp : date.toLocaleString();
}

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseOptions(channelId: string): any {
    return {
        channelId,
        allowLinks: true,
        allowHeading: true,
        allowList: true,
        allowEmojiLinks: true
    };
}

export function MessageEntry({ message, channelId }: { message: LoggedMessage; channelId: string; }) {
    const authorName = message.author.globalName ?? message.author.username;

    return (
        <div className={cl("message")}>
            <div className={cl("header")}>
                <span className={cl("author")} style={{ color: authorColor(message.author.id) }}>
                    {authorName}
                </span>
                <span className={cl("timestamp")}>
                    {formatTime(message.timestamp)}
                </span>
                {message.editedTimestamp && (
                    <span className={cl("edited")}>(edited)</span>
                )}
            </div>

            {message.content && (
                <div className={cl("content")}>
                    {Parser.parse(message.content, true, parseOptions(channelId))}
                </div>
            )}

            {message.attachments.length > 0 && (
                <div className={cl("attachments")}>
                    {message.attachments.map(attachment => (
                        <a
                            key={attachment.url}
                            className={cl("attachment")}
                            href={attachment.url}
                            target="_blank"
                            rel="noreferrer noopener"
                        >
                            {attachment.filename} ({formatSize(attachment.size)})
                        </a>
                    ))}
                </div>
            )}

            {message.embeds.length > 0 && (
                <div className={cl("embeds")}>
                    {message.embeds.map((embed, index) => (
                        <div className={cl("embed")} key={index}>
                            {embed.title && <div className={cl("embed-title")}>{Parser.parse(embed.title, true, parseOptions(channelId))}</div>}
                            {embed.description && <div className={cl("embed-description")}>{Parser.parse(embed.description, true, parseOptions(channelId))}</div>}
                        </div>
                    ))}
                </div>
            )}

            {message.stickers.length > 0 && (
                <div className={cl("stickers")}>
                    {message.stickers.map(sticker => sticker.name).join(", ")}
                </div>
            )}
        </div>
    );
}

export function LoggedMessageList({ messages, channelId }: { messages: LoggedMessage[]; channelId: string; }) {
    return (
        <div className={cl("list")}>
            {messages.map(message => (
                <MessageEntry key={message.id} message={message} channelId={channelId} />
            ))}
        </div>
    );
}

function HistoryModal({ modalProps, channel }: { modalProps: RenderModalProps; channel: Channel; }) {
    const [messages, setMessages] = useState<LoggedMessage[]>(() => getLog(channel.id));

    return (
        <Modal
            {...modalProps}
            size="md"
            title={<>Logged Messages — #{channel.name}</>}
            actions={messages.length > 0
                ? [{
                    text: "Clear Log",
                    variant: "critical-primary",
                    onClick() {
                        void clearLogs(channel.id).then(() => setMessages([]));
                    }
                }]
                : []
            }
        >
            {messages.length === 0 ? (
                <div className={cl("empty")}>
                    No messages logged for this channel yet. Messages will appear through the gateway while the channel is open.
                </div>
            ) : (
                <LoggedMessageList messages={messages} channelId={channel.id} />
            )}
        </Modal>
    );
}