window.metaPixelContext = window.metaPixelContext || {};
window.metaPixelContext = Object.assign(window.metaPixelContext, {
    shop: {
        domain: window.metaPixelContext?.shop?.domain || '',
        currency: window.metaPixelContext?.shop?.currency || '',
        moneyFormat: window.metaPixelContext?.shop?.moneyFormat || ''
    },
    customer: {
        id: window.metaPixelContext?.customer?.id || 0,
        email: window.metaPixelContext?.customer?.email || '',
        firstName: window.metaPixelContext?.customer?.firstName || '',
        lastName: window.metaPixelContext?.customer?.lastName || '',
        phone: window.metaPixelContext?.customer?.phone || '',
        tags: window.metaPixelContext?.customer?.tags || [],
        hasAccount: window.metaPixelContext?.customer?.hasAccount || false,
        defaultAddress: {
            city: window.metaPixelContext?.customer?.defaultAddress?.city || '',
            country: window.metaPixelContext?.customer?.defaultAddress?.country || '',
            province: window.metaPixelContext?.customer?.defaultAddress?.province || '',
            zip: window.metaPixelContext?.customer?.defaultAddress?.zip || ''
        }
    },
    page: {
        type: window.metaPixelContext?.page?.type || '',
        title: window.metaPixelContext?.page?.title || document.title,
        url: window.metaPixelContext?.page?.url || window.location.href,
        path: window.metaPixelContext?.page?.path || window.location.pathname,
        template: window.metaPixelContext?.page?.template || '',
        templateSuffix: window.metaPixelContext?.page?.templateSuffix || '',
        searchTerm: window.metaPixelContext?.page?.searchTerm || '',
        tag: window.metaPixelContext?.page?.tag || ''
    },
    cart: window.metaPixelContext?.cart || {}
});

window.metaPixel = window.metaPixel || {};
window.metaPixel.normalizeCurrency = function (currencyValue) {
    if (typeof currencyValue !== 'string') {
        return null;
    }
    const normalizedValue = currencyValue.trim().toUpperCase();
    return /^[A-Z]{3}$/.test(normalizedValue) ? normalizedValue : null;
};

window.metaPixel.safeTrack = function (eventName, payload = {}) {

    const cleaned = {};

    Object.keys(payload).forEach(key => {
        const value = payload[key];

        if (
            value !== undefined &&
            value !== null &&
            value !== "" &&
            !(Array.isArray(value) && value.length === 0)
        ) {
            cleaned[key] = value;
        }
    });

    // Push to dataLayer for easier debugging / GTM triggers.
    try {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
            event: eventName,
            meta_event: eventName,
            ...cleaned
        });
    } catch (_) {
        // no-op
    }

    console.log("[META]", eventName, cleaned);

    // fbq may not be available yet (consent managers, deferred loads). Queue and flush.
    if (typeof fbq === "function") {
        fbq("track", eventName, cleaned);
        return;
    }

    window.__metaPixelFbqQueue = window.__metaPixelFbqQueue || [];
    window.__metaPixelFbqQueue.push([eventName, cleaned]);

    if (!window.__metaPixelFbqQueueFlusher) {
        window.__metaPixelFbqQueueFlusher = true;
        let attempts = 0;
        const maxAttempts = 50; // ~5s at 100ms
        const intervalId = setInterval(function () {
            attempts++;
            if (typeof fbq === "function") {
                const q = window.__metaPixelFbqQueue || [];
                window.__metaPixelFbqQueue = [];
                q.forEach(function (args) {
                    try {
                        fbq("track", args[0], args[1]);
                    } catch (e) {
                        // no-op
                    }
                });
                clearInterval(intervalId);
                return;
            }
            if (attempts >= maxAttempts) clearInterval(intervalId);
        }, 100);
    }
};

window.metaPixel.buildEventPayload = function (basePayload = {}) {
    const shop = window.metaPixelContext?.shop || {};
    const page = window.metaPixelContext?.page || {};

    const payload = {};

    // Only Meta-supported parameters

    if (basePayload.content_ids?.length) {
        payload.content_ids = basePayload.content_ids.map(String);
    }

    if (basePayload.contents?.length) {
        payload.contents = basePayload.contents.map(item => ({
            id: String(item.id),
            quantity: Number(item.quantity) || 1
        }));
    }

    if (basePayload.content_name) {
        payload.content_name = basePayload.content_name;
    }

    if (basePayload.content_category) {
        payload.content_category = basePayload.content_category;
    }

    if (
        basePayload.content_type === "product" ||
        basePayload.content_type === "product_group"
    ) {
        payload.content_type = basePayload.content_type;
    }

    if (basePayload.search_string) {
        payload.search_string = basePayload.search_string;
    } else if (page.searchTerm) {
        payload.search_string = page.searchTerm;
    }

    if (basePayload.num_items != null) {
        payload.num_items = Number(basePayload.num_items);
    }

    const currency = window.metaPixel.normalizeCurrency(
        basePayload.currency || shop.currency
    );

    if (currency) {
        payload.currency = currency;
    }

    if (
        basePayload.value !== undefined &&
        basePayload.value !== null &&
        !isNaN(basePayload.value)
    ) {
        payload.value = Number(basePayload.value);
    }

    return payload;
};

window.metaPixel.trackViewPage = function () {
    const isProductPage =
        window.metaPixelContext?.page?.type === "product" ||
        /\/products\//i.test(window.metaPixelContext?.page?.path || window.location.pathname) ||
        !!document.querySelector('[data-product-id],[data-product]');

    if (isProductPage) {
        window.metaPixel.safeTrack("ViewContent", {
            content_name: document.title,
            content_type: "product"
        });
    }
};
window.metaPixel.trackAddToCart = function (payload) {
    const eventPayload = window.metaPixel.buildEventPayload(payload || {});
    console.info('[Meta Pixel] preparing AddToCart', eventPayload);
    window.metaPixel.safeTrack('AddToCart', eventPayload);
};

window.metaPixel.trackNewsletterSignup = function (payload) {
    const eventPayload = window.metaPixel.buildEventPayload(payload || {});
    console.info('[Meta Pixel] preparing CompleteRegistration', eventPayload);
    window.metaPixel.safeTrack('CompleteRegistration', eventPayload);
};

window.metaPixel.trackInitiateCheckout = function (payload) {
    const eventPayload = window.metaPixel.buildEventPayload(payload || {});
    console.info('[Meta Pixel] preparing InitiateCheckout', eventPayload);
    window.metaPixel.safeTrack('InitiateCheckout', eventPayload);
};

window.metaPixel.trackInitiateCheckoutFromCart = function () {
    const now = Date.now();
    if (window.__metaPixelLastInitiateCheckout && now - window.__metaPixelLastInitiateCheckout < 1000) {
        return;
    }
    window.__metaPixelLastInitiateCheckout = now;

    const trackFromPayload = function (cartPayload) {
        window.metaPixelContext.cart = cartPayload || window.metaPixelContext.cart || {};
        const payload = window.metaPixel.buildEventPayload({
            content_name: 'Checkout',
            content_category: 'checkout',
            value: cartPayload?.total_price || window.metaPixelContext.cart?.total_price || 0,
            currency: cartPayload?.currency || window.metaPixelContext.shop?.currency || null,
            num_items: cartPayload?.item_count || window.metaPixelContext.cart?.item_count || 0,
            contents: (cartPayload?.items || window.metaPixelContext.cart?.items || []).map(function (item) {
                return {
                    id: item.variant_id || item.id,
                    quantity: item.quantity,
                    item_price: item.price
                };
            })
        });
        window.metaPixel.trackInitiateCheckout(payload);
    };

    // Fire immediately with cached cart context so the event isn't lost
    // when GoKwik opens its checkout iframe right away.
    trackFromPayload(window.metaPixelContext?.cart || null);

    fetch('/cart.js', { credentials: 'same-origin' })
        .then(function (response) {
            return response.ok ? response.json() : null;
        })
        .then(function (cartPayload) {
            if (cartPayload) {
                window.metaPixelContext.cart = cartPayload;
            }
        })
        .catch(function () {
            // Already tracked with cached cart context above.
        });
};

window.metaPixel.trackSearch = function (payload) {
    const eventPayload = window.metaPixel.buildEventPayload(payload || {});
    console.info('[Meta Pixel] preparing Search', eventPayload);
    window.metaPixel.safeTrack('Search', eventPayload);
};

window.metaPixel.isSearchForm = function (form) {
    if (!(form instanceof HTMLFormElement)) {
        return false;
    }

    const formAction = form.getAttribute('action') || form.action || '';
    return (
        form.getAttribute('role') === 'search' ||
        /\/search\b/i.test(formAction) ||
        form.classList.contains('search-modal__form') ||
        !!form.querySelector('input[name="q"], input[type="search"]')
    );
};

window.metaPixel.getSearchQueryFromForm = function (form) {
    if (!(form instanceof HTMLFormElement)) {
        return '';
    }

    const formData = new FormData(form);
    const searchValue =
        formData.get('q') ||
        formData.get('search') ||
        formData.get('search_query') ||
        formData.get('terms') ||
        '';

    if (typeof searchValue === 'string' && searchValue.trim()) {
        return searchValue.trim();
    }

    const input = form.querySelector('input[name="q"], input[type="search"]');
    return input && input.value ? input.value.trim() : '';
};

window.metaPixel.trackSearchFromQuery = function (query, payload) {
    const searchString = typeof query === 'string' ? query.trim() : '';
    if (!searchString) {
        return;
    }

    const now = Date.now();
    if (
        window.__metaPixelLastSearch &&
        window.__metaPixelLastSearch.query === searchString &&
        now - window.__metaPixelLastSearch.ts < 2000
    ) {
        return;
    }

    window.__metaPixelLastSearch = { query: searchString, ts: now };

    window.metaPixel.trackSearch(Object.assign({}, payload || {}, {
        content_name: 'Search',
        content_category: 'search',
        search_string: searchString
    }));
};

window.metaPixel.trackSearchFromForm = function (form, payload) {
    const searchString = window.metaPixel.getSearchQueryFromForm(form);
    if (!searchString) {
        return;
    }

    window.metaPixel.trackSearchFromQuery(searchString, Object.assign({}, payload || {}, {
        content_name: 'Search',
        content_category: 'search'
    }));
};

window.metaPixel.observeSearchModal = function () {
    document.querySelectorAll('.search-modal').forEach(function (modal) {
        if (modal.dataset.metaPixelSearchObserved === 'true') {
            return;
        }

        modal.dataset.metaPixelSearchObserved = 'true';

        const observer = new MutationObserver(function (mutations) {
            mutations.forEach(function (mutation) {
                if (mutation.type !== 'attributes' || mutation.attributeName !== 'class') {
                    return;
                }

                if (!modal.classList.contains('searching')) {
                    return;
                }

                const input = modal.querySelector('input[name="q"], input[type="search"]');
                const query = input && input.value ? input.value.trim() : '';
                if (!query) {
                    return;
                }

                console.info('[Meta Pixel] header predictive search', { query: query });
                window.metaPixel.trackSearchFromQuery(query, {
                    content_name: 'Header search',
                    content_category: 'search'
                });
            });
        });

        observer.observe(modal, {
            attributes: true,
            attributeFilter: ['class']
        });
    });
};

window.metaPixel.trackSearchResultsPage = function () {
    const page = window.metaPixelContext?.page || {};
    const isSearchPage =
        page.type === 'search' ||
        /\/search\b/i.test(page.path || window.location.pathname);

    if (!isSearchPage) {
        return;
    }

    let searchString = page.searchTerm || '';
    if (!searchString) {
        try {
            searchString = new URL(window.location.href).searchParams.get('q') || '';
        } catch (_) {
            searchString = '';
        }
    }

    if (!searchString) {
        return;
    }

    window.metaPixel.trackSearchFromQuery(searchString, {
        content_name: 'Search results',
        content_category: 'search'
    });
};

window.metaPixel.trackEventFromForm = function (form, eventName, payload) {
    if (!(form instanceof HTMLFormElement)) {
        return payload || {};
    }

    const formData = new FormData(form);
    const normalizedPayload = Object.assign({}, payload || {});
    for (const [key, value] of formData.entries()) {
        if (typeof value === 'string' && value.trim()) {
            normalizedPayload[key] = value;
        }
    }

    const searchValue = formData.get('q') || formData.get('search') || formData.get('search_query') || formData.get('terms') || '';
    if (searchValue && !normalizedPayload.search_string) {
        normalizedPayload.search_string = searchValue;
    }

    if (eventName === 'CompleteRegistration') {
        normalizedPayload.content_name = normalizedPayload.content_name || 'Newsletter signup';
        normalizedPayload.content_category = normalizedPayload.content_category || 'newsletter';
    }

    return normalizedPayload;
};

// Advanced matching: pick up whatever identity the shopper types into a form
// (newsletter, account, address) and hand it to the pixel. Normalization and
// storage live in the `meta-pixel-advanced-matching` snippet, which also
// re-inits the pixel so later events on this page are matched too.
window.metaPixel.IDENTITY_FIELD_MAP = [
    { key: 'email', match: /(^|\b)(email|e-mail|mail)\b/i, type: 'email' },
    { key: 'phone', match: /(^|\b)(phone|mobile|tel|contact_number)\b/i, type: 'tel' },
    { key: 'firstName', match: /(first[_-]?name|fname)/i },
    { key: 'lastName', match: /(last[_-]?name|lname|surname)/i },
    { key: 'city', match: /\bcity\b/i },
    { key: 'province', match: /(province|state|region)/i },
    { key: 'zip', match: /(zip|postal|pincode|pin[_-]?code)/i },
    { key: 'country', match: /country/i }
];

window.metaPixel.identityKeyForField = function (field) {
    if (!field || field.disabled) return '';
    if (field.type === 'password' || field.type === 'hidden') return '';

    const haystack = [
        field.getAttribute('name') || '',
        field.getAttribute('id') || '',
        field.getAttribute('autocomplete') || '',
        field.getAttribute('placeholder') || ''
    ].join(' ');

    const byType = window.metaPixel.IDENTITY_FIELD_MAP.find(function (entry) {
        return entry.type && field.type === entry.type;
    });
    if (byType) return byType.key;

    const byName = window.metaPixel.IDENTITY_FIELD_MAP.find(function (entry) {
        return entry.match.test(haystack);
    });
    return byName ? byName.key : '';
};

window.metaPixel.captureIdentityFromForm = function (form) {
    if (!(form instanceof HTMLFormElement)) return;
    if (typeof window.metaPixel.rememberAdvancedMatching !== 'function') return;

    const identity = {};
    Array.prototype.forEach.call(form.querySelectorAll('input, select'), function (field) {
        const value = typeof field.value === 'string' ? field.value.trim() : '';
        if (!value) return;

        const key = window.metaPixel.identityKeyForField(field);
        if (key && !identity[key]) identity[key] = value;
    });

    if (!Object.keys(identity).length) return;

    const matched = window.metaPixel.rememberAdvancedMatching(identity);
    console.info('[Meta Pixel] advanced matching updated', Object.keys(matched));
};

function initMetaPixel() {
    if (window.metaPixelInitialized) {
        return;
    }
    window.metaPixelInitialized = true;
    console.info('[Meta Pixel] script loaded and initialized');

    window.metaPixel.trackViewPage();
    window.metaPixel.trackSearchResultsPage();
    window.metaPixel.observeSearchModal();

    // Fields are often filled but never submitted (cart drawers, multi-step
    // forms), so match on blur as well as on submit.
    document.addEventListener('blur', function (event) {
        const field = event.target;
        if (!(field instanceof HTMLInputElement) && !(field instanceof HTMLSelectElement)) return;
        if (typeof window.metaPixel.rememberAdvancedMatching !== 'function') return;

        const value = typeof field.value === 'string' ? field.value.trim() : '';
        if (!value) return;

        const key = window.metaPixel.identityKeyForField(field);
        if (!key) return;

        const identity = {};
        identity[key] = value;
        window.metaPixel.rememberAdvancedMatching(identity);
    }, true);

    // Shopify newsletter forms often redirect with `?customer_posted=true`
    // only after a successful subscription. Track that success state once.
    try {
        const url = new URL(window.location.href);
        const hasNewsletterSuccess =
            url.searchParams.get('customer_posted') === 'true' ||
            !!document.querySelector('.welcomeText, .couponCodeUse, [id*="Newsletter-success"]');

        if (hasNewsletterSuccess && sessionStorage.getItem('metaPixelNewsletterSuccessTracked') !== 'true') {
            sessionStorage.setItem('metaPixelNewsletterSuccessTracked', 'true');
            window.metaPixel.trackNewsletterSignup({
                content_name: 'Newsletter signup',
                content_category: 'newsletter'
            });
        } else if (!hasNewsletterSuccess) {
            sessionStorage.removeItem('metaPixelNewsletterSuccessTracked');
        }
    } catch (_) {
        // no-op
    }

    document.addEventListener('submit', function (event) {
        const form = event.target;
        if (!(form instanceof HTMLFormElement)) return;

        if (!window.metaPixel.isSearchForm(form)) {
            window.metaPixel.captureIdentityFromForm(form);
        }

        if (window.metaPixel.isSearchForm(form)) {
            console.info('[Meta Pixel] search form submitted', {
                form: form.id || form.className || 'unknown'
            });
            window.metaPixel.trackSearchFromForm(form, {
                content_name: 'Search',
                content_category: 'search'
            });
            return;
        }

        const formId = form.getAttribute('id') || '';
        const formClass = form.getAttribute('class') || '';
        const formAction = form.getAttribute('action') || form.action || '';
        const hasNewsletterTag = Array.from(form.elements || []).some(function (element) {
            return element.name === 'contact[tags]' && String(element.value || '').toLowerCase().includes('newsletter');
        });
        const isNewsletterForm =
            formClass.toLowerCase().includes('newsletter') ||
            formId.toLowerCase().includes('newsletter') ||
            hasNewsletterTag;

        if (isNewsletterForm) {
            console.info('[Meta Pixel] newsletter form submitted', { form: form.id || form.className || 'unknown' });
            const payload = window.metaPixel.trackEventFromForm(form, 'CompleteRegistration', {
                content_name: 'Newsletter signup',
                content_category: 'newsletter'
            });
            window.metaPixel.trackNewsletterSignup(payload);
            return;
        }

        // Generic AddToCart tracking for ANY Shopify cart add form.
        // This makes tracking work even if the theme doesn't use the `<product-form>` element.
        const isCartAddForm = /\/cart\/add\b/i.test(formAction);
        if (isCartAddForm) {
            // Prevent double-firing when the theme already tracks via `product-form.js`.
            if (form.dataset && form.dataset.metapixelAddToCartTracked === 'true') return;
            if (form.dataset) form.dataset.metapixelAddToCartTracked = 'true';

            const idInput = form.querySelector('input[name="id"]');
            const variantId = idInput && idInput.value ? String(idInput.value) : '';
            if (!variantId) return;

            const quantityInput = form.querySelector('input[name="quantity"]');
            const quantity = quantityInput && quantityInput.value ? parseInt(quantityInput.value, 10) || 1 : 1;

            window.metaPixel.trackAddToCart({
                content_type: 'product',
                content_name: document.title,
                content_category: 'product',
                content_ids: [variantId],
                contents: [
                    {
                        id: variantId,
                        quantity: quantity
                    }
                ]
            });
        }
    }, true);

    document.addEventListener('click', function (event) {
        const submitButton = event.target.closest(
            '.search-modal button[type="submit"], .search-modal .search__button[type="submit"]'
        );
        if (!submitButton) return;

        const form = submitButton.closest('form');
        if (!form) return;

        console.info('[Meta Pixel] header search submit clicked');
        window.metaPixel.trackSearchFromForm(form, {
            content_name: 'Header search',
            content_category: 'search'
        });
    }, true);

    // Collection/card quick-add tracking (theme dispatches this after AJAX add).
    document.addEventListener('ajaxProduct:added', function (event) {
        try {
            const cartState = event && event.detail && event.detail.product ? event.detail.product : null;
            if (!cartState) return;

            const items = cartState.items || [];
            const first = items[0] || {};
            const variantId = first.variant_id || first.id;
            if (!variantId) return;

            // Avoid duplicates when multiple handlers trigger for one click.
            const now = Date.now();
            if (window.__metaPixelLastAddToCart && String(window.__metaPixelLastAddToCart.id) === String(variantId)) {
                if (now - window.__metaPixelLastAddToCart.ts < 1000) return;
            }
            window.__metaPixelLastAddToCart = { id: variantId, ts: now };

            const currency =
                cartState.currency ||
                window.metaPixelContext?.shop?.currency ||
                null;

            const contentName =
                first.product_title ||
                first.title ||
                document.title;

            const quantity = first.quantity ? parseInt(first.quantity, 10) || 1 : 1;

            window.metaPixel.trackAddToCart({
                content_type: 'product',
                content_name: contentName,
                content_category: 'product',
                content_ids: [String(variantId)],
                contents: [
                    {
                        id: String(variantId),
                        quantity: quantity
                    }
                ],
                currency: currency,
                value: cartState.total_price || cartState.totalPrice || undefined,
                num_items: cartState.item_count || cartState.itemCount || undefined
            });
        } catch (e) {
            // no-op (tracking should never break checkout)
        }
    });

    // Fallback for card quick-add when the theme uses `Shopify.postLink`
    // (no `ajaxProduct:added` event will be dispatched in that case).
    document.addEventListener('click', function (event) {
        const addToCartEl = event.target.closest && event.target.closest('add-to-cart');
        if (!addToCartEl) return;

        const variantId =
            addToCartEl.dataset && addToCartEl.dataset.variantId
                ? String(addToCartEl.dataset.variantId)
                : String(addToCartEl.getAttribute('data-variant-id') || '');

        if (!variantId) return;

        const now = Date.now();
        if (window.__metaPixelLastAddToCart && String(window.__metaPixelLastAddToCart.id) === String(variantId)) {
            if (now - window.__metaPixelLastAddToCart.ts < 1000) return;
        }

        window.__metaPixelLastAddToCart = { id: variantId, ts: now };

        // We don't know the exact product title from this element reliably.
        // Use `document.title` so Meta gets at least content_ids/contents.
        window.metaPixel.trackAddToCart({
            content_type: 'product',
            content_name: document.title,
            content_category: 'product',
            content_ids: [variantId],
            contents: [
                {
                    id: variantId,
                    quantity: 1
                }
            ]
        });
    }, true);

    document.addEventListener('click', function (event) {
        const target = event.target.closest('a, button, input[type="submit"]');
        if (!target) return;

        const href = target.getAttribute('href') || '';
        const gokwikFunction = target.getAttribute('data-gokwik-function') || target.getAttribute('data-function') || '';
        const isCheckoutLink =
            /\/checkout\b|checkout\.shopify|checkout/i.test(href) ||
            target.getAttribute('data-checkout') === 'true' ||
            target.getAttribute('name') === 'checkout' ||
            gokwikFunction === 'checkout' ||
            (target.classList && target.classList.contains('gokwik-marge') && gokwikFunction === 'checkout');

        if (!isCheckoutLink) return;

        console.info('[Meta Pixel] checkout button clicked', {
            href: href,
            name: target.getAttribute('name'),
            gokwikFunction: gokwikFunction
        });
        window.metaPixel.trackInitiateCheckoutFromCart();
    }, true);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMetaPixel, { once: true });
} else {
    initMetaPixel();
}
