/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 JP-devs
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";

export interface LoggedMessage {
    id: string;
    channelId: string;
    author: {
        id: string;
        username: string;
        globalName: string | null;
        avatar: string | null;
        bot: boolean;
    };
    content: string;
    timestamp: string;
    editedTimestamp: string | null;
    embeds: Array<{ title?: string; description?: string; url?: string; }>;
    attachments: Array<{ url: string; proxyUrl: string; filename: string; size: number; }>;
    stickers: Array<{ id: string; name: string; }>;
    type: number;
}

const key = (channelId: string) => `MessageHistoryLogger_${channelId}`;

const cache = new Map<string, LoggedMessage[]>();
const pendingLoads = new Map<string, Promise<LoggedMessage[]>>();

function ensureLoaded(channelId: string): Promise<LoggedMessage[]> {
    let load = pendingLoads.get(channelId);
    if (!load) {
        load = DataStore.get<LoggedMessage[]>(key(channelId))
            .then(data => data ?? [])
            .then(log => {
                cache.set(channelId, log);
                pendingLoads.delete(channelId);
                return log;
            });
        pendingLoads.set(channelId, load);
    }
    return load;
}

function save(channelId: string): Promise<unknown> {
    return DataStore.set(key(channelId), cache.get(channelId) ?? []);
}

export function getLog(channelId: string): LoggedMessage[] {
    return cache.get(channelId) ?? [];
}

export async function appendMessage(channelId: string, message: LoggedMessage, maxPerChannel: number): Promise<void> {
    const log = await ensureLoaded(channelId);
    log.push(message);
    const excess = log.length - maxPerChannel;
    if (excess > 0) log.splice(0, excess);
    await save(channelId);
    notifyChanged();
}

export async function updateMessage(channelId: string, id: string, updater: (message: LoggedMessage) => void): Promise<void> {
    const log = await ensureLoaded(channelId);
    const message = log.find(m => m.id === id);
    if (!message) return;
    updater(message);
    await save(channelId);
    notifyChanged();
}

export async function removeMessage(channelId: string, id: string): Promise<void> {
    const log = await ensureLoaded(channelId);
    const index = log.findIndex(m => m.id === id);
    if (index === -1) return;
    log.splice(index, 1);
    await save(channelId);
    notifyChanged();
}

export async function clearLogs(channelId: string): Promise<void> {
    await ensureLoaded(channelId);
    cache.set(channelId, []);
    await save(channelId);
    notifyChanged();
}

export function loadChannelLog(channelId: string): Promise<LoggedMessage[]> {
    return ensureLoaded(channelId);
}

type LogListener = () => void;
const listeners = new Set<LogListener>();

function notifyChanged(): void {
    for (const listener of listeners) listener();
}

export function onLogChanged(listener: LogListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export interface ChannelHighlightState {
    default: boolean;
    overrides: Record<string, boolean>;
}

const defaultHighlightState: ChannelHighlightState = { default: true, overrides: {} };

const highlightCache = new Map<string, ChannelHighlightState>();
const highlightLoads = new Map<string, Promise<ChannelHighlightState>>();
const highlightKey = (channelId: string) => `MessageHistoryLogger_Highlights_${channelId}`;

function ensureHighlightsLoaded(channelId: string): Promise<ChannelHighlightState> {
    let load = highlightLoads.get(channelId);
    if (!load) {
        load = DataStore.get<ChannelHighlightState>(highlightKey(channelId))
            .then(data => {
                const state = data ?? { default: true, overrides: {} as Record<string, boolean> };
                highlightCache.set(channelId, state);
                highlightLoads.delete(channelId);
                return state;
            });
        highlightLoads.set(channelId, load);
    }
    return load;
}

function saveHighlights(channelId: string): Promise<unknown> {
    return DataStore.set(highlightKey(channelId), highlightCache.get(channelId) ?? defaultHighlightState);
}

export function loadChannelHighlights(channelId: string): Promise<ChannelHighlightState> {
    return ensureHighlightsLoaded(channelId);
}

export function getHighlightState(channelId: string): ChannelHighlightState {
    return highlightCache.get(channelId) ?? defaultHighlightState;
}

export function isMessageHighlighted(channelId: string, id: string): boolean {
    const state = getHighlightState(channelId);
    return state.overrides[id] ?? state.default;
}

export async function setMessageHighlight(channelId: string, id: string, highlighted: boolean): Promise<boolean> {
    const state = await ensureHighlightsLoaded(channelId);
    if (highlighted === state.default) {
        delete state.overrides[id];
    } else {
        state.overrides[id] = highlighted;
    }
    await saveHighlights(channelId);
    notifyHighlightsChanged();
    return highlighted;
}

export async function toggleMessageHighlight(channelId: string, id: string): Promise<boolean> {
    const state = await ensureHighlightsLoaded(channelId);
    const current = state.overrides[id] ?? state.default;
    return setMessageHighlight(channelId, id, !current);
}

export async function toggleAllHighlights(channelId: string): Promise<boolean> {
    const state = await ensureHighlightsLoaded(channelId);
    state.default = !state.default;
    state.overrides = {};
    await saveHighlights(channelId);
    notifyHighlightsChanged();
    return state.default;
}

type HighlightsListener = () => void;
const highlightListeners = new Set<HighlightsListener>();

function notifyHighlightsChanged(): void {
    for (const listener of highlightListeners) listener();
}

export function onHighlightsChanged(listener: HighlightsListener): () => void {
    highlightListeners.add(listener);
    return () => highlightListeners.delete(listener);
}