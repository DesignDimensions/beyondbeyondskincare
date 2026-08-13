/*
 * Rakhi gift-note cart behaviour.
 *
 * Two jobs, both driven off cart state rather than the DOM so they survive
 * the drawer and the cart page re-rendering their sections:
 *
 *   1. Cap each gift wrap's quantity at the quantity of the product it was added
 *      with (linked by the `_gift_wrap_for` line item property), and drop the wrap
 *      entirely once that product leaves the cart.
 *   2. Let a shopper edit their gift note in place.
 */
(() => {
  const WRAP_PROPERTY = '_gift_wrap_for';

  const routes = (window.theme && window.theme.routes) || {};
  const CART_URL = routes.cart_url || '/cart';
  const CHANGE_URL = routes.cart_change_url || '/cart/change';

  const jsonHeaders = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const getSections = () => {
    const miniCart = document.querySelector('mini-cart');
    if (!miniCart || typeof miniCart.getSectionsToRender !== 'function') return { miniCart: null, ids: [] };
    return { miniCart, ids: miniCart.getSectionsToRender().map((section) => section.id) };
  };

  const renderSections = (state) => {
    const { miniCart } = getSections();
    if (miniCart && state && state.sections) miniCart.renderContents(state);
  };

  const getCart = () => fetch(`${CART_URL}.js`, { headers: jsonHeaders }).then((r) => r.json());

  const changeLine = (payload) => {
    const { ids } = getSections();
    return fetch(`${CHANGE_URL}.js`, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify({ ...payload, sections: ids, sections_url: window.location.pathname }),
    }).then((r) => r.json());
  };

  /* ---------------- 1. gift wrap quantity cap ---------------- */

  let reconciling = false;

  // Each pass fixes at most one line, because line numbers shift after a change.
  // Quantities only ever go down, so this terminates; the cap is belt-and-braces
  // against an unexpected response leaving us in a loop.
  const MAX_PASSES = 25;

  const reconcileWraps = (pass = 0) => {
    if (reconciling || pass > MAX_PASSES) return Promise.resolve();
    reconciling = true;

    return getCart()
      .then((cart) => {
        if (!cart || !Array.isArray(cart.items)) return null;

        // How many of each parent variant are in the cart, counting only
        // non-wrap lines so a wrap can never license itself.
        const parentQty = new Map();
        cart.items.forEach((item) => {
          const props = item.properties || {};
          if (props[WRAP_PROPERTY]) return;
          const key = String(item.variant_id);
          parentQty.set(key, (parentQty.get(key) || 0) + item.quantity);
        });

        // Budget per parent, so several wrap lines pointing at the same product
        // cannot each sit at the cap and collectively exceed it.
        const remaining = new Map(parentQty);

        for (let i = 0; i < cart.items.length; i += 1) {
          const item = cart.items[i];
          const parentId = (item.properties || {})[WRAP_PROPERTY];
          if (!parentId) continue;

          const key = String(parentId);
          const budget = Math.max(0, remaining.get(key) || 0);
          const allowed = Math.min(item.quantity, budget);

          if (item.quantity !== allowed) {
            // quantity 0 removes the line, which covers "parent was removed".
            return changeLine({ line: i + 1, quantity: allowed });
          }
          remaining.set(key, budget - allowed);
        }
        return null;
      })
      .then((state) => {
        if (!state) return null;
        renderSections(state);
        reconciling = false;
        return reconcileWraps(pass + 1);
      })
      .finally(() => {
        reconciling = false;
      });
  };

  /* ---------------- 2. inline gift note editing ---------------- */

  const parseOtherProperties = (raw) => {
    const props = {};
    (raw || '')
      .split('\n')
      .filter(Boolean)
      .forEach((row) => {
        const tab = row.indexOf('\t');
        if (tab > 0) props[row.slice(0, tab)] = row.slice(tab + 1);
      });
    return props;
  };

  const onClick = (event) => {
    const root = event.target.closest('[data-cart-gift-note]');
    if (!root) return;

    const textEl = root.querySelector('[data-cart-gift-note-text]');
    const editor = root.querySelector('[data-cart-gift-note-editor]');
    const input = root.querySelector('[data-cart-gift-note-input]');

    if (event.target.closest('[data-cart-gift-note-edit]')) {
      event.preventDefault();
      editor.hidden = false;
      if (textEl) textEl.hidden = true;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      return;
    }

    if (event.target.closest('[data-cart-gift-note-cancel]')) {
      event.preventDefault();
      input.value = textEl ? textEl.textContent : '';
      editor.hidden = true;
      if (textEl) textEl.hidden = false;
      return;
    }

    if (event.target.closest('[data-cart-gift-note-save]')) {
      event.preventDefault();
      const line = Number(root.dataset.line);
      const key = root.dataset.noteKey;
      const value = input.value.trim();

      // change.js replaces the property set wholesale, so resend the others.
      const properties = parseOtherProperties(root.dataset.otherProperties);
      if (value) properties[key] = value;

      root.setAttribute('aria-busy', 'true');
      changeLine({ line, properties })
        .then((state) => {
          renderSections(state);
          if (!state || !state.sections) window.location.reload();
        })
        .catch(() => {
          root.removeAttribute('aria-busy');
        });
    }
  };

  document.addEventListener('click', onClick);

  document.addEventListener('ajaxProduct:added', () => reconcileWraps());
  if (typeof subscribe === 'function' && typeof PUB_SUB_EVENTS !== 'undefined') {
    subscribe(PUB_SUB_EVENTS.cartUpdate, () => reconcileWraps());
  }

  // Backstop for any cart path that changes a quantity without publishing
  // cartUpdate: re-check shortly after the theme's own request settles.
  document.addEventListener('change', (event) => {
    if (!event.target.closest('.quantity__input, quantity-input, cart-remove-button')) return;
    setTimeout(() => reconcileWraps(), 600);
  });

  document.addEventListener('DOMContentLoaded', () => reconcileWraps());
  if (document.readyState !== 'loading') reconcileWraps();
})();
