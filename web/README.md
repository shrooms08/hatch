# Hatch web

Launch a token quoted in the stock you're looking at. Built on Meteora DBC.
Next.js (pages router) app forked from Meteora's fun-launch scaffold.

```bash
pnpm install
cp .env.example .env.local   # fill in values (see comments)
pnpm dev                     # http://localhost:3000
pnpm build                   # type-checked production build
```

Pages: `/` (hatches from chain), `/launch` (prefill: `?name=&symbol=&description=&image=&preset=&source=`),
`/token/<mint>`, `/my-hatches`. API: `POST /api/upload`, `GET /api/presets`.

See `../docs/phase1.md` for architecture, env vars and known limits.
