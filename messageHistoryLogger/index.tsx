/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 JP-devs
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./messageHistoryLogger.css";

import { findGroupChildrenByChildId, NavContextMenuPatchCallback } from "@api/ContextMenu";
import { definePluginSettings, SettingsStore } from "@api/Settings";
import { Logger } from "@utils/Logger";
import definePlugin, { makeRange, OptionType, PluginSettingComponentProps } from "@utils/types";
import { Channel, Message } from "@vencord/discord-types";
import { ChannelStore, ColorPicker, Menu, MessageCache, MessageStore, MessageTypeSets, PermissionsBits, PermissionStore, SelectedChannelStore, UserStore } from "@webpack/common";

import { openHistoryModal } from "./HistoryModal";
import { appendMessage, getLog, isMessageHighlighted, loadChannelHighlights, loadChannelLog, LoggedMessage, onHighlightsChanged, onLogChanged, removeMessage, setMessageHighlight, toggleAllHighlights, updateMessage } from "./logger";

const colorPresets = ["#FAA61A", "#FACD1D", "#57F287", "#5865F2", "#EB459E", "#ED4245", "#B5BAC1"];

function HighlightColorPicker({ setValue }: PluginSettingComponentProps) {
    return (
        <ColorPicker
            color={parseInt(settings.store.highlightColor, 16)}
            onChange={color => setValue(color.toString(16).padStart(6, "0"))}
            showEyeDropper={false}
            suggestedColors={colorPresets}
        />
    );
}

function HighlightDotColorPicker({ setValue }: PluginSettingComponentProps) {
    return (
        <ColorPicker
            color={parseInt(settings.store.highlightDotColor, 16)}
            onChange={color => setValue(color.toString(16).padStart(6, "0"))}
            showEyeDropper={false}
            suggestedColors={colorPresets}
        />
    );
}

const settings = definePluginSettings({
    maxMessagesPerChannel: {
        type: OptionType.NUMBER,
        description: "Maximum number of messages to keep logged per channel (newest are kept)",
        default: 500,
        isValid: (value: number) => value > 0
    },
    ignoreBots: {
        type: OptionType.BOOLEAN,
        description: "Don't log messages sent by bots",
        default: false
    },
    ignoreSelf: {
        type: OptionType.BOOLEAN,
        description: "Don't log your own messages",
        default: false
    },
    logEdits: {
        type: OptionType.BOOLEAN,
        description: "Keep logged messages up to date when they're edited",
        default: true
    },
    logDeletes: {
        type: OptionType.BOOLEAN,
        description: "Remove messages from the log when they're deleted",
        default: true
    },
    highlightColor: {
        type: OptionType.COMPONENT,
        default: "FACD1D",
        component: HighlightColorPicker
    },
    highlightAlpha: {
        type: OptionType.SLIDER,
        description: "Opacity of the highlight overlay",
        markers: makeRange(0, 100, 5),
        default: 12,
        stickToMarkers: false,
        restartNeeded: false
    },
    highlightRadius: {
        type: OptionType.SLIDER,
        description: "Corner radius of the highlight overlay",
        markers: makeRange(0, 32, 4),
        default: 8,
        stickToMarkers: false,
        restartNeeded: false
    },
    showHighlightDot: {
        type: OptionType.BOOLEAN,
        description: "Show a dot on highlighted messages",
        default: true,
        restartNeeded: false
    },
    highlightDotColor: {
        type: OptionType.COMPONENT,
        default: "B5BAC1",
        component: HighlightDotColorPicker
    }
});

const logger = new Logger("MessageHistoryLogger");

function canReadHistory(channel: Channel): boolean {
    try {
        return PermissionStore.can(PermissionsBits.READ_MESSAGE_HISTORY, channel);
    } catch (err) {
        logger.warn("Failed to check read history permission for", channel.id, err);
        return true;
    }
}

function hexToRgba(hex: string, alpha: number): string {
    const value = parseInt(hex.replace("#", ""), 16);
    const r = (value >> 16) & 0xff;
    const g = (value >> 8) & 0xff;
    const b = value & 0xff;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const overlayStyleLimit = 200;

let overlayStyle: HTMLStyleElement | null = null;
let logChangedUnsub: (() => void) | null = null;
let highlightsChangedUnsub: (() => void) | null = null;
let settingsChangeListener: ((_: unknown, path: string) => void) | null = null;
let chatObserver: MutationObserver | null = null;

// Channels we've seen a chat container for, so the overlay only targets real channels
const knownLoggedChannels = new Set<string>();

function getOverlayCss(): string {
    const alpha = (settings.store.highlightAlpha ?? 12) / 100;
    const radius = settings.store.highlightRadius ?? 8;
    const dotColor = `#${settings.store.highlightDotColor ?? "B5BAC1"}`;
    const background = hexToRgba(settings.store.highlightColor ?? "FACD1D", alpha);
    const showDot = settings.store.showHighlightDot ?? true;

    let css = "";
    for (const channelId of knownLoggedChannels) {
        const messages = getLog(channelId);
        const start = Math.max(0, messages.length - overlayStyleLimit);
        const sel = (id: string) => `#chat-messages-${channelId}-${id}`;

        const highlighted: LoggedMessage[] = [];
        for (let i = start; i < messages.length; i++) {
            const message = messages[i];
            if (!isMessageHighlighted(channelId, message.id)) continue;
            highlighted.push(message);
            css += `${sel(message.id)}{position:relative;background-color:${background} !important;border-radius:${radius}px}`;
            if (showDot) {
                css += `${sel(message.id)}::after{content:"";position:absolute;top:50%;right:10px;transform:translateY(-50%);width:7px;height:7px;border-radius:50%;background:${dotColor};pointer-events:none}`;
            }
        }

        // Merge adjacent highlighted messages into one continuous band
        for (let i = 1; i < highlighted.length; i++) {
            const a = sel(highlighted[i - 1].id);
            const b = sel(highlighted[i].id);
            css += `${a}:has(+ ${b}){border-bottom-left-radius:0;border-bottom-right-radius:0}`;
            css += `${a} + ${b}{border-top-left-radius:0;border-top-right-radius:0}`;
        }
    }
    return css;
}

function refreshOverlayStyle(): void {
    if (!knownLoggedChannels.size) {
        overlayStyle?.remove();
        overlayStyle = null;
        return;
    }
    if (!overlayStyle) {
        overlayStyle = document.createElement("style");
        overlayStyle.id = "vc-mhl-logged-overlay";
        document.head.appendChild(overlayStyle);
    }
    overlayStyle.textContent = getOverlayCss();
}

function trackLoggedChannel(channelId: string): void {
    if (knownLoggedChannels.has(channelId)) return;
    knownLoggedChannels.add(channelId);
    loadChannelLog(channelId)
        .catch(err => logger.error("Failed to load log for message overlay", channelId, err))
        .then(() => refreshOverlayStyle());
    loadChannelHighlights(channelId)
        .catch(err => logger.error("Failed to load highlight state", channelId, err))
        .then(() => refreshOverlayStyle());
}

function seedVisibleChannels(): void {
    const track = (id: string) => {
        const channelId = id.split("-")[2];
        if (channelId && /^\d+$/.test(channelId)) {
            trackLoggedChannel(channelId);
            injectChannelHistory(channelId);
        }
    };

    for (const el of document.querySelectorAll<HTMLElement>('[id^="chat-messages-"]')) {
        track(el.id);
    }

    chatObserver?.disconnect();
    chatObserver = new MutationObserver(mutations => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!(node instanceof HTMLElement)) continue;
                if (node.id?.startsWith("chat-messages-")) track(node.id);
                for (const el of node.querySelectorAll<HTMLElement>('[id^="chat-messages-"]')) {
                    track(el.id);
                }
            }
        }
    });
    chatObserver.observe(document.body, { childList: true, subtree: true });
}

const serializeMessage = (message: Message): LoggedMessage => {
    const timestamp = message.timestamp instanceof Date
        ? message.timestamp.toISOString()
        : new Date(message.timestamp as unknown as string).toISOString();
    const editedTimestamp = message.editedTimestamp
        ? (message.editedTimestamp instanceof Date ? message.editedTimestamp : new Date(message.editedTimestamp)).toISOString()
        : null;

    return {
        id: message.id,
        channelId: message.channel_id,
        author: {
            id: message.author.id,
            username: message.author.username,
            globalName: (message.author as any).globalName ?? null,
            avatar: (message.author as any).avatar ?? null,
            bot: message.author.bot ?? false
        },
        content: message.content,
        timestamp,
        editedTimestamp,
        embeds: (message.embeds ?? []).map(embed => ({
            title: embed.rawTitle || undefined,
            description: embed.rawDescription || undefined,
            url: embed.url || undefined
        })),
        attachments: (message.attachments ?? []).map(attachment => ({
            url: attachment.url,
            proxyUrl: attachment.proxy_url,
            filename: attachment.filename,
            size: attachment.size
        })),
        stickers: (message.stickerItems ?? message.stickers ?? []).map(sticker => ({
            id: sticker.id,
            name: sticker.name
        })),
        type: message.type
    };
};

function toRawMessage(logged: LoggedMessage, channel: Channel): Record<string, any> {
    return {
        id: logged.id,
        channel_id: logged.channelId,
        guild_id: channel.guild_id,
        author: {
            id: logged.author.id,
            username: logged.author.username,
            discriminator: "0",
            global_name: logged.author.globalName,
            avatar: logged.author.avatar,
            bot: logged.author.bot
        },
        content: logged.content,
        timestamp: logged.timestamp,
        edited_timestamp: logged.editedTimestamp,
        type: logged.type,
        mentions: [],
        mention_roles: [],
        mention_everyone: false,
        pinned: false,
        tts: false,
        embeds: logged.embeds.map(embed => ({
            type: "rich",
            title: embed.title ?? "",
            description: embed.description ?? "",
            url: embed.url ?? ""
        })),
        attachments: logged.attachments.map(attachment => ({
            id: attachment.url.split("/").pop() ?? attachment.filename,
            filename: attachment.filename,
            size: attachment.size,
            url: attachment.url,
            proxy_url: attachment.proxyUrl
        })),
        sticker_items: logged.stickers.map(sticker => ({
            id: sticker.id,
            name: sticker.name,
            format_type: 1,
            type: 1
        })),
        flags: 0
    };
}

async function injectChannelHistory(channelId: string): Promise<void> {
    if (!channelId) return;
    const channel = ChannelStore.getChannel(channelId);
    if (!channel?.guild_id) return;

    const log = await loadChannelLog(channelId).catch(err => {
        logger.error("Failed to load log for injection", channelId, err);
        return [] as LoggedMessage[];
    });
    if (!log.length) return;

    try {
        const cache = MessageCache.getOrCreate(channelId);
        const loggedToInject = log
            .filter(m => !cache.get(m.id))
            .sort((a, b) => (a.id < b.id ? 1 : -1));
        if (!loggedToInject.length) return;

        const newCache = cache.addCachedMessages(
            loggedToInject.map(m => toRawMessage(m, channel)),
            true
        );
        MessageCache.commit(newCache);
        MessageStore.emitChange();
    } catch (err) {
        logger.error("Failed to inject logged messages into chat", channelId, err);
    }
}

let injectRetryTimeout: number | null = null;
let injectWatchdogTimeout: number | null = null;

function armInjectionWatchdog(channelId: string): void {
    if (injectWatchdogTimeout) {
        clearTimeout(injectWatchdogTimeout);
    }
    const tick = (): void => {
        const channel = ChannelStore.getChannel(channelId);
        if (!channel?.guild_id || SelectedChannelStore.getChannelId() !== channelId) return;

        const log = getLog(channelId);
        if (!log.length) return;

        const cache = MessageCache.getOrCreate(channelId);
        const missing = log.filter(m => !cache.get(m.id));
        if (missing.length) {
            injectChannelHistory(channelId);
            injectWatchdogTimeout = window.setTimeout(tick, 3000);
        }
    };
    injectWatchdogTimeout = window.setTimeout(tick, 5000);
}

// Discord's own channel load wipes the cache shortly after CHANNEL_SELECT,
// so re-inject a few times until it settles.
function scheduleChannelHistoryInjection(channelId: string): void {
    injectChannelHistory(channelId);
    armInjectionWatchdog(channelId);

    if (injectRetryTimeout) {
        clearTimeout(injectRetryTimeout);
    }
    injectRetryTimeout = window.setTimeout(() => {
        injectRetryTimeout = null;
        injectChannelHistory(channelId);
        injectRetryTimeout = window.setTimeout(() => {
            injectRetryTimeout = null;
            injectChannelHistory(channelId);
            injectRetryTimeout = window.setTimeout(() => {
                injectRetryTimeout = null;
                injectChannelHistory(channelId);
            }, 8000);
        }, 3000);
    }, 1000);
}

function clearInjectRetry(): void {
    if (injectRetryTimeout) {
        clearTimeout(injectRetryTimeout);
        injectRetryTimeout = null;
    }
    if (injectWatchdogTimeout) {
        clearTimeout(injectWatchdogTimeout);
        injectWatchdogTimeout = null;
    }
}

interface MessageUpdateEvent {
    type: "MESSAGE_UPDATE";
    message: {
        id: string;
        channel_id: string;
        guild_id?: string;
        content?: string;
        edited_timestamp?: string | null;
    };
}

interface MessageDeleteEvent {
    type: "MESSAGE_DELETE";
    id: string;
    channel_id: string;
}

const patchChannelContextMenu: NavContextMenuPatchCallback = (children, { channel }: { channel: Channel }) => {
    if (!channel?.guild_id) return;

    const hasLogs = getLog(channel.id).length > 0;
    if (canReadHistory(channel) && !hasLogs) return;

    const group = findGroupChildrenByChildId("mute-channel", children) ?? children;
    const someHighlighted = getLog(channel.id).some(m => isMessageHighlighted(channel.id, m.id));
    group.push(
        <Menu.MenuItem
            id="vc-mhl-toggle-all-highlights"
            label={someHighlighted ? "Unhighlight All Messages" : "Highlight All Messages"}
            action={() => toggleAllHighlights(channel.id).catch(err => logger.error("Failed to toggle all highlights", err))}
        />
    );
    group.push(
        <Menu.MenuItem
            id="vc-mhl-open"
            label="Message History Logger"
            action={() => openHistoryModal(channel)}
        />
    );
};

const patchMessageContextMenu: NavContextMenuPatchCallback = (children, { message }: { message: Message }) => {
    const channel = ChannelStore.getChannel(message.channel_id);
    if (!channel?.guild_id) return;

    const hasLogs = getLog(channel.id).length > 0;
    if (canReadHistory(channel) && !hasLogs) return;

    const logged = getLog(channel.id).find(m => m.id === message.id);
    if (!logged) return;

    const highlighted = isMessageHighlighted(channel.id, message.id);
    const group = findGroupChildrenByChildId("copy-link", children) ?? children;
    group.push(
        <Menu.MenuItem
            id="vc-mhl-toggle-highlight"
            label={highlighted ? "Unhighlight Message" : "Highlight Message"}
            action={() => setMessageHighlight(channel.id, message.id, !highlighted).catch(err => logger.error("Failed to toggle highlight", err))}
        />
    );
};

export default definePlugin({
    name: "MessageHistoryLogger",
    description: "Logs messages sent in channels where you lack the Read Message History permission, so they can still be viewed later.",
    authors: [
        {
            id: 0n,
            name: "JP"
        }
    ],
    tags: ["Chat", "Utility"],
    settings,

    contextMenus: {
        "channel-context": patchChannelContextMenu,
        "message": patchMessageContextMenu
    },

    start() {
        seedVisibleChannels();
        logChangedUnsub = onLogChanged(refreshOverlayStyle);
        highlightsChangedUnsub = onHighlightsChanged(refreshOverlayStyle);

        // Repaint the overlay whenever any of our settings change
        const onSettingsChanged = (_: unknown, path: string) => {
            if (path.startsWith("plugins.MessageHistoryLogger")) refreshOverlayStyle();
        };
        SettingsStore.addGlobalChangeListener(onSettingsChanged);
        settingsChangeListener = onSettingsChanged;

        scheduleChannelHistoryInjection(SelectedChannelStore.getChannelId());
    },

    stop() {
        clearInjectRetry();
        chatObserver?.disconnect();
        chatObserver = null;
        logChangedUnsub?.();
        logChangedUnsub = null;
        highlightsChangedUnsub?.();
        highlightsChangedUnsub = null;
        if (settingsChangeListener) SettingsStore.removeGlobalChangeListener(settingsChangeListener);
        settingsChangeListener = null;
        knownLoggedChannels.clear();
        overlayStyle?.remove();
        overlayStyle = null;
    },

    flux: {
        CHANNEL_SELECT: ({ channelId }: { channelId: string }) => scheduleChannelHistoryInjection(channelId),

        MESSAGE_CREATE({ message, optimistic }: { message: Message; optimistic?: boolean }) {
            try {
                if (optimistic) return;
                if (!MessageTypeSets.USER_MESSAGE.has(message.type)) return;
                if (message.author.bot && settings.store.ignoreBots) return;
                if (message.author.id === UserStore.getCurrentUser().id && settings.store.ignoreSelf) return;

                const channel = ChannelStore.getChannel(message.channel_id);
                if (!channel?.guild_id) return;
                if (canReadHistory(channel)) return;

                appendMessage(channel.id, serializeMessage(message), settings.store.maxMessagesPerChannel)
                    .then(() => trackLoggedChannel(channel.id))
                    .catch(err => logger.error("Failed to save message", err));
            } catch (err) {
                logger.error("Failed to log message", err);
            }
        },

        MESSAGE_UPDATE(event: MessageUpdateEvent) {
            try {
                if (!settings.store.logEdits) return;
                const channel = ChannelStore.getChannel(event.message?.channel_id);
                if (!channel?.guild_id) return;

                updateMessage(channel.id, event.message.id, message => {
                    if (typeof event.message.content === "string") {
                        message.content = event.message.content;
                    }
                    if (event.message.edited_timestamp !== undefined) {
                        message.editedTimestamp = event.message.edited_timestamp ?? null;
                    }
                }).catch(err => logger.error("Failed to update logged message", err));
            } catch (err) {
                logger.error("Failed to update logged message", err);
            }
        },

        MESSAGE_DELETE(event: MessageDeleteEvent) {
            try {
                if (!settings.store.logDeletes) return;
                const channel = ChannelStore.getChannel(event.channel_id);
                if (!channel?.guild_id) return;

                removeMessage(channel.id, event.id)
                    .catch(err => logger.error("Failed to remove logged message", err));
            } catch (err) {
                logger.error("Failed to remove logged message", err);
            }
        }
    }
});