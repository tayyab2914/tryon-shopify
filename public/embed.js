/**
 * TryOn Widget — embed.js (Shopify build).
 *
 * Loaded by the Theme App Extension on every storefront page when the
 * merchant enables the "TryOn Widget" app embed. Identifies the shop via
 * the `data-shop` attribute (no brand id needed) and talks to the app
 * domain that served this script.
 */
(function () {
  'use strict';

  // ---------- 1. CONFIG ----------
  const scriptTag = document.currentScript ||
    document.querySelector('script[data-shop]');
  const shopDomain = scriptTag?.getAttribute('data-shop');

  // API base — strip trailing slashes so `${API_BASE}/api/tryon` never doubles up.
  // Falls back to the script's own origin when `data-api-base` isn't set
  // (which is the normal case: the script and the API live on the same host).
  let API_BASE = scriptTag?.getAttribute('data-api-base') || '';
  if (!API_BASE && scriptTag?.src) {
    try { API_BASE = new URL(scriptTag.src).origin; } catch { /* ignore */ }
  }
  API_BASE = API_BASE.replace(/\/+$/, '');

  if (!shopDomain) {
    console.error('[TryOn] Missing data-shop on script tag');
    return;
  }

  // ---------- 1b. WIDGET CONFIG ----------
  const DEFAULT_CONSENT =
    'I agree to upload my photo for a one-time virtual try-on. I understand it is ' +
    'processed only to generate my result, is never saved to any database, and is ' +
    'removed the moment I refresh or close this window.';

  const widgetConfig = {
    enabled: true,
    buttonLabel: 'Try On with AI',
    accentColor: '#1a1a1a',
    consentText: DEFAULT_CONSENT,
    buttonPlacement: 'auto',     // 'auto' | 'above-atc' | 'below-atc'
    buttonStyle: 'outline',      // 'outline' | 'solid'
    buttonRadius: 'square',      // 'square' | 'rounded' | 'pill'
    buttonSize: 'medium',        // 'small' | 'medium' | 'large'
    showOnProduct: true,
    showOnCollection: true,
    modalTitle: 'Virtual Fitting Room',
    addToCartLabel: 'Add to Bag',
  };

  let configPromise = null;
  function ensureConfig() {
    if (configPromise) return configPromise;
    configPromise = fetch(`${API_BASE}/api/widget/${encodeURIComponent(shopDomain)}`)
      .then(res => {
        if (!res.ok) return;
        return res.json().then(data => {
          if (!data || typeof data !== 'object') return;
          widgetConfig.enabled = data.enabled !== false;
          if (data.buttonLabel) widgetConfig.buttonLabel = String(data.buttonLabel);
          if (data.accentColor) widgetConfig.accentColor = String(data.accentColor);
          if (data.consentText) widgetConfig.consentText = String(data.consentText);
          if (data.buttonPlacement) widgetConfig.buttonPlacement = String(data.buttonPlacement);
          if (data.buttonStyle) widgetConfig.buttonStyle = String(data.buttonStyle);
          if (data.buttonRadius) widgetConfig.buttonRadius = String(data.buttonRadius);
          if (data.buttonSize) widgetConfig.buttonSize = String(data.buttonSize);
          if (data.showOnProduct !== undefined) widgetConfig.showOnProduct = data.showOnProduct !== false;
          if (data.showOnCollection !== undefined) widgetConfig.showOnCollection = data.showOnCollection !== false;
          if (data.modalTitle) widgetConfig.modalTitle = String(data.modalTitle);
          if (data.addToCartLabel) widgetConfig.addToCartLabel = String(data.addToCartLabel);
        });
      })
      .catch(() => { /* offline or blocked — keep defaults */ });
    return configPromise;
  }

  // ---------- 1c. STYLE HELPERS ----------
  function radiusPx() {
    return { square: '2px', rounded: '10px', pill: '999px' }[widgetConfig.buttonRadius] || '2px';
  }
  function sizeSpec() {
    return ({
      small: { padding: '11px 14px', font: '11px', gap: '8px', icon: 14 },
      medium: { padding: '16px', font: '12px', gap: '10px', icon: 16 },
      large: { padding: '20px', font: '13px', gap: '12px', icon: 18 },
    })[widgetConfig.buttonSize] || { padding: '16px', font: '12px', gap: '10px', icon: 16 };
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"]/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
    ));
  }

  function normalizeUrl(url) {
    if (!url) return null;
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return window.location.origin + url;
    return url;
  }

  // ---------- 2. PRODUCT DETECTION ----------
  // Shopify-only: pull the product directly from the storefront product JSON
  // when we're on a /products/{handle} page; otherwise fall back to
  // ShopifyAnalytics.meta or the og:image tag.
  let cachedProduct = null;
  let productPromise = null;

  function productHandleFromPath() {
    const m = window.location.pathname.match(/\/products\/([^/?#]+)/);
    return m ? m[1] : null;
  }

  async function fetchProductByHandle(handle) {
    try {
      const res = await fetch(`/products/${encodeURIComponent(handle)}.js`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  // Resolves the "currently displayed" variant id — preferring the URL
  // `?variant=` (theme picks up changes from the variant selector), then
  // any selected radio/select input in the product form, then the first
  // available variant from the storefront JSON.
  function currentVariantId(product) {
    const fromUrl = new URLSearchParams(window.location.search).get('variant');
    if (fromUrl) return fromUrl;
    const form = document.querySelector('form[action*="/cart/add"]');
    if (form) {
      const select = form.querySelector('[name="id"]');
      if (select && select.value) return select.value;
    }
    const firstAvailable = product?.variants?.find(v => v.available);
    return (firstAvailable || product?.variants?.[0])?.id || null;
  }

  async function detectProduct() {
    if (cachedProduct) return cachedProduct;
    if (productPromise) return productPromise;

    productPromise = (async () => {
      // Path 1: /products/{handle}
      const handle = productHandleFromPath();
      if (handle) {
        const p = await fetchProductByHandle(handle);
        if (p) {
          cachedProduct = {
            productId: String(p.id),
            productHandle: p.handle,
            name: p.title,
            imageUrl: normalizeUrl(p.featured_image || p.images?.[0]),
            getVariantId: () => currentVariantId(p),
            mode: 'shopify-json',
          };
          return cachedProduct;
        }
      }

      // Path 2: ShopifyAnalytics meta (set on most Shopify themes)
      const meta = window.ShopifyAnalytics?.meta?.product;
      if (meta) {
        cachedProduct = {
          productId: String(meta.id),
          productHandle: meta.handle || null,
          name: meta.title || document.title,
          imageUrl: normalizeUrl(meta.featured_image),
          getVariantId: () => currentVariantId(meta),
          mode: 'shopify-analytics',
        };
        return cachedProduct;
      }

      // Path 3: og:image fallback (collections, custom pages)
      const ogImage = document.querySelector('meta[property="og:image"]')?.content;
      if (ogImage) {
        cachedProduct = {
          productId: document.title,
          productHandle: null,
          name: document.title,
          imageUrl: normalizeUrl(ogImage),
          getVariantId: () => null,
          mode: 'og',
        };
        return cachedProduct;
      }
      return null;
    })();
    return productPromise;
  }

  // Collection / listing pages — adds a small "Try On" button to each card.
  function detectGrid() {
    const selectors = [
      '[class*="product-card"]',
      '[class*="ProductCard"]',
      '[class*="card-product"]',
      '.grid-product',
      '.product-item',
      '.product-grid-item',
      '.collection-product',
      'li.grid__item',
    ];
    let cards = [];
    for (const sel of selectors) {
      const found = document.querySelectorAll(sel);
      if (found.length >= 2) { cards = Array.from(found); break; }
    }
    if (cards.length < 2) return [];

    cards = cards.filter(card =>
      !cards.some(other => other !== card && other.contains(card))
    );
    if (cards.length < 2) return [];

    const products = [];
    const seen = new Set();
    for (const card of cards) {
      if (seen.has(card)) continue;
      const img = card.querySelector('img');
      if (!img) continue;

      const rawSrc =
        img.currentSrc ||
        img.getAttribute('src') ||
        img.getAttribute('data-src') ||
        img.getAttribute('data-original') ||
        (img.getAttribute('data-srcset') || img.getAttribute('srcset') || '')
          .split(',')[0].trim().split(' ')[0];
      const imageUrl = normalizeUrl(rawSrc);
      if (!imageUrl || imageUrl.startsWith('data:')) continue;

      const link = card.querySelector('a[href*="/products/"]');
      const href = link?.getAttribute('href') || '';
      const handleMatch = href.match(/\/products\/([^/?#]+)/);
      const productHandle = handleMatch ? handleMatch[1] : null;
      const name = (link?.textContent || img.getAttribute('alt') || 'Product').trim();

      seen.add(card);
      products.push({
        target: card,
        productId: productHandle || name,
        productHandle,
        name,
        imageUrl,
        // Lazy: resolve variant id on click by fetching the product JSON.
        getVariantId: null,
        mode: 'shopify-grid',
      });
    }
    return products;
  }

  // ---------- 3. INJECTION POINTS ----------
  function findInjectionPoint() {
    const selectors = [
      '.product-form__buttons',
      '.product-form__cart',
      '.product-form__submit',
      'form[action*="/cart/add"] button[type="submit"]',
      'form[action*="/cart/add"]',
      'button[name="add"]',
      'button[name="add-to-cart"]',
      '[class*="add-to-cart"]',
      '[class*="AddToCart"]',
      '[data-add-to-cart]',
      '.shopify-payment-button',
      '.product__info-container',
      '.product-single__meta',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el.tagName === 'BUTTON' ? el.parentElement : el;
    }
    return document.querySelector('.product__price, .price, h1')?.parentElement || null;
  }

  // Locate the storefront's Add-to-Cart control — used for above/below placement.
  function findAtcButton() {
    const selectors = [
      'form[action*="/cart/add"] button[type="submit"]',
      'form[action*="/cart/add"] [type="submit"]',
      'button[name="add"]',
      'button[name="add-to-cart"]',
      '.product-form__submit',
      '[data-add-to-cart]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function buildMainButton(product) {
    const accent = widgetConfig.accentColor;
    const solid = widgetConfig.buttonStyle === 'solid';
    const size = sizeSpec();
    const baseBg = solid ? accent : 'transparent';
    const baseColor = solid ? '#fff' : accent;

    const btn = document.createElement('button');
    btn.className = 'tryon-btn';
    btn.type = 'button';
    btn.innerHTML = `
      <svg width="${size.icon}" height="${size.icon}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
        <circle cx="12" cy="8" r="4"/>
        <path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>
      </svg>
      <span>${escapeHtml(widgetConfig.buttonLabel)}</span>
    `;
    btn.style.cssText = `
      width: 100%;
      padding: ${size.padding};
      margin: 8px 0 12px;
      background: ${baseBg};
      color: ${baseColor};
      border: 1px solid ${accent};
      border-radius: ${radiusPx()};
      font-family: inherit;
      font-size: ${size.font};
      letter-spacing: 3px;
      text-transform: uppercase;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: ${size.gap};
      transition: all 0.3s;
    `;
    if (solid) {
      btn.onmouseenter = () => { btn.style.filter = 'brightness(1.25)'; };
      btn.onmouseleave = () => { btn.style.filter = 'none'; };
    } else {
      btn.onmouseenter = () => { btn.style.background = accent; btn.style.color = '#fff'; };
      btn.onmouseleave = () => { btn.style.background = 'transparent'; btn.style.color = accent; };
    }
    btn.onclick = () => openModal(product);
    return btn;
  }

  function injectMainButton(product) {
    if (document.querySelector('.tryon-btn')) return; // already placed this page

    const placement = widgetConfig.buttonPlacement;
    const btn = buildMainButton(product);

    // Explicit placement relative to the Add-to-Cart control.
    if (placement === 'above-atc' || placement === 'below-atc') {
      const atc = findAtcButton();
      if (atc && atc.parentElement) {
        if (placement === 'above-atc') atc.parentElement.insertBefore(btn, atc);
        else atc.parentElement.insertBefore(btn, atc.nextSibling);
        return;
      }
    }

    // 'auto' (or ATC not found) — append to the best container we can detect.
    const target = findInjectionPoint();
    if (!target) return;
    target.appendChild(btn);
  }

  function injectCardButton(product) {
    if (!product.target || product.target.querySelector('.tryon-card-btn')) return;
    const card = product.target;
    if (getComputedStyle(card).position === 'static') card.style.position = 'relative';

    const accent = widgetConfig.accentColor;
    const solid = widgetConfig.buttonStyle === 'solid';
    const baseBg = solid ? accent : 'rgba(255,255,255,0.95)';
    const baseColor = solid ? '#fff' : accent;
    const btn = document.createElement('button');
    btn.className = 'tryon-card-btn';
    btn.type = 'button';
    btn.title = widgetConfig.buttonLabel;
    btn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
        <circle cx="12" cy="8" r="4"/>
        <path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>
      </svg>
      <span>Try On</span>
    `;
    btn.style.cssText = `
      position: absolute; top: 10px; right: 10px; z-index: 5;
      padding: 7px 11px;
      background: ${baseBg};
      color: ${baseColor};
      border: 1px solid ${accent};
      border-radius: 999px;
      font-family: inherit; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase;
      cursor: pointer; display: inline-flex; align-items: center; gap: 6px; line-height: 1;
      box-shadow: 0 1px 4px rgba(0,0,0,0.15);
      transition: all 0.2s;
    `;
    btn.onmouseenter = () => { btn.style.background = accent; btn.style.color = '#fff'; };
    btn.onmouseleave = () => { btn.style.background = baseBg; btn.style.color = baseColor; };
    btn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Resolve variant id lazily for grid items (the product JSON wasn't loaded yet).
      if (!product.getVariantId && product.productHandle) {
        const p = await fetchProductByHandle(product.productHandle);
        product.getVariantId = () => currentVariantId(p);
      }
      openModal(product);
    };
    card.appendChild(btn);
  }

  // ---------- 4. MODAL ----------
  // The result tryOnId is stashed here so #tryon-add-cart can correlate.
  let lastTryOnId = null;

  function openModal(product) {
    const accent = widgetConfig.accentColor;
    const overlay = document.createElement('div');
    overlay.id = 'tryon-overlay';
    overlay.innerHTML = `
      <style>
        #tryon-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6);
          z-index: 999999; display: flex; align-items: center; justify-content: center;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          animation: tryonFadeIn 0.2s ease; }
        @keyframes tryonFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes tryonSlideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .tryon-modal { background: #fff; width: 92%; max-width: 520px; max-height: 90vh;
          border-radius: 2px; overflow: hidden; display: flex; flex-direction: column;
          animation: tryonSlideUp 0.25s ease; }
        .tryon-header { padding: 22px 28px; border-bottom: 1px solid #ebebeb;
          display: flex; justify-content: space-between; align-items: center; }
        .tryon-title { font-size: 11px; letter-spacing: 3px; text-transform: uppercase;
          color: #000; font-weight: 600; }
        .tryon-close { background: none; border: none; font-size: 22px; cursor: pointer;
          color: #999; line-height: 1; padding: 0; transition: color 0.2s; }
        .tryon-close:hover { color: #000; }
        .tryon-body { padding: 28px; overflow-y: auto; flex: 1; }
        .tryon-product-preview { display: flex; gap: 14px; align-items: center;
          padding: 14px; background: #f6f6f6; margin-bottom: 28px; }
        .tryon-product-preview img { width: 56px; height: 70px; object-fit: cover; }
        .tryon-product-preview .name { font-size: 13px; font-weight: 600; color: #000; margin-bottom: 4px; }
        .tryon-step { font-size: 16px; font-weight: 600; color: #000; margin-bottom: 6px; }
        .tryon-step-desc { color: #888; font-size: 13px; margin-bottom: 22px; line-height: 1.5; }
        .tryon-upload { border: 1px dashed #ccc; padding: 44px 20px; text-align: center;
          cursor: pointer; transition: all 0.2s; background: #fff; display: block; }
        .tryon-upload:hover { border-color: #000; background: #fafafa; }
        .tryon-upload-icon { font-size: 28px; margin-bottom: 12px; color: #000; opacity: 0.7; }
        .tryon-upload-text { font-size: 13px; letter-spacing: 0.5px; color: #000; }
        .tryon-upload-hint { font-size: 11px; color: #999; margin-top: 8px; letter-spacing: 0.5px; }
        .tryon-preview { width: 100%; max-height: 420px; background: #f6f6f6;
          display: flex; align-items: center; justify-content: center; overflow: hidden; }
        .tryon-preview img { max-width: 100%; max-height: 420px; object-fit: contain; }
        .tryon-loader { text-align: center; padding: 60px 20px; }
        .tryon-spinner { width: 30px; height: 30px;
          border: 2px solid #ebebeb; border-top-color: ${accent};
          border-radius: 50%; animation: tryonSpin 0.8s linear infinite; margin: 0 auto 16px; }
        @keyframes tryonSpin { to { transform: rotate(360deg); } }
        .tryon-loader-text { font-size: 12px; letter-spacing: 2px; text-transform: uppercase; color: #888; }
        .tryon-error { color: #000; font-size: 13px; text-align: center;
          padding: 22px; background: #f6f6f6; border: 1px solid #ebebeb; }
        .tryon-footer { padding: 20px 28px; border-top: 1px solid #ebebeb;
          display: flex; gap: 12px; }
        .tryon-btn-primary, .tryon-btn-secondary {
          flex: 1; padding: 14px; font-family: inherit; font-size: 11px;
          letter-spacing: 2px; text-transform: uppercase; cursor: pointer; transition: all 0.2s; }
        .tryon-btn-primary { background: ${accent}; color: #fff; border: 1px solid ${accent}; }
        .tryon-btn-primary:hover { filter: brightness(1.25); }
        .tryon-btn-primary:disabled { opacity: 0.5; cursor: wait; }
        .tryon-btn-secondary { background: #fff; color: #000; border: 1px solid #000; }
        .tryon-btn-secondary:hover { background: #000; color: #fff; }
        .tryon-privacy { font-size: 10px; color: #aaa; text-align: center;
          margin-top: 20px; letter-spacing: 0.5px; }
        .tryon-consent { display: flex; gap: 9px; align-items: flex-start;
          font-size: 12px; line-height: 1.55; color: #555; margin-bottom: 18px; cursor: pointer; }
        .tryon-consent input { margin: 2px 0 0; flex-shrink: 0; width: 15px; height: 15px;
          cursor: pointer; accent-color: ${accent}; }
        .tryon-upload.tryon-disabled { opacity: 0.45; pointer-events: none; }
        #tryon-file { display: none; }
      </style>

      <div class="tryon-modal">
        <div class="tryon-header">
          <div class="tryon-title">${escapeHtml(widgetConfig.modalTitle)}</div>
          <button class="tryon-close" aria-label="Close">×</button>
        </div>

        <div class="tryon-body">
          <div class="tryon-product-preview">
            <img src="${escapeHtml(product.imageUrl)}" alt="">
            <div>
              <div class="name">${escapeHtml(product.name || document.title || 'Product')}</div>
            </div>
          </div>

          <div id="tryon-step-upload">
            <div class="tryon-step">Upload your photo</div>
            <div class="tryon-step-desc">For the best result, use a clear front-facing photo against a plain background.</div>
            <label class="tryon-consent">
              <input type="checkbox" id="tryon-consent-check">
              <span>${escapeHtml(widgetConfig.consentText)}</span>
            </label>
            <label for="tryon-file" class="tryon-upload tryon-disabled">
              <div class="tryon-upload-icon">⬆</div>
              <div class="tryon-upload-text">Choose a photo or drag here</div>
              <div class="tryon-upload-hint">JPG or PNG · Max 10 MB</div>
            </label>
            <input type="file" id="tryon-file" accept="image/jpeg,image/png,image/webp">
          </div>

          <div id="tryon-step-processing" style="display:none">
            <div class="tryon-loader">
              <div class="tryon-spinner"></div>
              <div class="tryon-loader-text">AI is styling your look…</div>
              <div style="font-size:11px;color:#999;margin-top:12px">Usually takes 10–20 seconds</div>
            </div>
          </div>

          <div id="tryon-step-result" style="display:none">
            <div class="tryon-step">Your look</div>
            <div class="tryon-step-desc">Here's how this piece looks on you.</div>
            <div class="tryon-preview">
              <img id="tryon-result-img" src="" alt="Try-on result">
            </div>
          </div>

          <div id="tryon-step-error" style="display:none">
            <div class="tryon-error" id="tryon-error-msg">Something went wrong. Please try again.</div>
          </div>

          <div class="tryon-privacy">🔒 Your photo is processed securely and never stored</div>
        </div>

        <div class="tryon-footer" id="tryon-footer-upload">
          <button class="tryon-btn-secondary tryon-close-btn">Cancel</button>
        </div>

        <div class="tryon-footer" id="tryon-footer-result" style="display:none">
          <button class="tryon-btn-secondary" id="tryon-retry">Try Another Photo</button>
          <button class="tryon-btn-primary" id="tryon-add-cart">${escapeHtml(widgetConfig.addToCartLabel)}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.tryon-close').onclick = close;
    overlay.querySelector('.tryon-close-btn').onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };

    // Consent gate: upload disabled until ticked.
    const consentCheck = overlay.querySelector('#tryon-consent-check');
    const uploadZone = overlay.querySelector('.tryon-upload');
    const syncConsent = () => uploadZone.classList.toggle('tryon-disabled', !consentCheck.checked);
    consentCheck.onchange = syncConsent;
    syncConsent();

    const fileInput = overlay.querySelector('#tryon-file');
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file) runTryOn(file, product);
    };

    const uploadLabel = overlay.querySelector('.tryon-upload');
    uploadLabel.ondragover = (e) => { e.preventDefault(); uploadLabel.style.borderColor = '#1a1a1a'; };
    uploadLabel.ondragleave = () => { uploadLabel.style.borderColor = '#ccc'; };
    uploadLabel.ondrop = (e) => {
      e.preventDefault();
      uploadLabel.style.borderColor = '#ccc';
      const file = e.dataTransfer.files[0];
      if (file) runTryOn(file, product);
    };

    overlay.querySelector('#tryon-retry').onclick = () => {
      showStep('upload');
      fileInput.value = '';
    };

    overlay.querySelector('#tryon-add-cart').onclick = async (e) => {
      const button = e.currentTarget;
      button.disabled = true;
      const variantId = product.getVariantId ? product.getVariantId() : null;
      await addToShopifyCart(product, variantId);
      logCartAdd(product, variantId);
      close();
    };
  }

  // ---------- 5. STEP MANAGEMENT ----------
  function showStep(step) {
    const overlay = document.getElementById('tryon-overlay');
    if (!overlay) return;
    overlay.querySelector('#tryon-step-upload').style.display = step === 'upload' ? 'block' : 'none';
    overlay.querySelector('#tryon-step-processing').style.display = step === 'processing' ? 'block' : 'none';
    overlay.querySelector('#tryon-step-result').style.display = step === 'result' ? 'block' : 'none';
    overlay.querySelector('#tryon-step-error').style.display = step === 'error' ? 'block' : 'none';
    overlay.querySelector('#tryon-footer-upload').style.display = step === 'upload' || step === 'error' ? 'flex' : 'none';
    overlay.querySelector('#tryon-footer-result').style.display = step === 'result' ? 'flex' : 'none';
  }

  // ---------- 6. TRY-ON API CALL ----------
  async function runTryOn(file, product) {
    showStep('processing');
    try {
      const fd = new FormData();
      fd.append('photo', file);
      fd.append('shop', shopDomain);
      fd.append('productId', product.productId || '');
      if (product.productHandle) fd.append('productHandle', product.productHandle);
      if (product.name) fd.append('productLabel', product.name);
      fd.append('garmentImageUrl', product.imageUrl);

      const res = await fetch(`${API_BASE}/api/tryon`, { method: 'POST', body: fd });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || `Server error ${res.status}`);
      }

      lastTryOnId = data.tryOnId || null;
      const overlay = document.getElementById('tryon-overlay');
      overlay.querySelector('#tryon-result-img').src = data.resultImage;
      showStep('result');
    } catch (err) {
      console.error('[TryOn] Error:', err);
      const overlay = document.getElementById('tryon-overlay');
      if (overlay) {
        overlay.querySelector('#tryon-error-msg').textContent =
          err.message || 'Something went wrong. Please try again.';
      }
      showStep('error');
    }
  }

  // ---------- 7. CART ----------
  // Actually adds the item to the Shopify cart, then opens the cart drawer
  // (Dawn and most modern themes listen for `cart:refresh`); falls back to
  // a /cart redirect if nothing handles the event.
  async function addToShopifyCart(product, variantId) {
    if (!variantId) {
      window.location.href = '/cart';
      return;
    }
    try {
      const fd = new FormData();
      fd.append('id', String(variantId));
      fd.append('quantity', '1');
      const res = await fetch('/cart/add.js', {
        method: 'POST',
        body: fd,
        headers: { 'Accept': 'application/json' },
      });
      if (!res.ok) throw new Error(`cart/add ${res.status}`);

      // Notify the theme — Dawn-derived themes listen for one of these.
      document.dispatchEvent(new CustomEvent('cart:refresh'));
      document.dispatchEvent(new CustomEvent('cart:updated'));
      window.dispatchEvent(new CustomEvent('cart:build'));
    } catch (err) {
      console.error('[TryOn] cart/add failed:', err);
      window.location.href = '/cart';
    }
  }

  // Fire-and-forget conversion log. Never blocks the cart flow.
  function logCartAdd(product, variantId) {
    try {
      fetch(`${API_BASE}/api/cart-add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          shop: shopDomain,
          tryOnId: lastTryOnId,
          productId: String(product.productId || ''),
          variantId: variantId ? String(variantId) : null,
        }),
      }).catch(() => { /* swallow */ });
    } catch { /* swallow */ }
  }

  // ---------- 8. INIT ----------
  async function init() {
    await ensureConfig();
    if (!widgetConfig.enabled) return;

    if (widgetConfig.showOnProduct !== false) {
      const product = await detectProduct();
      if (product) injectMainButton(product);
    }

    if (widgetConfig.showOnCollection !== false) {
      const gridProducts = detectGrid();
      gridProducts.forEach(injectCardButton);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-run when listing pages lazy-load or paginate in more cards.
  let reinitTimer = null;
  const observer = new MutationObserver(() => {
    if (reinitTimer) return;
    reinitTimer = setTimeout(() => { reinitTimer = null; init(); }, 400);
  });
  const startObserving = () => observer.observe(document.body, { childList: true, subtree: true });
  if (document.body) startObserving();
  else document.addEventListener('DOMContentLoaded', startObserving);

  document.addEventListener('shopify:section:load', init);
  window.addEventListener('popstate', init);
})();
