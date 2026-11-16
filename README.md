# Last Response Stats

A small DeepSeek Harness bundle that shows the average output speed and
prompt-cache hit of the most recent Chat response — for example
`42 tok/s · 87% cached` — directly under that response in the conversation
flow.

## What it computes

```text
tok/s     = provider output tokens / (message settlement - first token)
cache hit = cache-read tokens / (uncached input + cache-read + cache-write)
```

The first-token timestamp comes from the durable `assistant/message` stream,
so the reading survives a page reload. Only content-bearing assistant messages
count as a response; reasoning-only and tool-call-only messages are skipped.
Each part is hidden when its inputs are missing: no output-token usage or
first token means no speed, and no cache-read/cache-write report means no
cache hit.

## Where it appears

`conversation.chat.turnTail` — the small footer area under a completed Turn,
before the message action row. The Host projection carries the Turn of the
latest response, so only that Turn renders the reading.

## Install

The Harness plugin manager installs through `pnpm`; make sure `pnpm` is on the
PATH of the process running `dsh web`. If the profile already has a dependency
tree, match the pnpm major to its store (pnpm reports a store mismatch when the
major does not match).

### Published package or repository

In the Harness Web UI, open **Settings → Plugins → Add plugin** and enter either:

- the npm package name `dsh-last-response-stats`, once published; or
- the public repository URL, for example
  `https://github.com/latinovicb/dsh-last-response-stats`.

Install, then reload the page.

### Local checkout

1. Open **Settings → Plugins**.
2. Choose **Add plugin** and enter this directory's absolute path.
3. Install, then reload the page.

You can also ask a Harness agent to install the bundle with the same path
through the plugin-manager bundle install action.

After installation, the bundle should appear under **Installed**. If it is
disabled, enable it and reload. A running `dsh web` process may need a restart
if the Host plugin does not activate live.

The package declares DSH compatibility `>=0.2.1-rc.2 <0.3.0`.

## Files

- `index.js` — Host half: the `lastResponseStats` session projection.
- `client.js` — Web UI half: the turn-tail pill, locale dictionaries, styles.
- `cordis.patch.yml` — inserts the bundle row.
- `locale/en.json`, `locale/zh.json` — plugin title and description.
- `icon.svg` — plugin inventory artwork.
