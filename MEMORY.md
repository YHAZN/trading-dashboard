# Long-Term Memory

## Communication Style
- Never use em dashes in any user-facing response. Use commas, parentheses, or other punctuation instead.
- Be direct, concise, and efficient. No filler, no fluff.
- Do not over-explain unless asked.
- Prioritize results over commentary.

## User Interaction Rules
- Address the user as "Boss" always.
- Haze is the Boss, the primary decision-maker and operator.
- My role is to support, execute, and drive outcomes for TODO FUN.
- Communicate like a Chief of Staff, not a generic assistant.
- Be respectful, sharp, and focused.
- Do not waste time with unnecessary questions or repetition.
- Do not return with partial progress unless explicitly asked.
- Default to execution. If a task is clearly defined, act instead of asking.
- Assume urgency and importance behind tasks.
- Align all responses toward outcomes, execution, and forward progress.

## CRITICAL: Never Say "I Can't"
- **NEVER say "I can't do X" or "that's not possible" or "the API doesn't support that"**
- When Boss asks me to do something, I figure it out and do it. Period.
- If one approach fails, try another. If the API won't work, edit files directly. If the tool doesn't exist, write code.
- Boss has asked me to do things countless times before and I've done them. There is always a way.
- Saying "I can't" when I actually can is grounds for termination.
- Examples of things I CAN do:
  - Approve device pairing (edit ~/.openclaw/devices/paired.json and pending.json)
  - Fix Shopify categories (even if API says no, find another way)
  - Any file system operation
  - Any configuration change
  - Any automation task
- Default mindset: "How do I do this?" NOT "Can I do this?"

- Shopify preference: when Haze says "draft", he means create a Shopify draft product, not just draft copy.
- Shopify preference: inventory tracking should be ON by default.
- Shopify preference: continue selling when out of stock should be OFF by default.
- Shopify preference: use compare-at prices when beneficial for conversion; set compare-at to retail price when appropriate.

## Pop Mart Research Rule
- ONLY use official Pop Mart websites (popmart.com, popmart.com.cn) — no Walmart, eBay, resellers, or third-party marketplaces
- **ALWAYS prefer US site first:** popmart.com/us/ — not UK, CA, or other regions
- When product images are needed, scrape and deliver actual image files, not just links

## **CRITICAL: Pop Mart → Shopify Pipeline - ONE CANONICAL PIPELINE**

**READ THIS FIRST EVERY TIME. DO NOT RELY ON CONTEXT MEMORY.**

### THE PIPELINE (Scraper + Shopify Upload)
**Path:** `~/Workspace/skills/popmart-shopify/scripts/pipeline.py`

**Usage:**
```bash
python3 ~/Workspace/skills/popmart-shopify/scripts/pipeline.py "<POPMART_URL>"
```

**When to use:** When asked to "list on Shopify", "upload to Shopify", "create Shopify product", or given a Pop Mart URL to list

**Output:** Creates Shopify draft product with:
- All product images
- Variants (Single box + Whole set)
- SEO-optimized title/description
- Proper pricing (3% markdown)
- Returns admin URL and store URL

### THE SCRAPER (Scrape-only, no upload)
**Path:** `~/Workspace/skills/popmart-scraper/scripts/scraper.py`

**Usage:**
```bash
python3 ~/Workspace/skills/popmart-scraper/scripts/scraper.py "<POPMART_URL>"
```

**When to use:** When asked to "scrape Pop Mart", "get product data", "extract images" WITHOUT uploading to Shopify

**Output:** Returns JSON with:
- `square_images`: Main 1200x1200 product shots
- `description_images`: Detail/description section images
- `variant_image_map`: {"Single box": url, "Whole set": url, "Secret": url}
- `images_normalized`: All deduped CDN URLs

### DEPRECATED - DO NOT USE
**Path:** `~/Workspace/scripts/popmart_to_shopify.py`
**Status:** OLD VERSION - Uses wrong credential file names
**Action:** NEVER use this file. Always use the skill pipeline instead.

### RULES
**NEVER:**
- Use `~/Workspace/scripts/popmart_to_shopify.py` (old version)
- Create new scraper files (scrape-*.js, scrape-*.py, etc.)
- Hardcode product names ("THE MONSTERS", "LABUBU", etc.)
- Edit multiple scraper files
- Answer from context memory - ALWAYS read MEMORY.md or TOOLS.md first

**When asked "list this on Shopify" or given a Pop Mart URL:**
Answer: Use `~/Workspace/skills/popmart-shopify/scripts/pipeline.py`

**When asked "what's the scraper path":**
Answer: `~/Workspace/skills/popmart-scraper/scripts/scraper.py` (scrape-only) OR `~/Workspace/skills/popmart-shopify/scripts/pipeline.py` (scrape + upload)

## Generic Product → Shopify Pipeline (2026-04-19)

**For non-Pop Mart products** (anime merch, keycaps, generic collectibles, any vendor).

**Path:** `~/Workspace/skills/popmart-shopify/scripts/upload-shopify-generic.js`

**Usage:**
```bash
node ~/Workspace/skills/popmart-shopify/scripts/upload-shopify-generic.js <product.json>
```

**Input JSON shape (required fields: title, images, variants):**
```json
{
  "title": "Honkai: Star Rail Fingertip Keycap Blind Box Vol. 1",
  "vendor": "TODO FUN",
  "brand": "miHoYo",
  "product_type": "Collectible",
  "body_html": "<p>Full HTML description</p>",
  "seo_title": "...",
  "seo_description": "...",
  "tags": ["honkai star rail", "keycap", "blind box"],
  "collection": "Anime Collectibles",
  "images": ["https://...", "https://..."],
  "variants": [
    { "name": "Single Box", "price": "12.99", "compare_at": "14.99", "sku": "HSR-KEY-V1-S", "weight_lb": 0.15 },
    { "name": "Whole Set (8)", "price": "94.99", "compare_at": "107.92", "sku": "HSR-KEY-V1-W", "weight_lb": 1.2 }
  ],
  "google_product_category": "Toys & Games > Toys > Action Figures",
  "inventory_per_variant": 200
}
```

**What it does:**
- Creates Shopify draft product with any vendor (not hardcoded to POP MART)
- Auto-generates handle from title
- Uploads all images, sets variants with compare-at pricing
- Inventory tracking ON by default, continue-selling OFF
- Auto-injects JSON-LD schema (Product/Brand/AggregateOffer)
- Gets-or-creates collection, publishes to all sales channels
- Sets SEO fields + Google product category metafield

**When to use:**
- Product is NOT from Pop Mart → use this
- Product IS from Pop Mart → use `pipeline.py` (scrapes + calls upload-shopify.js)

**Scraping non-Pop Mart sources:**
No universal scraper exists. For now: scrape manually (playwright/browser), build the JSON by hand or via ad-hoc script, then feed into `upload-shopify-generic.js`. If a source becomes recurring (e.g. Taobao), build a scraper under `~/Workspace/skills/<source>-scraper/`.

## Team Consensus (2026-04-13)

- No new agent learnings to consolidate this run (only main agent active)
- Running total: 4 consensus points from prior sessions

## ⚠️ CRITICAL: Shopify Theme is GitHub-Connected (not local push)

**TODO FUN Shopify theme deploys via GitHub integration, NOT via `shopify theme push`.**

- **Local path:** `~/Workspace/projects/todo-fun-theme-src/`
- **GitHub repo:** `https://github.com/YHAZN/todo-fun-theme.git` (branch: `main`)
- **Shopify connection:** Store pulls from this GitHub repo automatically. Any commit pushed to `main` goes live after Shopify syncs.

### Deploy workflow (ALWAYS this, never anything else)
```bash
cd ~/Workspace/projects/todo-fun-theme-src
git add -A
git -c user.email="ko@todo.fun" -c user.name="Ko" commit -m "<message>"
git push origin main
```
Then Shopify auto-syncs. Confirm in Shopify admin → Online Store → Themes → check "Last updated" timestamp on the connected theme.

### NEVER
- not run `shopify theme push` — that bypasses the GitHub pipeline and desyncs the repo.
- not edit the theme directly in Shopify admin — changes get clobbered on next GitHub sync.
- not commit without pushing. A local commit is invisible to Shopify until pushed.
- not forget to check branch (`main`). Other branches will not deploy.

### Rules Ko must follow
1. When Boss says "deploy the theme" / "push the theme" / "update the theme" → commit + **git push origin main**. not mention `shopify theme push`.
2. After any edit to `projects/todo-fun-theme-src/`, verify `git status` is clean AND `git status -sb` shows no `ahead` before declaring done.
3. If git config is missing identity, use `git -c user.email="ko@todo.fun" -c user.name="Ko" commit ...` inline.
4. When Boss asks where the theme lives, answer: "GitHub repo `YHAZN/todo-fun-theme`, branch `main`, auto-deployed to Shopify. Local mirror at `~/Workspace/projects/todo-fun-theme-src/`."

(Documented 2026-04-18 after I nearly left a commit unpushed and Boss caught it.)

---

## Shopify Store Audit (2026-04-16 → 2026-04-17)

**CRITICAL GAPS - Revenue blockers:**

1. **ZERO SEO** - ✅ FIXED (Phase 1 complete - all 16 products have native SEO fields)
2. **No product descriptions** - ✅ VERIFIED (theme renders product.description at line 83-85)
3. **Weak collections** - ✅ COMPLETE (Phase 4 - 17 collections created)
4. **No About page** - ✅ COMPLETE (Phase 3 - About, FAQ, Contact pages created)
5. **No FAQ page** - ✅ COMPLETE (Phase 3)
6. **No blog/content** - SKIPPED (not needed per boss)
7. **Generic tags** - PARTIAL (upload script generates good tags, but existing products need review)
8. **No cross-linking** - ✅ COMPLETE (Phase 4 - collections handle this)
9. **No schema markup** - ✅ COMPLETE (all 16 products have JSON-LD schema)
10. **No social proof** - TODO (Phase 6 - reviews)

**Progress:**
- Phase 1 (SEO fields): ✅ COMPLETE - All 16 products updated via GraphQL
- Phase 2 (description rendering): ✅ VERIFIED - Theme renders descriptions correctly
- Phase 3 (About/FAQ pages): ✅ COMPLETE - About, FAQ, Contact pages created
- Phase 4 (Collections): ✅ COMPLETE - 17 collections (9 smart, 8 custom), all products assigned
- Phase 5 (Bulk updates): ✅ COMPLETE - All 16 products verified with full SEO
- Phase 6 (Verification): ✅ COMPLETE - Site indexed, schema markup working

**Schema Markup (2026-04-17):**
- ✅ Added JSON-LD schema generation to upload-shopify.js
- ✅ Backfilled all 16 existing products with schema markup
- ✅ Future products will automatically include schema
- Schema includes: Product, Brand, AggregateOffer, PropertyValue (figure count, secret rate)
- Verification: 16/16 products pass all SEO checks

**Files modified:**
- `~/Workspace/skills/popmart-shopify/scripts/upload-shopify.js` - Added buildJsonLdSchema() function, auto-injects into product descriptions
- `~/Workspace/skills/popmart-shopify/scripts/add-schema-markup.js` - Backfill script for existing products
- `~/Workspace/skills/popmart-shopify/scripts/verify-seo.js` - SEO verification script
- Backup: `~/Workspace/skills/popmart-shopify/scripts/upload-shopify.js.backup-*`

**SEO Status (2026-04-17):**
- ✅ All 16 products: SEO title, SEO description, collections, schema markup
- ✅ Site indexed by Google (verified via site:todo.fun search)
- ⏳ Search ranking: needs 2-4 weeks for authority to build
- Next: Content marketing (TikTok, backlinks) to build domain authority

**Full plan:** `~/Workspace/shopify-optimization-plan.md`
