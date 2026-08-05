/* ------------------------------------------------------------------------------------
   Beyond Beyond skincare assistant.

   Three things live here:
     1. A motion layer over GSAP that degrades to instant state changes if GSAP is absent.
     2. The routine tray -- a live view of the real Shopify cart, so adding, removing and
        checking out all happen inside the conversation.
     3. Inline autocomplete: a ghost completion behind the caret plus a keyboard-navigable
        suggestion list, both fed by a local corpus so they respond without a round trip.

   Model output is only ever written with textContent. It is never trusted as markup.
   ------------------------------------------------------------------------------------ */

(function () {
  "use strict";

  var CHAT_API_URL = "https://designdimensions.in/bb_chat_assisstant/chat.php";
  var STORAGE_KEY = "bb_chat_history_v1";

  var STARTERS = [
    "Help me build a routine",
    "Best product for oily skin?",
    "Which sunscreen should I pick?",
    "What is NAD+?",
  ];

  /* Autocomplete corpus. Intents first, then the catalogue, so a visitor who starts typing a
     product name gets it. Anything the visitor has asked before is appended at runtime. */
  var INTENTS = [
    "Help me build a morning routine",
    "Help me build an evening routine",
    "Build a routine for oily skin",
    "Build a routine for dry skin",
    "Build a routine for sensitive skin",
    "Build a routine for combination skin",
    "What should I use every morning?",
    "What should I use at night?",
    "What order should I apply these in?",
    "Which sunscreen should I pick?",
    "What is NAD+ and why does it matter?",
    "What helps with dark spots?",
    "What helps with dull skin?",
    "What helps with fine lines?",
    "What helps with large pores?",
    "What helps with acne and breakouts?",
    "How do I layer serums?",
    "How long until I see results?",
    "Is this safe for sensitive skin?",
    "Can I use this while pregnant?",
    "Which products have niacinamide?",
    "Which products have hyaluronic acid?",
    "Show me your bestsellers",
    "What's a good starter set?",
    "What's in the Travel Edit?",
    "What's the difference between the minis and the full sizes?",
  ];

  var CATALOGUE = [
    "Advanced Cellular Repair Serum",
    "Advanced Cellular Hydration Serum",
    "Advanced Complexion Corrector Serum",
    "Advanced Antioxidant Defense Serum",
    "The Ultimate Night Repair Super Cream",
    "Hydro-Active Day Cream",
    "Deep Clean Enzyme Cleanser",
    "Dirt & Makeup Cleanser Jelly",
    "Oil-Free Matte Sunscreen",
    "Broad Spectrum Active Sunspray",
    "Ultra Hydrating Oligo HA Mist",
    "Moisture Surge Lip Butter",
    "The Morning Edit",
    "The Evening Edit",
    "The Travel Edit",
  ];

  var ICON = {
    plus: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M5 12h13M12 5l7 7-7 7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  // ----------------------------------------------------------------- utilities

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function norm(value) {
    return String(value).toLowerCase().replace(/\s+/g, " ").trim();
  }

  /* Shopify's CDN resizes on the width param; anything else is passed through untouched. */
  function sized(url, width) {
    if (!url) return "";
    try {
      var parsed = new URL(url, window.location.origin);
      parsed.searchParams.set("width", String(width));
      return parsed.toString();
    } catch (err) {
      return url;
    }
  }

  /* The chat API quotes rupees; /cart.js quotes paise. Keeping two formatters stops the two
     scales being mixed up at a call site. */
  function rupees(value) {
    var amount = parseFloat(value);
    if (!isFinite(amount)) return "";
    return "₹" + amount.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  }

  function cartMoney(paise) {
    return rupees((Number(paise) || 0) / 100);
  }

  function loadHistory() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      return [];
    }
  }

  function saveHistory(history) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (err) {
      /* storage unavailable -- the conversation still works, it just will not persist */
    }
  }

  // -------------------------------------------------------------- motion layer

  /* Every animation in the widget goes through here. If GSAP did not load, each method
     applies the end state directly, so behaviour is identical and only the polish is lost. */
  function createMotion() {
    var g = window.gsap || null;
    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var scale = reduced ? 0 : 1;
    var EASE_OUT = "power3.out";
    var EASE_SPRING = "back.out(1.7)";

    function d(seconds) {
      return seconds * scale;
    }

    return {
      enabled: !!g,

      /* One orchestrated moment: the panel scales up out of the launcher corner and its
         regions follow a beat behind, rather than every element animating independently. */
      openPanel: function (panel, regions) {
        panel.style.visibility = "visible";
        panel.style.pointerEvents = "auto";
        if (!g) {
          panel.classList.add("bb-open");
          return;
        }
        g.killTweensOf(panel);
        g.fromTo(
          panel,
          { autoAlpha: 0, y: 14, scale: 0.97 },
          { autoAlpha: 1, y: 0, scale: 1, duration: d(0.42), ease: EASE_OUT }
        );
        g.fromTo(
          regions,
          { autoAlpha: 0, y: 10 },
          { autoAlpha: 1, y: 0, duration: d(0.36), ease: EASE_OUT, stagger: d(0.05), delay: d(0.08) }
        );
      },

      closePanel: function (panel, done) {
        if (!g) {
          panel.classList.remove("bb-open");
          panel.style.visibility = "";
          panel.style.pointerEvents = "";
          if (done) done();
          return;
        }
        g.killTweensOf(panel);
        g.to(panel, {
          autoAlpha: 0,
          y: 10,
          scale: 0.98,
          duration: d(0.22),
          ease: "power2.in",
          onComplete: function () {
            panel.style.visibility = "hidden";
            panel.style.pointerEvents = "none";
            if (done) done();
          },
        });
      },

      launcher: function (node, show) {
        if (!g) {
          node.style.opacity = show ? "1" : "0";
          node.style.pointerEvents = show ? "auto" : "none";
          return;
        }
        g.killTweensOf(node);
        g.to(node, {
          autoAlpha: show ? 1 : 0,
          scale: show ? 1 : 0.6,
          duration: d(show ? 0.32 : 0.2),
          ease: show ? EASE_SPRING : "power2.in",
          pointerEvents: show ? "auto" : "none",
        });
      },

      enter: function (node) {
        if (!g) return;
        g.from(node, { autoAlpha: 0, y: 8, duration: d(0.34), ease: EASE_OUT });
      },

      stagger: function (nodes) {
        if (!g || !nodes.length) return;
        g.from(nodes, { autoAlpha: 0, y: 10, duration: d(0.36), ease: EASE_OUT, stagger: d(0.06) });
      },

      /* A short scale pulse. Used when a number changes but nothing moves, so the change is
         still noticed. */
      bump: function (node) {
        if (!g || !node) return;
        g.fromTo(node, { scale: 1 }, { scale: 1.16, duration: d(0.14), ease: "power2.out", yoyo: true, repeat: 1 });
      },

      /* Animates a collapsed element to its natural height and back. */
      height: function (node, open, done) {
        var target = open ? node.scrollHeight : 0;
        if (!g) {
          node.style.height = open ? "auto" : "0px";
          if (done) done();
          return;
        }
        g.killTweensOf(node);
        g.to(node, {
          height: target,
          duration: d(0.34),
          ease: EASE_OUT,
          onComplete: function () {
            if (open) node.style.height = "auto";
            if (done) done();
          },
        });
      },

      /* clearProps matters: without it GSAP leaves the measured height inline and the tray
         can never grow again as items are added. */
      reveal: function (node, done) {
        if (!g) {
          if (done) done();
          return;
        }
        g.from(node, {
          height: 0,
          autoAlpha: 0,
          duration: d(0.4),
          ease: EASE_OUT,
          clearProps: "height",
          onComplete: done,
        });
      },

      /* The add-to-routine flight. Separating the eases on the two axes bends the path into
         an arc without needing MotionPath. */
      fly: function (from, to, src, done) {
        if (!g || reduced || !src) {
          if (done) done();
          return;
        }
        var clone = document.createElement("img");
        clone.className = "bb-flyer";
        clone.src = src;
        clone.alt = "";
        clone.style.left = from.left + "px";
        clone.style.top = from.top + "px";
        clone.style.width = from.width + "px";
        clone.style.height = from.height + "px";
        document.body.appendChild(clone);

        var timeline = g.timeline({
          onComplete: function () {
            clone.remove();
            if (done) done();
          },
        });
        timeline.to(clone, { x: to.left - from.left, duration: d(0.62), ease: "power1.inOut" }, 0);
        timeline.to(clone, { y: to.top - from.top, duration: d(0.62), ease: "power2.in" }, 0);
        timeline.to(
          clone,
          { width: to.width, height: to.height, duration: d(0.62), ease: "power2.in" },
          0
        );
      },

      landThumb: function (node) {
        if (!g || !node) {
          if (node) node.style.opacity = "1";
          return;
        }
        g.fromTo(node, { autoAlpha: 0, scale: 0.4 }, { autoAlpha: 1, scale: 1, duration: d(0.3), ease: EASE_SPRING });
      },

      dropdown: function (node, items) {
        if (!g) return;
        g.killTweensOf(node);
        g.fromTo(node, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: d(0.2), ease: EASE_OUT });
        if (items.length) {
          g.fromTo(items, { autoAlpha: 0, y: 4 }, { autoAlpha: 1, y: 0, duration: d(0.18), ease: EASE_OUT, stagger: d(0.03) });
        }
      },

      ghost: function (node, show) {
        if (!g) {
          node.style.opacity = show ? "1" : "0";
          return;
        }
        g.killTweensOf(node);
        g.to(node, { opacity: show ? 1 : 0, duration: d(0.18), ease: "power2.out" });
      },
    };
  }

  // ------------------------------------------------------------------- widget

  function init() {
    var root = document.querySelector("[data-bb-root]");
    var launcher = document.getElementById("bb-launcher");
    var panel = document.getElementById("bb-panel");
    if (!root || !launcher || !panel) return;

    var closeBtn = document.getElementById("bb-close");
    var resetBtn = document.getElementById("bb-reset");
    var body = document.getElementById("bb-body");
    var welcome = document.getElementById("bb-welcome");
    var chipsWrap = document.getElementById("bb-chips");
    var composer = panel.querySelector(".bb-composer");
    var header = panel.querySelector(".bb-header");
    var input = document.getElementById("bb-input");
    var sendBtn = document.getElementById("bb-send");
    var pip = root.querySelector("[data-bb-pip]");

    var tray = document.getElementById("bb-tray");
    var trayToggle = document.getElementById("bb-tray-toggle");
    var trayDrawer = document.getElementById("bb-tray-drawer");
    var trayStack = tray.querySelector("[data-bb-tray-stack]");
    var trayCount = tray.querySelector("[data-bb-tray-count]");
    var trayTotals = tray.querySelectorAll("[data-bb-tray-total]");
    var trayList = tray.querySelector("[data-bb-tray-list]");

    var suggestBox = document.getElementById("bb-suggest");
    var hint = panel.querySelector("[data-bb-hint]");
    var ghostTyped = panel.querySelector("[data-bb-ghost-typed]");
    var ghostRest = panel.querySelector("[data-bb-ghost-rest]");

    var motion = createMotion();
    if (motion.enabled) root.classList.add("bb-anim");

    var history = loadHistory();
    var sending = false;
    var isOpen = false;
    var trayOpen = false;
    var cart = null;
    var selfSync = false;

    // ------------------------------------------------------------- routine tray

    function cartUrl(path) {
      var root = (window.Shopify && window.Shopify.routes && window.Shopify.routes.root) || "/";
      return root.replace(/\/$/, "") + path;
    }

    function fetchCart() {
      return fetch(cartUrl("/cart.js"), {
        headers: { Accept: "application/json" },
        credentials: "same-origin",
      }).then(function (res) {
        if (!res.ok) throw new Error("cart_fetch_failed");
        return res.json();
      });
    }

    function setPip(count) {
      if (!pip) return;
      if (count > 0) {
        pip.textContent = String(count);
        pip.hidden = false;
      } else {
        pip.hidden = true;
      }
    }

    /* Renders the tray from the real cart. `newVariantId` marks the item that has just been
       added so its thumbnail can be held back for the flight to land on.

       Returns { landing, wasHidden } -- the caller needs wasHidden because the reveal
       animates the tray's height, and anything measuring the stack has to wait for it. */
    function renderTray(data, newVariantId) {
      cart = data;
      var items = (data && data.items) || [];
      setPip(data ? data.item_count : 0);

      if (!items.length) {
        if (trayOpen) toggleTray(false);
        tray.hidden = true;
        return { landing: null, wasHidden: true };
      }

      var wasHidden = tray.hidden;
      tray.hidden = false;

      trayStack.replaceChildren();
      var landing = null;
      items.slice(0, 4).forEach(function (item) {
        var thumb = document.createElement("img");
        thumb.className = "bb-tray__thumb";
        thumb.src = sized(item.image, 84);
        thumb.alt = "";
        if (newVariantId && item.id === newVariantId) {
          thumb.style.opacity = "0";
          landing = thumb;
        }
        trayStack.appendChild(thumb);
      });
      if (items.length > 4) {
        trayStack.appendChild(el("span", "bb-tray__more", "+" + (items.length - 4)));
      }

      trayCount.textContent = data.item_count === 1 ? "1 item" : data.item_count + " items";
      trayTotals.forEach(function (node) {
        node.textContent = cartMoney(data.total_price);
      });

      trayList.replaceChildren();
      items.forEach(function (item) {
        var row = el("li", "bb-tray__item");

        var media = document.createElement("img");
        media.className = "bb-tray__item-media";
        media.src = sized(item.image, 108);
        media.alt = "";
        row.appendChild(media);

        var info = el("div", "bb-tray__item-info");
        info.appendChild(el("div", "bb-tray__item-title", item.product_title || item.title));
        var meta = item.quantity > 1 ? item.quantity + " × " : "";
        info.appendChild(el("div", "bb-tray__item-price", meta + cartMoney(item.final_line_price)));
        row.appendChild(info);

        var remove = el("button", "bb-tray__remove");
        remove.type = "button";
        remove.innerHTML = ICON.close;
        remove.setAttribute("aria-label", "Remove " + (item.product_title || item.title) + " from your routine");
        remove.addEventListener("click", function () {
          remove.disabled = true;
          changeLine(item.key, 0);
        });
        row.appendChild(remove);

        trayList.appendChild(row);
      });

      if (trayOpen) trayDrawer.style.height = "auto";

      return { landing: landing, wasHidden: wasHidden };
    }

    function toggleTray(open) {
      trayOpen = open;
      tray.classList.toggle("is-open", open);
      trayToggle.setAttribute("aria-expanded", String(open));
      motion.height(trayDrawer, open);
    }

    function syncTheme() {
      // Lets the header count and the mini cart pick up what the chat just changed.
      document.dispatchEvent(new CustomEvent("cart:refresh"));
    }

    function changeLine(key, quantity) {
      return fetch("/cart/change.js", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id: key, quantity: quantity }),
      })
        .then(function (res) {
          if (!res.ok) throw new Error("cart_change_failed");
          return res.json();
        })
        .then(function (data) {
          renderTray(data);
          if (trayOpen) motion.height(trayDrawer, true);
          syncTheme();
        })
        .catch(function () {
          return fetchCart().then(renderTray);
        });
    }

    function addVariant(variantId) {
      return fetch("/cart/add.js", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ items: [{ id: variantId, quantity: 1 }] }),
      }).then(function (res) {
        if (!res.ok) throw new Error("add_to_cart_failed");
        return res.json();
      });
    }

    // ------------------------------------------------------------ product cards

    function buildProductCard(product) {
      var card = el("div", "bb-product");

      var media = el("div", "bb-product__media");
      var img = document.createElement("img");
      img.src = sized(product.image, 156);
      img.alt = "";
      img.loading = "lazy";
      media.appendChild(img);
      card.appendChild(media);

      var info = el("div", "bb-product__info");

      var title = el("a", "bb-product__title", product.title);
      title.href = product.url;
      title.target = "_blank";
      title.rel = "noopener";
      info.appendChild(title);

      if (product.tagline) info.appendChild(el("div", "bb-product__tagline", product.tagline));

      var price = el("div", "bb-product__price");
      var wasHigher =
        product.compare_at_price_inr &&
        parseFloat(product.compare_at_price_inr) > parseFloat(product.price_inr);
      if (wasHigher) {
        price.appendChild(el("span", "bb-product__was", rupees(product.compare_at_price_inr)));
      }
      price.appendChild(document.createTextNode(rupees(product.price_inr)));
      info.appendChild(price);

      card.appendChild(info);

      if (product.variant_id) {
        var add = el("button", "bb-product__add");
        add.type = "button";
        add.innerHTML = ICON.plus;
        add.setAttribute("aria-label", "Add " + product.title + " to your routine");
        add.addEventListener("click", function () {
          add.disabled = true;
          addToRoutine(product, img, add, card);
        });
        card.appendChild(add);
      }

      return card;
    }

    /* Add, then fly the product's own image into the tray stack. The thumbnail it lands on is
       rendered first but held invisible, so the clone hands off to a real element rather than
       fading out over an empty slot. */
    function addToRoutine(product, sourceImg, button, card) {
      addVariant(product.variant_id)
        .then(fetchCart)
        .then(function (data) {
          var from = sourceImg.getBoundingClientRect();
          var landing = renderTray(data, product.variant_id);
          syncTheme();

          button.innerHTML = ICON.check;
          button.classList.add("is-added");
          button.setAttribute("aria-label", product.title + " is in your routine");

          if (!landing) {
            motion.bump(trayCount);
            trayTotals.forEach(motion.bump);
            return;
          }

          var to = landing.getBoundingClientRect();
          motion.fly(from, to, sourceImg.src, function () {
            motion.landThumb(landing);
            motion.bump(trayCount);
            trayTotals.forEach(motion.bump);
          });
        })
        .catch(function () {
          button.disabled = false;
          var existing = card.querySelector(".bb-product__error");
          if (existing) return;
          var error = el("div", "bb-product__error", "Couldn't add that — try again.");
          card.appendChild(error);
          setTimeout(function () {
            error.remove();
          }, 4000);
        });
    }

    // ---------------------------------------------------------------- messaging

    function scrollToEnd() {
      body.scrollTop = body.scrollHeight;
    }

    function addBubble(role, text) {
      var bubble = el("div", role === "user" ? "bb-msg bb-msg-user" : "bb-msg bb-msg-bot", text);
      body.appendChild(bubble);
      motion.enter(bubble);
      return bubble;
    }

    function showTyping() {
      var node = el("div", "bb-typing");
      node.id = "bb-typing";
      node.appendChild(el("span"));
      node.appendChild(el("span"));
      node.appendChild(el("span"));
      body.appendChild(node);
      motion.enter(node);
      if (window.gsap) {
        window.gsap.to(node.children, {
          opacity: 1,
          duration: 0.4,
          stagger: { each: 0.14, repeat: -1, yoyo: true },
        });
      }
      scrollToEnd();
    }

    function hideTyping() {
      var node = document.getElementById("bb-typing");
      if (!node) return;
      if (window.gsap) window.gsap.killTweensOf(node.children);
      node.remove();
    }

    function renderChips(questions) {
      chipsWrap.replaceChildren();
      var chips = [];
      (questions || []).forEach(function (question) {
        var chip = el("button", "bb-chip", question);
        chip.type = "button";
        chip.addEventListener("click", function () {
          send(question);
        });
        chipsWrap.appendChild(chip);
        chips.push(chip);
      });
      motion.stagger(chips);
    }

    function send(text) {
      text = (text || input.value).trim();
      if (!text || sending) return;

      closeSuggest();
      clearGhost();
      if (welcome) welcome.hidden = true;
      chipsWrap.replaceChildren();
      input.value = "";
      sending = true;
      sendBtn.disabled = true;

      addBubble("user", text);
      history.push({ role: "user", content: text });
      saveHistory(history);
      scrollToEnd();
      showTyping();

      fetch(CHAT_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      })
        .then(function (res) {
          return res.json();
        })
        .then(function (data) {
          hideTyping();
          var reply = data.reply || "Sorry, I didn't catch that — could you rephrase?";
          addBubble("bot", reply);
          history.push({ role: "assistant", content: reply });
          saveHistory(history);

          var products = data.products || [];
          if (products.length) {
            var wrap = el("div", "bb-products");
            var cards = products.map(function (product) {
              var card = buildProductCard(product);
              wrap.appendChild(card);
              return card;
            });
            body.appendChild(wrap);
            motion.stagger(cards);
          }

          renderChips(data.suggested_questions);
          scrollToEnd();
        })
        .catch(function () {
          hideTyping();
          addBubble("bot", "I couldn't reach the studio just now. Try again in a moment, or email care@beyondbeyond.co.in.");
          scrollToEnd();
        })
        .finally(function () {
          sending = false;
          sendBtn.disabled = false;
        });
    }

    function restoreHistory() {
      if (!history.length) return;
      if (welcome) welcome.hidden = true;
      history.forEach(function (message) {
        if (message.role === "user" || message.role === "assistant") {
          var bubble = el(
            "div",
            message.role === "user" ? "bb-msg bb-msg-user" : "bb-msg bb-msg-bot",
            message.content
          );
          body.appendChild(bubble);
        }
      });
      scrollToEnd();
    }

    function resetConversation() {
      history = [];
      saveHistory(history);
      body.replaceChildren();
      if (welcome) {
        welcome.hidden = false;
        body.appendChild(welcome);
        motion.enter(welcome);
      }
      renderChips(STARTERS);
      input.focus();
    }

    // ------------------------------------------------------------- autocomplete

    var activeIndex = -1;
    var matches = [];
    var ghostPhrase = "";

    function corpus() {
      var asked = history
        .filter(function (message) {
          return message.role === "user";
        })
        .map(function (message) {
          return message.content;
        });
      return INTENTS.concat(
        CATALOGUE.map(function (title) {
          return "Tell me about the " + title;
        }),
        asked
      );
    }

    function findMatches(query) {
      var needle = norm(query);
      if (needle.length < 2) return [];

      var prefix = [];
      var inside = [];
      var seen = {};

      corpus().forEach(function (phrase) {
        var key = norm(phrase);
        if (seen[key] || key === needle) return;
        seen[key] = true;
        if (key.indexOf(needle) === 0) prefix.push(phrase);
        else if (key.indexOf(" " + needle) > -1) inside.push(phrase);
      });

      return prefix.concat(inside).slice(0, 4);
    }

    function clearGhost() {
      ghostPhrase = "";
      ghostTyped.textContent = "";
      ghostRest.textContent = "";
      motion.ghost(ghostRest, false);
      if (hint) hint.hidden = true;
    }

    /* Only offered when the top match continues what has been typed and the text still fits
       the field -- once the input scrolls, the ghost can no longer line up with the caret. */
    function updateGhost(value) {
      var best = matches[0];
      if (!value || !best || norm(best).indexOf(norm(value)) !== 0 || best.length <= value.length) {
        clearGhost();
        return;
      }
      if (input.scrollWidth > input.clientWidth) {
        clearGhost();
        return;
      }
      ghostPhrase = value + best.slice(value.length);
      ghostTyped.textContent = value;
      ghostRest.textContent = best.slice(value.length);
      motion.ghost(ghostRest, true);
      if (hint) hint.hidden = false;
    }

    function closeSuggest() {
      suggestBox.hidden = true;
      suggestBox.replaceChildren();
      input.setAttribute("aria-expanded", "false");
      activeIndex = -1;
      matches = [];
    }

    function highlight(node, phrase, query) {
      var text = el("span", "bb-suggest__text");
      var at = norm(phrase).indexOf(norm(query));
      if (at === 0) {
        text.appendChild(el("strong", "bb-suggest__match", phrase.slice(0, query.length)));
        text.appendChild(document.createTextNode(phrase.slice(query.length)));
      } else {
        text.textContent = phrase;
      }
      node.appendChild(text);
    }

    function renderSuggest(query) {
      if (!matches.length) {
        closeSuggest();
        return;
      }
      suggestBox.replaceChildren();
      var items = matches.map(function (phrase, index) {
        var item = el("button", "bb-suggest__item");
        item.type = "button";
        item.setAttribute("role", "option");
        item.setAttribute("aria-selected", "false");
        item.innerHTML = ICON.arrow;
        highlight(item, phrase, query);
        item.addEventListener("click", function () {
          send(phrase);
        });
        item.addEventListener("mouseenter", function () {
          setActive(index);
        });
        suggestBox.appendChild(item);
        return item;
      });
      suggestBox.hidden = false;
      input.setAttribute("aria-expanded", "true");
      activeIndex = -1;
      motion.dropdown(suggestBox, items);
    }

    function setActive(index) {
      var items = suggestBox.querySelectorAll(".bb-suggest__item");
      items.forEach(function (item, i) {
        var on = i === index;
        item.classList.toggle("is-active", on);
        item.setAttribute("aria-selected", String(on));
      });
      activeIndex = index;
    }

    function acceptGhost() {
      if (!ghostPhrase) return false;
      input.value = ghostPhrase;
      clearGhost();
      closeSuggest();
      input.setSelectionRange(input.value.length, input.value.length);
      return true;
    }

    input.addEventListener("input", function () {
      var value = input.value;
      matches = findMatches(value);
      renderSuggest(value);
      updateGhost(value);
    });

    input.addEventListener("keydown", function (event) {
      var items = suggestBox.querySelectorAll(".bb-suggest__item");

      if (event.key === "Tab" && ghostPhrase) {
        event.preventDefault();
        acceptGhost();
        return;
      }

      // Only completes when the caret is at the very end, so it stays a real cursor key.
      if (event.key === "ArrowRight" && ghostPhrase && input.selectionStart === input.value.length) {
        event.preventDefault();
        acceptGhost();
        return;
      }

      if (event.key === "ArrowDown" && items.length) {
        event.preventDefault();
        setActive((activeIndex + 1) % items.length);
        return;
      }

      if (event.key === "ArrowUp" && items.length) {
        event.preventDefault();
        setActive(activeIndex <= 0 ? items.length - 1 : activeIndex - 1);
        return;
      }

      if (event.key === "Escape") {
        clearGhost();
        closeSuggest();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        if (activeIndex > -1 && matches[activeIndex]) {
          send(matches[activeIndex]);
          return;
        }
        send();
      }
    });

    input.addEventListener("blur", function () {
      // Deferred so a click on a suggestion still lands before the list is torn down.
      setTimeout(function () {
        clearGhost();
        closeSuggest();
      }, 120);
    });

    // -------------------------------------------------------------- open/close

    function openPanel() {
      if (isOpen) return;
      isOpen = true;
      panel.setAttribute("aria-hidden", "false");
      launcher.setAttribute("aria-expanded", "true");
      motion.launcher(launcher, false);
      motion.openPanel(panel, [header, body, composer]);
      fetchCart().then(renderTray).catch(function () {});
      // Focusing on touch pops the keyboard over the conversation before it can be read.
      if (window.matchMedia("(pointer: fine)").matches) input.focus();
    }

    function closePanel() {
      if (!isOpen) return;
      isOpen = false;
      panel.setAttribute("aria-hidden", "true");
      launcher.setAttribute("aria-expanded", "false");
      clearGhost();
      closeSuggest();
      motion.closePanel(panel);
      motion.launcher(launcher, true);
      launcher.focus();
    }

    launcher.addEventListener("click", openPanel);
    closeBtn.addEventListener("click", closePanel);
    resetBtn.addEventListener("click", resetConversation);
    sendBtn.addEventListener("click", function () {
      send();
    });
    trayToggle.addEventListener("click", function () {
      toggleTray(!trayOpen);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && isOpen) closePanel();
    });

    // Another surface changed the cart -- keep the tray honest.
    document.addEventListener("cart:refresh", function () {
      if (!isOpen) return;
      fetchCart().then(renderTray).catch(function () {});
    });

    renderChips(STARTERS);
    restoreHistory();
    fetchCart().then(renderTray).catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
