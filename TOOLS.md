# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:
- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

## Discord Cron Jobs

**How it works:** Cron jobs with `sessionTarget: "isolated"` + `delivery.mode: "announce"` will deliver the agent's final output to Discord automatically. The cron delivery system handles posting — the agent inside should NOT try to use the discord tool.

**Rule:** Never include "Post to Discord" or "post findings" in the cron job message. The agent just outputs findings; delivery handles the rest.

**Fix for double-post error:** If you see "Discord posting failed - bot auth not configured" but the cron delivered anyway, check the cron job message for redundant posting instructions. Remove them.

---

## Control UI File Upload Patches

**Date Applied:** 2026-04-16

**What:** Three patches to enable full file type support with visual feedback in Control UI:
1. Accept all file types (not just images) in file picker
2. Remove image-only validation when reading files
3. Show file type preview for non-image attachments

**Location:** `~/.npm-global/lib/node_modules/openclaw/dist/control-ui/assets/index-M4TNVXB3.js`

**Changes:**
- **Line 29:** Changed `R_=\`image/*\`` to `R_=\`*/*\`` (file picker accepts all types)
- **Line 572:** Added conditional rendering to show file type icon + MIME type for non-images
- **Line 3184:** Changed `function z_(e){return typeof e==\`string\`&&e.startsWith(\`image/\`)}` to `function z_(e){return typeof e==\`string\`}` (validation accepts all types)

**Backups:** 
- `~/Workspace/backups/openclaw-control-ui-20260416/` (original)
- `~/.npm-global/lib/node_modules/openclaw/dist/control-ui/assets/index-M4TNVXB3.js.bak2` (after patch 1)
- `~/.npm-global/lib/node_modules/openclaw/dist/control-ui/assets/index-M4TNVXB3.js.bak3` (after patch 2)

**To reapply after OpenClaw update:**
```bash
# 1. Backup current Control UI
cp -r ~/.npm-global/lib/node_modules/openclaw/dist/control-ui ~/Workspace/backups/openclaw-control-ui-$(date +%Y%m%d)/

# 2. Apply file type acceptance patch
sed -i.bak 's/R_=`image\/\*`/R_=`*\/*`/' ~/.npm-global/lib/node_modules/openclaw/dist/control-ui/assets/index-M4TNVXB3.js

# 3. Apply file validation patch
sed -i 's/function z_(e){return typeof e==`string`&&e\.startsWith(`image\/`)}/function z_(e){return typeof e==`string`}/' ~/.npm-global/lib/node_modules/openclaw/dist/control-ui/assets/index-M4TNVXB3.js

# 4. Apply attachment preview patch (line 572 - adjust if needed)
sed -i '572s|<img src=${t.dataUrl} alt="Attachment preview" />|${t.mimeType.startsWith(\`image/\`)?i\`<img src=${t.dataUrl} alt="Attachment preview" />\`:i\`<div class="chat-attachment-file-preview" style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;background:var(--surface-2);border-radius:8px;padding:8px;"><span style="font-size:24px;">📎</span><span style="font-size:11px;margin-top:4px;text-align:center;word-break:break-all;max-width:100%;">${t.mimeType}</span></div>\`}|' ~/.npm-global/lib/node_modules/openclaw/dist/control-ui/assets/index-M4TNVXB3.js

# 5. Verify all three patches
echo "=== Patch 1: File picker ==="
grep "R_=" ~/.npm-global/lib/node_modules/openclaw/dist/control-ui/assets/index-M4TNVXB3.js | head -1 | grep -o 'R_=`[^`]*`'
echo ""
echo "=== Patch 2: File validation ==="
grep "function z_" ~/.npm-global/lib/node_modules/openclaw/dist/control-ui/assets/index-M4TNVXB3.js | head -1 | grep -o 'function z_(e){[^}]*}'
echo ""
echo "=== Patch 3: Preview UI ==="
grep "chat-attachment-file-preview" ~/.npm-global/lib/node_modules/openclaw/dist/control-ui/assets/index-M4TNVXB3.js | wc -l
```

**Features:**
- Upload any file type (.skill, .pdf, .json, .txt, etc.)
- Images show thumbnail preview
- Non-images show 📎 icon + MIME type (e.g., "application/json")
- Remove button works for all file types
- Files are properly read and uploaded to the gateway

**Testing:**
1. Hard refresh your browser (Ctrl+Shift+R or Cmd+Shift+R)
2. Click the attachment button in the chat input
3. Select any file type (not just images)
4. You should see a preview box with 📎 and the MIME type
5. Send the message - the file will be uploaded

---

### Windows Node (Mini)

**Node ID:** `d7ff69f724b0582916cb53eaee36ea98ff6effd6344bb128ceb3dcc9b58e8bed`
- Connected via Tailscale to WSL2 gateway
- Capabilities: browser, system
- Commands: system.run, system.which, browser.proxy
- **Note:** system.run requires approval (auto-approval not enabled)
- Can use exec with `host=node` and the node ID

### Pop Mart → Shopify Pipeline

**CRITICAL: Use the SKILL pipeline, not the old scripts.**

**✅ CORRECT - Use this:**
```bash
# Scrape + Upload to Shopify (one command)
python3 ~/Workspace/skills/popmart-shopify/scripts/pipeline.py "<popmart-url>"

# Scrape only (no upload)
python3 ~/Workspace/skills/popmart-scraper/scripts/scraper.py "<popmart-url>"
```

**❌ WRONG - Never use these:**
```bash
# OLD VERSION - uses wrong credential files
python3 ~/Workspace/scripts/popmart_to_shopify.py "<popmart-url>"

# OLD VERSION - deprecated
python3 ~/Workspace/scripts/popmart_search_and_scrape.py "Product Name"
```

**What the pipeline does:**
- Scrapes Pop Mart product page (images, variants, prices)
- Creates SEO-optimized Shopify draft
- Returns admin URL and store URL
- Never hardcode product names - always pass URL as argument

**When asked to "list on Shopify":**
- **Pop Mart product** → `~/Workspace/skills/popmart-shopify/scripts/pipeline.py`
- **Any other vendor** (anime, keycaps, generic, etc.) → `~/Workspace/skills/popmart-shopify/scripts/upload-shopify-generic.js <product.json>`

### Generic Shopify Upload (non-Pop Mart)

**Path:** `~/Workspace/skills/popmart-shopify/scripts/upload-shopify-generic.js`

**Usage:**
```bash
node ~/Workspace/skills/popmart-shopify/scripts/upload-shopify-generic.js <product.json>
```

Takes a product JSON (title, vendor, images[], variants[], tags, collection, seo fields), creates a Shopify draft with schema markup, SEO, collections, inventory tracking. Works for any brand/vendor. See MEMORY.md for full JSON schema.

### Tailscale Node Connection

**Problem:** Windows node can't connect to Linux gateway over Tailscale due to plaintext WS security guardrail.

**Solution:** Tailscale Serve with TLS

**Setup (done 2026-04-14):**
1. On Linux gateway: `tailscale serve 18789 --proxy=http://127.0.0.1:18789`
2. Added to `~/.bashrc` for auto-start on login:
   ```bash
   tailscale serve 18789 --proxy=http://127.0.0.1:18789 2>/dev/null &
   ```
3. From Windows, connect with `--tls` flag:
   ```powershell
   openclaw node run --host claw-chan.tailf38f13.ts.net --port 18789 --tls
   ```

**Note:** Gateway must be bound to `loopback` (127.0.0.1) in openclaw.json for this to work.

---

### Shopify

- Store URL: https://todo.fun (custom domain)
- Shopify domain: 0iq3rb-0p.myshopify.com
- **⚠️ Theme deploy = `git push origin main` to `YHAZN/todo-fun-theme` (GitHub-connected). NOT `shopify theme push`.** See MEMORY.md “CRITICAL: Shopify Theme is GitHub-Connected”.
- Access token: `~/.openclaw/credentials/shopify-access-token.txt` (symlink to shopify-admin-access-token.txt)
- Store domain: `~/.openclaw/credentials/shopify-store-domain.txt`

**Credential files:**
- `shopify-access-token.txt` → symlink to `shopify-admin-access-token.txt`
- `shopify-admin-access-token.txt` → actual token
- `shopify-store-domain.txt` → store domain

Add whatever helps you do your job. This is your cheat sheet.
