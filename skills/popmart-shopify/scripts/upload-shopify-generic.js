#!/usr/bin/env node
/**
 * upload-shopify-generic.js — Generic Shopify product creator
 *
 * Works for any vendor/brand (not hardcoded to POP MART).
 * Reads input JSON with full control over vendor, brand, product_type, pricing, etc.
 *
 * Usage:
 *   node upload-shopify-generic.js <product.json>
 */

const fs    = require("fs");
const path  = require("path");
const https = require("https");

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const STORE   = "0iq3rb-0p.myshopify.com";
const TOKEN   = (() => {
  const candidates = [
    path.join(process.env.HOME, ".openclaw/credentials/shopify-access-token.txt"),
    path.join(process.env.HOME, ".openclaw/credentials/shopify-admin-access-token.txt"),
  ];
  for (const p of candidates) {
    try { return fs.readFileSync(p, "utf8").trim(); } catch (e) {}
  }
  throw new Error("Shopify token not found");
})();
const API_VER = "2023-10";
const BASE    = `https://${STORE}/admin/api/${API_VER}`;

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

function apiRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const url  = new URL(BASE + endpoint);
    const opts = {
      hostname: url.hostname,
      path:     url.pathname + url.search,
      method,
      headers: {
        "X-Shopify-Access-Token": TOKEN,
        "Content-Type": "application/json",
        ...(data ? { "Content-Length": Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(opts, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(raw);
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${JSON.stringify(parsed.errors || parsed)}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Parse error [${res.statusCode}]: ${raw.slice(0, 200)}`));
        }
      });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function graphqlRequest(query, variables = {}) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables });
    const opts = {
      hostname: STORE,
      path:     `/admin/api/${API_VER}/graphql.json`,
      method:   "POST",
      headers: {
        "X-Shopify-Access-Token": TOKEN,
        "Content-Type":           "application/json",
        "Content-Length":         Buffer.byteLength(body),
      },
    };
    const req = https.request(opts, (res) => {
      let raw = "";
      res.on("data", (c) => (raw += c));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.errors) reject(new Error(JSON.stringify(parsed.errors)));
          else resolve(parsed.data);
        } catch (e) {
          reject(new Error(`GraphQL parse error: ${raw.slice(0, 200)}`));
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildHandle(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

async function getOrCreateCollection(name) {
  const resp = await apiRequest("GET", `/custom_collections.json?title=${encodeURIComponent(name)}`);
  if (resp.custom_collections && resp.custom_collections.length) {
    return resp.custom_collections[0].id;
  }
  const created = await apiRequest("POST", "/custom_collections.json", {
    custom_collection: { title: name, published: true },
  });
  return created.custom_collection.id;
}

async function addToCollection(collectionId, productId) {
  return apiRequest("POST", "/collects.json", {
    collect: { collection_id: collectionId, product_id: productId },
  });
}

async function setInventory(inventoryItemId, qty, cost) {
  const locs = await apiRequest("GET", "/locations.json");
  const locationId = locs.locations[0].id;
  await apiRequest("POST", "/inventory_levels/connect.json", {
    inventory_item_id: inventoryItemId,
    location_id:       locationId,
  }).catch(() => {});
  await apiRequest("POST", "/inventory_levels/set.json", {
    inventory_item_id: inventoryItemId,
    location_id:       locationId,
    available:         qty,
  });
  if (cost) {
    await apiRequest("PUT", `/inventory_items/${inventoryItemId}.json`, {
      inventory_item: { id: inventoryItemId, cost: String(cost) },
    });
  }
}

async function setNativeSeoFields(productGid, seoTitle, seoDesc) {
  const mutation = `
    mutation SetSeo($id: ID!, $seo: SEOInput!) {
      productUpdate(input: { id: $id, seo: $seo }) {
        product { id seo { title description } }
        userErrors { field message }
      }
    }
  `;
  try {
    const data = await graphqlRequest(mutation, {
      id: productGid,
      seo: { title: seoTitle, description: seoDesc },
    });
    const errs = data?.productUpdate?.userErrors || [];
    if (errs.length) throw new Error(errs.map(e => e.message).join(", "));
    console.log(`   ✓ SEO title: ${seoTitle.slice(0, 60)}...`);
    return true;
  } catch (e) {
    console.warn(`   ⚠ SEO fields set failed: ${e.message}`);
    return false;
  }
}

async function publishToAllChannels(productGid) {
  const query = `
    query { publications(first: 20) { edges { node { id name } } } }
  `;
  let pubs = [];
  try {
    const data = await graphqlRequest(query);
    pubs = (data?.publications?.edges || []).map(e => e.node);
    console.log(`   Found ${pubs.length} channels: ${pubs.map(p => p.name).join(", ")}`);
  } catch (e) {
    console.warn(`   ⚠ Could not fetch channels: ${e.message}`);
    return;
  }
  const mutation = `
    mutation Publish($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        publishable { ... on Product { id title } }
        userErrors { field message }
      }
    }
  `;
  try {
    const data = await graphqlRequest(mutation, {
      id: productGid,
      input: pubs.map(p => ({ publicationId: p.id })),
    });
    const errs = data?.publishablePublish?.userErrors || [];
    if (errs.length) console.warn(`   ⚠ Some channels failed: ${errs.map(e => e.message).join(", ")}`);
    else console.log(`   ✓ Published to all ${pubs.length} channels`);
  } catch (e) {
    console.warn(`   ⚠ Publish failed: ${e.message}`);
  }
}

const DEFAULT_CATEGORY_SEARCH = ["Dolls, Playsets & Toy Figures", "Dolls", "Toys"];

async function findCategoryGid(searchTerms) {
  const query = `
    query SearchCategory($query: String!) {
      taxonomy {
        categories(search: $query, first: 5) {
          edges { node { id name fullName } }
        }
      }
    }
  `;
  for (const term of searchTerms) {
    try {
      const data = await graphqlRequest(query, { query: term });
      const results = data?.taxonomy?.categories?.edges || [];
      const match = results.find(e =>
        e.node.fullName.includes("Toys & Games") || e.node.fullName.includes("Toys")
      ) || results[0];
      if (match) {
        console.log(`   Found category: ${match.node.fullName}`);
        return match.node.id;
      }
    } catch (e) {}
  }
  return null;
}

async function setProductCategory(productGid, searchTerms) {
  const categoryGid = await findCategoryGid(searchTerms);
  if (!categoryGid) {
    console.warn("   ⚠ Could not find category");
    return false;
  }
  const mutation = `
    mutation SetCategory($id: ID!, $category: ID!) {
      productUpdate(input: { id: $id, category: $category }) {
        product { id category { name } }
        userErrors { field message }
      }
    }
  `;
  try {
    const data = await graphqlRequest(mutation, { id: productGid, category: categoryGid });
    const errs = data?.productUpdate?.userErrors || [];
    if (errs.length) throw new Error(errs.map(e => e.message).join(", "));
    console.log(`   ✓ Category: ${data?.productUpdate?.product?.category?.name || "set"}`);
    return true;
  } catch (e) {
    console.warn(`   ⚠ Category set failed: ${e.message}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Blind-box detection + description builder (vendor-agnostic)
// ---------------------------------------------------------------------------

function detectBlindBox(title, tags, productType, variants) {
  const hay = [
    title,
    productType,
    (Array.isArray(tags) ? tags.join(" ") : String(tags || "")),
    variants.map(v => v.name).join(" "),
  ].join(" ").toLowerCase();
  const patterns = [
    /blind\s*box/, /mystery\s*box/, /mystery\s*bag/, /fingertip\s*keycap/,
    /\bgacha\b/, /\bblindbox\b/, /surprise\s*box/, /random\s+character/,
    /whole\s*set/, /single\s*box/, /\btrading\s+figure/,
  ];
  return patterns.some(p => p.test(hay));
}

function buildJsonLdSchemaGeneric(title, variants, brand, figureCount, secretRate, handle) {
  const offers = variants.map(v => ({
    "@type": "Offer",
    name: v.name,
    price: String(v.price),
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
    sku: v.sku || undefined,
    url: `https://todo.fun/products/${handle}?variant=${encodeURIComponent(v.name)}`,
  }));
  const schema = {
    "@context": "https://schema.org/",
    "@type": "Product",
    name: title,
    brand: { "@type": "Brand", name: brand },
    description: `${title} collectible available at TODO FUN.`,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: String(Math.min(...variants.map(v => Number(v.price)))),
      highPrice: String(Math.max(...variants.map(v => Number(v.price)))),
      offerCount: variants.length,
      offers,
    },
  };
  if (figureCount) {
    schema.additionalProperty = [
      { "@type": "PropertyValue", name: "Figure Count", value: String(figureCount) },
    ];
    if (secretRate) {
      schema.additionalProperty.push({ "@type": "PropertyValue", name: "Secret Rate", value: secretRate });
    }
  }
  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
}

function buildDescriptionGeneric(input, isBlindBox) {
  const { title, brand, variants, figure_count, secret_rate, series, features = [], materials = [], handle } = input;
  const single = variants.find(v => /single|random|one/i.test(v.name));
  const whole  = variants.find(v => /whole|full|complete|set/i.test(v.name));
  const fCount = figure_count ? String(figure_count) : null;
  const sRate  = secret_rate || null;
  const seriesName = series || title;
  const jsonLd = buildJsonLdSchemaGeneric(title, variants, brand, figure_count, secret_rate, handle);

  const featList = features.length
    ? features.map(f => `      <li>${f}</li>`).join("\n")
    : (isBlindBox
        ? `      <li>1 sealed ${seriesName} item</li>\n      <li>Official ${brand} packaging</li>`
        : `      <li>1 ${title}</li>\n      <li>Official ${brand} packaging</li>`);
  const matList = materials.length
    ? materials.map(m => `      <li>${m}</li>`).join("\n")
    : `      <li>See product images for specifications</li>`;

  const blindBoxFAQ = isBlindBox ? `
    <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
      <h3 itemprop="name">What is in the ${seriesName}?</h3>
      <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
        <div itemprop="text">
          <p>The ${seriesName} includes ${fCount ? fCount + " designs" : "multiple designs"}${sRate ? ` plus one rare secret edition with a pull rate of approximately ${sRate}` : ""}.
          Each single box is randomly selected and sealed. Whole set purchases contain all standard designs${sRate ? ", but the secret edition is not guaranteed" : ""}.</p>
        </div>
      </div>
    </div>

    <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
      <h3 itemprop="name">What is the difference between single box and whole set?</h3>
      <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
        <div itemprop="text">
          <p>Single box: one sealed ${seriesName} box with a randomly selected design.${single ? ` Price: $${single.price}.` : ""}
          Whole set: ${fCount ? `all ${fCount} standard designs` : "the complete standard set"} with no duplicates.${whole ? ` Price: $${whole.price}.` : ""}
          Collectors who want the full lineup should choose whole set.</p>
        </div>
      </div>
    </div>
` : "";

  const authenticityFAQ = `
    <div itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
      <h3 itemprop="name">Is this ${title} authentic?</h3>
      <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
        <div itemprop="text">
          <p>Yes. TODO FUN sells 100% authentic ${brand} products sourced through official channels.
          All items ship from our US warehouse for fast delivery.</p>
        </div>
      </div>
    </div>`;

  const openerIntro = isBlindBox
    ? `${title} is a ${brand} ${seriesName.toLowerCase().includes("blind box") ? "collectible" : "blind box collectible"}${fCount ? ` with ${fCount} unique designs` : ""}. Each sealed box contains one random item from the ${seriesName}. Available in single box${whole ? " and whole set" : ""} options at TODO FUN.`
    : `${title} is an official ${brand} collectible available at TODO FUN.`;

  const blindBoxWarning = isBlindBox ? `
  <p><small><em>⚠️ Blind box: the specific design you receive is random and cannot be selected. ${sRate ? `Secret editions (~${sRate}) are not guaranteed in whole set purchases. ` : ""}All opened blind box sales are final. Keep packaging sealed until delivery is verified.</em></small></p>` : "";

  return `
${jsonLd}
<div class="product-description" itemscope itemtype="https://schema.org/Product">
  <meta itemprop="name" content="${title}" />
  <meta itemprop="brand" content="${brand}" />

  <h2>${title}</h2>
  <p>${openerIntro}</p>

  <div itemscope itemtype="https://schema.org/FAQPage">
${blindBoxFAQ}${authenticityFAQ}
  </div>

  <div class="product-specs" itemscope itemtype="https://schema.org/Offer">
    <h3>What's Included</h3>
    <ul>
${featList}
    </ul>
    <h3>Details</h3>
    <ul>
${matList}
    </ul>
    <meta itemprop="availability" content="https://schema.org/InStock" />
    <meta itemprop="seller" content="TODO FUN" />
    <meta itemprop="priceCurrency" content="USD" />
  </div>
${blindBoxWarning}
</div>`.trim();
}

// ---------------------------------------------------------------------------
// Main upload
// ---------------------------------------------------------------------------

async function uploadToShopify(input) {
  const {
    title,
    vendor          = "TODO FUN",
    brand           = vendor,
    product_type    = "Collectible",
    body_html,
    seo_title,
    seo_description,
    tags            = [],
    collection      = "New Arrivals",
    images          = [],
    variants        = [],
    google_product_category = "Toys & Games > Toys > Action Figures",
    inventory_per_variant   = 200,
    metafields: extraMetafields = [],
    category_search_terms   = DEFAULT_CATEGORY_SEARCH,
    is_blind_box,
    figure_count,
    secret_rate,
    series,
    features,
    materials,
  } = input;

  if (!title) throw new Error("Missing required field: title");
  if (!images.length) throw new Error("At least one image required");
  if (!variants.length) throw new Error("At least one variant required");

  const handle = input.handle || buildHandle(title);

  // Auto-detect blind box if not explicitly set
  const detectedBlindBox = is_blind_box != null
    ? Boolean(is_blind_box)
    : detectBlindBox(title, tags, product_type, variants);

  // Auto-generate description if none provided
  const finalBodyHtml = body_html || buildDescriptionGeneric(
    { title, brand, variants, figure_count, secret_rate, series, features, materials, handle },
    detectedBlindBox
  );

  // Auto-inject blind-box tags for smart collections (All Blind Boxes, Whole Sets)
  let workingTags = Array.isArray(tags) ? [...tags] : String(tags).split(",").map(t => t.trim()).filter(Boolean);
  if (detectedBlindBox && !workingTags.some(t => /^blind.?box$/i.test(t))) workingTags.push("blind-box");
  if (detectedBlindBox && variants.some(v => /whole|full|complete|set/i.test(v.name)) && !workingTags.some(t => /^whole.?set$/i.test(t))) workingTags.push("whole-set");

  console.log(`\n📦 Creating: ${title}`);
  console.log(`   Vendor:   ${vendor}`);
  console.log(`   Brand:    ${brand}`);
  console.log(`   Blind box: ${detectedBlindBox ? "yes → warning + blind-box tag added" : "no"}`);
  console.log(`   Variants: ${variants.map(v => v.name).join(", ")}`);
  console.log(`   Images:   ${images.length}`);

  const shopifyImages = images.map((img, i) => {
    if (typeof img === "string") return { src: img, alt: title, position: i + 1 };
    return { src: img.src, alt: img.alt || title, position: i + 1 };
  });

  const shopifyVariants = variants.map((v) => ({
    option1:              v.name,
    price:                String(v.price),
    compare_at_price:     v.compare_at ? String(v.compare_at) : null,
    sku:                  v.sku || null,
    taxable:              v.taxable !== false,
    inventory_management: "shopify",
    inventory_policy:     v.inventory_policy || "deny",
    fulfillment_service:  "manual",
    requires_shipping:    v.requires_shipping !== false,
    weight:               v.weight_lb || 0.25,
    weight_unit:          "lb",
  }));

  const baseMetafields = [
    { key: "google_product_category", value: google_product_category,
      type: "single_line_text_field", namespace: "mm-google-shopping" },
    { key: "condition", value: "new",
      type: "single_line_text_field", namespace: "mm-google-shopping" },
    { key: "brand", value: brand,
      type: "single_line_text_field", namespace: "custom" },
  ];
  if (seo_title) {
    baseMetafields.push({
      key: "title_tag", value: seo_title,
      type: "single_line_text_field", namespace: "global",
    });
  }
  if (seo_description) {
    baseMetafields.push({
      key: "description_tag", value: seo_description,
      type: "multi_line_text_field", namespace: "global",
    });
  }

  const allMetafields = [...baseMetafields, ...extraMetafields];

  const payload = {
    product: {
      title,
      handle,
      body_html:       finalBodyHtml,
      vendor,
      product_type,
      tags:            workingTags.join(", "),
      status:          "active",
      published_scope: "global",
      options:         [{ name: variants.length > 1 ? "Type" : "Title" }],
      variants:        shopifyVariants,
      images:          shopifyImages,
      metafields:      allMetafields,
    },
  };

  const resp    = await apiRequest("POST", "/products.json", payload);
  const product = resp.product;
  console.log(`\n✅ Product created: ID ${product.id}`);
  console.log(`   Handle: ${product.handle}`);

  console.log(`\n📊 Setting inventory (${inventory_per_variant}/variant)...`);
  for (let i = 0; i < product.variants.length; i++) {
    const pv = product.variants[i];
    const cost = variants[i]?.cost || null;
    console.log(`   ${pv.title}: SKU=${pv.sku} cost=${cost ? "$" + cost : "N/A"}`);
    await setInventory(pv.inventory_item_id, inventory_per_variant, cost);
    await sleep(500);
  }

  console.log(`\n🖼  Linking variant images...`);
  for (let i = 0; i < product.variants.length; i++) {
    const pv  = product.variants[i];
    const idx = variants[i]?.image_index;
    if (idx != null && product.images[idx]) {
      try {
        await apiRequest("PUT", `/variants/${pv.id}.json`, {
          variant: { id: pv.id, image_id: product.images[idx].id },
        });
        console.log(`   ✓ ${pv.title} → image ${idx + 1}`);
      } catch (e) {
        console.warn(`   ⚠ Variant image link failed: ${e.message}`);
      }
      await sleep(300);
    }
  }

  console.log(`\n📁 Adding to "${collection}"...`);
  try {
    const colId = await getOrCreateCollection(collection);
    await addToCollection(colId, product.id);
    console.log(`   ✓ Done`);
  } catch (e) {
    console.warn(`   ⚠ Collection failed: ${e.message}`);
  }

  const productGid = `gid://shopify/Product/${product.id}`;
  console.log(`\n🏷  Setting product category...`);
  await setProductCategory(productGid, category_search_terms);

  console.log(`\n📡 Publishing to all sales channels...`);
  await publishToAllChannels(productGid);

  if (seo_title || seo_description) {
    console.log(`\n🔍 Setting native SEO fields...`);
    await setNativeSeoFields(
      productGid,
      seo_title || title,
      seo_description || `${title} available at TODO FUN.`
    );
  }

  console.log(`\n${"═".repeat(60)}`);
  console.log(`✅ COMPLETE`);
  console.log(`   Title:  ${title}`);
  console.log(`   ID:     ${product.id}`);
  console.log(`   Admin:  https://${STORE}/admin/products/${product.id}`);
  console.log(`   Store:  https://todo.fun/products/${product.handle}`);
  product.variants.forEach((v) => {
    console.log(`     • ${v.title}: $${v.price} (compare: $${v.compare_at_price || "—"})`);
  });
  console.log(`${"═".repeat(60)}\n`);

  return {
    success:    true,
    product_id: product.id,
    handle:     product.handle,
    admin_url:  `https://${STORE}/admin/products/${product.id}`,
    store_url:  `https://todo.fun/products/${product.handle}`,
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: node upload-shopify-generic.js <product.json>");
    process.exit(1);
  }
  let input;
  try {
    input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
  } catch (e) {
    console.error(`Cannot read ${inputPath}: ${e.message}`);
    process.exit(1);
  }
  try {
    const result = await uploadToShopify(input);
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(`\n❌ Upload failed: ${e.message}`);
    console.error(e.stack);
    process.exit(1);
  }
}

main();
