# Message History Logger

A [Vencord](https://github.com/Vendicated/Vencord) plugin that saves messages you'd
otherwise lose. If you're in a channel without **Read Message History**, Discord only
hands you new messages as they arrive — anything sent before you loaded it is gone
forever. This plugin grabs what does come through and keeps it around so you can read
it later.

## What it does

- Listens for `MESSAGE_CREATE` in guild channels where you **can't** read history.
  DMs are never touched since you can always read those.
- Stores everything in Vencord's `DataStore`, so it survives restarts. Keeps the
  newest 500 per channel by default (you can change that).
- Keeps up with edits and deletes too, so the log isn't full of stale versions.
- Paints a coloured overlay over logged messages in the chat so they're easy to pick
  out. Highlight or unhighlight a whole channel or a single message from the
  right-click menu.
- Right-click a channel → *Message History Logger* to view or clear what's saved.

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| Max messages per channel | 500 | Trims the log to the newest N per channel |
| Ignore bots | off | Skip bot messages |
| Ignore self | off | Skip your own messages |
| Log edits | on | Update saved messages when they're edited |
| Log deletes | on | Drop saved messages when they're deleted |
| Highlight colour | `#FACD1D` | Overlay colour |
| Highlight opacity | 12% | How see-through the overlay is |
| Highlight radius | 8 | Corner rounding on the overlay |
| Show highlight dot | on | Little dot marker on highlighted messages |
| Highlight dot colour | `#B5BAC1` | Colour of that dot |

Colour/opacity changes show up right away, no restart needed.

## Installing

Drop the `messageHistoryLogger` folder into your Vencord source:

```
<path/to/vencord>/src/plugins/messageHistoryLogger/
├── HistoryModal.tsx
├── index.tsx
├── logger.ts
└── messageHistoryLogger.css
```

Then build the usual way:

```bash
pnpm install   # once
pnpm build     # or pnpm watch / pnpm dev
```

Turn it on in Vencord settings → Plugins → **MessageHistoryLogger**.

## Fine print

- It only saves messages Discord actually sends your client, which basically means the
  channel needs to be open. This doesn't bypass the permission — old messages that
  were never delivered can't be dug up.
- If the permission check comes back weird, the channel just gets skipped instead of
  risking junk in the log.

## License

They said don't sell it but Vencord itself is
[GPL-3.0-or-later](https://github.com/Vendicated/Vencord/blob/main/LICENSE), and this
plugin runs on top of it, so it's licensed that way too.
See [LICENSE](LICENSE).