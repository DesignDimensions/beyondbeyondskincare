/*
 * Free gift auto-add
 * ------------------
 * Keeps the configured gift line in sync with its trigger product using only
 * the native Cart AJAX API (/cart.js, /cart/add.js, /cart/change.js). The
 * automatic discount still does the pricing — this just makes sure the line
 * exists so the discount has something to apply to.
 *
 * Config and the fetch/XHR interceptor come from snippets/free-gift.liquid.
 */
(function () {
  'use strict';

  var NS = window.BBFreeGift;
  if (!NS || !NS.config || !NS.config.rules || !NS.config.rules.length) return;

  var cfg = NS.config;
  var rules = cfg.rules;
  var GIFT_PROPERTY = cfg.property || '_free_gift';
  var ADDED_KEY = 'bb-free-gift:added';
  var DISMISSED_KEY = 'bb-free-gift:dismissed';

  // Never routed through the patched fetch, so our own writes can't re-trigger
  // the interceptor.
  var rawFetch = NS.rawFetch || window.fetch.bind(window);

  function log() {
    if (!cfg.debug) return;
    console.log.apply(console, ['[free-gift]'].concat(Array.prototype.slice.call(arguments)));
  }

  /* ── Cart API ─────────────────────────────────────────────────────────── */

  function request(url, options) {
    var opts = options || {};
    opts.credentials = 'same-origin';
    opts.headers = Object.assign(
      { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      opts.headers || {}
    );

    return rawFetch(url, opts).then(function (response) {
      return response.json().then(function (body) {
        if (!response.ok) {
          var error = new Error((body && body.description) || response.statusText);
          error.status = response.status;
          error.body = body;
          throw error;
        }
        return body;
      });
    });
  }

  function getCart() {
    return request(cfg.routes.cart);
  }

  function postJSON(url, payload) {
    return request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  /* ── Session memory ───────────────────────────────────────────────────── */

  // Flags are stored against the cart token they were set for. A new cart (the
  // customer checked out, or the cart expired) therefore starts clean instead
  // of inheriting a stale "already added" / "dismissed" state.
  function readMap(key) {
    try {
      var raw = window.sessionStorage.getItem(key);
      var parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) {
      return {};
    }
  }

  function flagged(key, id, token) {
    return !!token && readMap(key)[id] === token;
  }

  function writeMap(key, map) {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(map));
    } catch (e) {}
  }

  function setFlag(key, id, token) {
    var map = readMap(key);
    if (token) {
      map[id] = token;
    } else {
      delete map[id];
    }
    writeMap(key, map);
  }

  // How many gift units the discount actually covered last time we looked,
  // recorded with the trigger quantity it was measured at. Without this the
  // planner would keep re-adding the units the trim step just removed.
  function rememberCap(rule, cart, quantity) {
    var map = readMap(CAP_KEY);
    map[rule.id] = {
      token: cart.token,
      triggerQuantity: triggerQuantityFor(rule, cart),
      cap: quantity
    };
    writeMap(CAP_KEY, map);
  }

  function capFor(rule, token, triggerQuantity) {
    var entry = readMap(CAP_KEY)[rule.id];
    if (!entry || entry.token !== token || typeof entry.cap !== 'number') return null;
    // More triggers than when we measured — the discount may stretch further,
    // so let it probe again rather than under-gifting.
    if (triggerQuantity > entry.triggerQuantity) return null;
    return entry.cap;
  }

  /* ── Planning ─────────────────────────────────────────────────────────── */

  function isGiftLine(item, rule) {
    return !!(item.properties && item.properties[GIFT_PROPERTY] === rule.id);
  }

  function findGiftLine(cart, rule) {
    var found = null;
    (cart.items || []).forEach(function (item) {
      if (!found && isGiftLine(item, rule)) found = item;
    });
    return found;
  }

  function triggerQuantityFor(rule, cart) {
    var total = 0;
    (cart.items || []).forEach(function (item) {
      if (item.product_id === rule.triggerProductId) total += item.quantity;
    });
    return total;
  }

  // Returns the single action needed to bring `rule` in line with `cart`, or
  // null when the cart is already correct.
  function planFor(rule, cart) {
    var token = cart.token;
    var triggerQuantity = 0;
    var giftLine = null;
    var giftQuantity = 0;

    (cart.items || []).forEach(function (item) {
      if (item.product_id === rule.triggerProductId) triggerQuantity += item.quantity;
      if (isGiftLine(item, rule)) {
        if (!giftLine) giftLine = item;
        giftQuantity += item.quantity;
      }
    });

    var entitled = 0;
    if (triggerQuantity > 0) {
      entitled = rule.multiply ? triggerQuantity * rule.giftQuantity : rule.giftQuantity;
      // Never hand out more gifts than the discount will zero-price, or the
      // customer gets charged for the overflow.
      if (rule.maxQuantity && entitled > rule.maxQuantity) entitled = rule.maxQuantity;
    }

    if (entitled === 0) {
      // Trigger is gone — drop the gift and reset the session memory so the
      // offer works again if the customer re-adds the trigger.
      setFlag(ADDED_KEY, rule.id, null);
      setFlag(DISMISSED_KEY, rule.id, null);
      if (giftLine) return { type: 'change', key: giftLine.key, quantity: 0, rule: rule, token: token };
      return null;
    }

    if (!giftLine) {
      // Gift missing but we already placed it in this cart → the customer took
      // it out. Re-adding would fight them, so remember the choice instead.
      if (cfg.respectManualRemoval !== false && flagged(ADDED_KEY, rule.id, token)) {
        setFlag(ADDED_KEY, rule.id, null);
        setFlag(DISMISSED_KEY, rule.id, token);
        log('gift removed by customer, not re-adding:', rule.id);
        return null;
      }
      if (cfg.respectManualRemoval !== false && flagged(DISMISSED_KEY, rule.id, token)) return null;
      if (!rule.giftAvailable) {
        log('gift variant unavailable, skipping:', rule.giftHandle);
        return null;
      }
      return { type: 'add', rule: rule, quantity: entitled, token: token };
    }

    if (giftQuantity !== entitled && cfg.lockGiftQuantity !== false) {
      return { type: 'change', key: giftLine.key, quantity: entitled, rule: rule, token: token };
    }

    return null;
  }

  /* ── Applying ─────────────────────────────────────────────────────────── */

  function applyActions(actions) {
    var chain = Promise.resolve();

    actions
      .filter(function (action) { return action.type === 'change'; })
      .forEach(function (action) {
        chain = chain.then(function () {
          return postJSON(cfg.routes.change, { id: action.key, quantity: action.quantity })
            .then(function () {
              if (action.quantity === 0) setFlag(ADDED_KEY, action.rule.id, null);
            })
            .catch(function (error) {
              log('failed to update gift line', action.rule.id, error);
            });
        });
      });

    var adds = actions.filter(function (action) { return action.type === 'add'; });
    if (adds.length) {
      chain = chain.then(function () {
        var items = adds.map(function (action) {
          var properties = {};
          properties[GIFT_PROPERTY] = action.rule.id;
          return { id: action.rule.giftVariantId, quantity: action.quantity, properties: properties };
        });

        return postJSON(cfg.routes.add, { items: items })
          .then(function () {
            adds.forEach(function (action) { setFlag(ADDED_KEY, action.rule.id, action.token); });
            log('added gift(s)', items);
          })
          .catch(function (error) {
            // Out of stock, discount removed, etc. — leave the cart as the
            // customer built it rather than blocking their add-to-cart.
            log('failed to add gift', error);
          });
      });
    }

    return chain;
  }

  /* ── UI refresh ───────────────────────────────────────────────────────── */

  var CART_EVENTS = ['cart:updated', 'cart:refresh', 'cart:change', 'cartUpdated', 'ajaxCart:afterCartLoad'];

  function broadcast(cart) {
    CART_EVENTS.forEach(function (name) {
      var detail = { cart: cart, source: 'bb-free-gift' };
      try {
        document.dispatchEvent(new CustomEvent(name, { detail: detail, bubbles: true }));
        window.dispatchEvent(new CustomEvent(name, { detail: detail }));
        if (document.body) {
          document.body.dispatchEvent(new CustomEvent(name, { detail: detail, bubbles: true }));
        }
      } catch (e) {}
    });

    try {
      if (typeof window.publish === 'function' && window.PUB_SUB_EVENTS) {
        window.publish(window.PUB_SUB_EVENTS.cartUpdate, { source: 'bb-free-gift', cartData: cart });
      }
    } catch (e) {}
  }

  // Sections the theme itself re-renders after a cart change. KwikCart owns the
  // drawer, but the header/mobile bubbles and the /cart page are still ours.
  function themeSections() {
    var sections = [];

    function addStatic(id) {
      var element = document.getElementById(id);
      if (element) sections.push({ section: id, target: element, selector: '.shopify-section' });
    }

    addStatic('cart-icon-bubble');
    addStatic('mobile-cart-icon-bubble');
    addStatic('mini-cart');

    // The header mini-cart reuses #main-cart-items without a data-id, so match
    // on the attribute to be sure we get the /cart page's section.
    ['main-cart-items', 'main-cart-footer'].forEach(function (id) {
      var element = document.querySelector('#' + id + '[data-id]');
      if (element) sections.push({ section: element.dataset.id, target: element, selector: '.js-contents' });
    });

    return sections;
  }

  function refreshSections() {
    var sections = themeSections();
    if (!sections.length) return Promise.resolve();

    var names = sections
      .map(function (entry) { return entry.section; })
      .filter(function (name, index, all) { return all.indexOf(name) === index; });

    var url = (cfg.routes.root || '/') + '?sections=' + encodeURIComponent(names.join(','));

    return request(url)
      .then(function (rendered) {
        sections.forEach(function (entry) {
          var html = rendered[entry.section];
          if (!html || !entry.target.isConnected) return;
          try {
            var parsed = new DOMParser().parseFromString(html, 'text/html').querySelector(entry.selector);
            if (parsed) entry.target.innerHTML = parsed.innerHTML;
          } catch (e) {
            log('section render failed', entry.section, e);
          }
        });
      })
      .catch(function (error) {
        log('section refresh failed', error);
      });
  }

  // The request that triggered us only resolves *after* we finish, and its
  // caller then paints section HTML that Shopify rendered before the gift
  // existed. Repaint once those late writes have landed.
  var lateTimers = [];

  function lateRefresh(cart) {
    lateTimers.forEach(clearTimeout);
    lateTimers = [400, 1200].map(function (delay) {
      return setTimeout(function () {
        broadcast(cart);
        refreshSections();
      }, delay);
    });
  }

  /* ── Reconcile loop ───────────────────────────────────────────────────── */

  var queue = Promise.resolve();
  var running = false;

  function reconcile() {
    if (running) return Promise.resolve();
    running = true;

    return getCart()
      .then(function (cart) {
        var actions = rules
          .map(function (rule) { return planFor(rule, cart); })
          .filter(Boolean);

        if (!actions.length) return null;

        log('applying', actions);
        return applyActions(actions)
          .then(getCart)
          .then(function (updated) {
            broadcast(updated);
            lateRefresh(updated);
            return refreshSections();
          });
      })
      .catch(function (error) {
        log('reconcile failed', error);
      })
      .then(function () {
        running = false;
      });
  }

  // Serialised so overlapping cart mutations can't race each other into
  // duplicate gift lines.
  function schedule() {
    queue = queue.then(reconcile, reconcile);
    return queue;
  }

  NS.handler = schedule;
  NS.reconcile = schedule;

  if (NS.pending) {
    NS.pending = false;
    schedule();
  }

  // KwikCart and other apps can change the cart without a /cart/* request the
  // interceptor can see, but they all announce it. Our own broadcasts carry a
  // source tag so they don't feed back into the loop, and the debounce keeps a
  // chatty app from turning every render into a /cart.js round trip.
  var eventTimer = null;

  CART_EVENTS.forEach(function (name) {
    document.addEventListener(name, function (event) {
      if (event && event.detail && event.detail.source === 'bb-free-gift') return;
      clearTimeout(eventTimer);
      eventTimer = setTimeout(schedule, 150);
    });
  });

  // Catches carts that already contain the trigger — restored sessions, a
  // /cart page load, or a checkout bounce-back.
  function boot() {
    schedule();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  window.addEventListener('pageshow', function (event) {
    if (event.persisted) schedule();
  });
})();
