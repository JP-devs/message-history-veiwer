# Message History Logger

A Vencord plugin by JP — if you're in a channel but lack the **Read Message History**
permission, Discord only shows messages as they arrive. This plugin logs every message
it sees in those channels so nothing is lost, and highlights the logged messages with a
coloured overlay so you can spot them.

## Features

- Captures `MESSAGE_CREATE` for guild channels where you **cannot** read history
  (DMs always allow history, so they're never logged).
- Logs persist in Vencord's `DataStore` across restarts, trimmed to the newest N
  messages per channel (default 500).
- Edits and deletes are reflected in the log.
- Logged messages get a highlight overlay in the chat, with a toggle per message or
  per channel via right-click:
  - Right-clicking a **channel** offers "Highlight All Messages" and "Message
    History Logger".
  - Right-clicking a **message** offers "Highlight Message".
- The history modal shows author, timestamp, edited marker, content, attachments,
  embeds and stickers.

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| Max messages per channel | 500 | Newest messages are kept when the cap is hit |
| Ignore bots | off | Skip messages from bots |
| Ignore self | off | Skip messages you sent |
| Log edits | on | Update the log when a logged message is edited |
| Log deletes | on | Remove messages from the log when they're deleted |
| Highlight colour | `#FACD1D` | Colour of the highlight overlay |
| Highlight opacity | 12% | Opacity of the overlay |
| Highlight radius | 8 | Corner radius of the overlay |
| Show highlight dot | on | Show a dot indicator on highlighted messages |
| Highlight dot colour | `#B5BAC1` | Colour of the dot indicator |

Colour/opacity/radius changes apply instantly — no restart needed.

## Install

Copy the `messageHistoryLogger` folder into your Vencord source tree:

```
<path/to/vencord>/src/plugins/messageHistoryLogger/
├── HistoryModal.tsx
├── index.tsx
├── logger.ts
└── messageHistoryLogger.css
```

Then build:

```bash
pnpm install   # first time only
pnpm build     # or: pnpm watch / pnpm dev
```

Enable it in Vencord settings → Plugins → **MessageHistoryLogger**.

## Notes

- Messages are only captured while the gateway pushes them to your client (typically
  while the channel is open). Anything Discord never sent you can't be recovered —
  this does not bypass the permission.
- If the permission check fails, the channel is skipped rather than polluting the log.

## License

[CC BY-NC 4.0](LICENSE) — you may use and modify it as long as you credit the author,
and you may not sell it.