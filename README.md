# Letterhead

A small Chrome extension for editing HTTP request and response headers.

Header editors normally want access to every site you visit. This one asks for
nothing at install, and requests a single domain when you add a rule for it.

![The Letterhead popup](docs/popup.png)

## Install

`chrome://extensions` → **Developer mode** → **Load unpacked** → select this folder.

## Use

Pick **Request** or **Response** and `set` / `append` / `remove`, fill in domain,
header name and value, then **Add rule**. Chrome prompts for that one domain, and
the rule takes effect only if you accept.

- The row toggle enables a rule; `×` deletes it and revokes the domain.
- The switch in the header disables every rule at once without losing them.
- **Export** writes the rules to JSON. **Import** adds them disabled, so an
  imported file can never silently gain access to anything.

Cookies and CSP need no special support — they are the `Cookie`, `Set-Cookie` and
`Content-Security-Policy` headers. Two caveats:

- `set` on `Cookie` replaces the whole header, dropping the browser's real session
  cookies. Use `append` to add one alongside them.
- Chrome permits `append` on request headers only for an allowlist (`cookie`,
  `accept`, `user-agent`, `x-forwarded-for` and a dozen more). Anything else is
  rejected, and the popup shows the error. Response headers are barely restricted.

## Layout

```
manifest.json   extension manifest
popup/          the whole UI and logic — index.html, index.js
icons/          icon.svg, icon-small.svg (simplified, for 16 and 32px), rendered PNGs
docs/           screenshots
```

Regenerate an icon with `rsvg-convert -w N -h N icons/icon.svg -o icons/iconN.png`.

## Design

- No host permissions at install. `optional_host_permissions` grants one domain when
  a rule goes live, and it is revoked when the rule is deleted.
- `declarativeNetRequestWithHostAccess` — Chrome's own rule engine rewrites the
  headers, so the extension never sees request or response contents.
- No service worker, no content scripts, no remote code, no network calls. Dynamic
  rules persist across restarts on their own.
- Rules cover subdomains, but only where access was granted, so an ungranted
  subdomain fails closed.

## License

MIT — see [LICENSE](LICENSE).
