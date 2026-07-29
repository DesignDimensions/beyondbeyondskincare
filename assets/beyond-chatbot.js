(function () {
  "use strict";

  // TODO: replace with your live BigRock URL once chat.php is deployed, e.g.
  // "https://yourdomain.com/beyondbeyond-chat/chat.php"
  var CHAT_API_URL = "https://YOUR-BIGROCK-DOMAIN.example.com/beyondbeyond-chat/chat.php";

  var STARTER_QUESTIONS = [
    "What should I use every morning?",
    "Best product for oily skin?",
    "Which sunscreen should I pick?",
    "Help me build a routine",
  ];

  var STORAGE_KEY = "bb_chat_history_v1";

  var COMMA_ICON =
    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M9 4c-2.8 0-5 2.2-5 5 0 2.5 1.8 4.5 4.1 4.9-.4 2.7-2.1 4.6-4.1 5.6l.8 1.5c3.4-1.5 6.2-4.6 6.2-9.5V9c0-2.8-2.2-5-5-5z" fill="currentColor"/>' +
    '<circle cx="17" cy="8" r="4" fill="currentColor"/>' +
    "</svg>";

  var SEND_ICON =
    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M4 12l16-7-6 7 6 7-16-7z" fill="currentColor"/>' +
    "</svg>";

  var CLOSE_ICON =
    '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20">' +
    '<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>' +
    "</svg>";

  function el(tag, className, html) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function loadHistory() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function saveHistory(history) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history));
    } catch (e) {
      /* storage unavailable — non-fatal */
    }
  }

  function formatPrice(inr) {
    if (!inr) return "";
    var n = parseFloat(inr);
    return "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  }

  function init() {
    var launcher = document.getElementById("bb-chat-launcher");
    var panel = document.getElementById("bb-chat-panel");
    var closeBtn = document.getElementById("bb-chat-close");
    var body = document.getElementById("bb-chat-body");
    var chipsWrap = document.getElementById("bb-chat-chips");
    var input = document.getElementById("bb-chat-input");
    var sendBtn = document.getElementById("bb-chat-send");
    var intro = document.getElementById("bb-chat-intro");

    if (!launcher || !panel) return;

    var history = loadHistory();
    var sending = false;

    function renderProducts(products) {
      if (!products || !products.length) return null;
      var wrap = el("div", "bb-products");
      products.forEach(function (p) {
        var card = el("a", "bb-product-card");
        card.href = p.url;
        card.target = "_blank";
        card.rel = "noopener";

        var img = document.createElement("img");
        img.src = p.image || "";
        img.alt = p.title;
        img.loading = "lazy";
        card.appendChild(img);

        var info = el("div", "bb-product-info");
        var priceHtml = "";
        if (p.compare_at_price_inr && parseFloat(p.compare_at_price_inr) > parseFloat(p.price_inr)) {
          priceHtml =
            '<span class="bb-strike">' + formatPrice(p.compare_at_price_inr) + "</span>" +
            formatPrice(p.price_inr);
        } else {
          priceHtml = formatPrice(p.price_inr);
        }
        info.appendChild(el("div", "bb-product-title", p.title));
        info.appendChild(el("div", "bb-product-price", priceHtml));
        card.appendChild(info);
        card.appendChild(el("div", "bb-product-arrow", "&#8594;"));
        wrap.appendChild(card);
      });
      return wrap;
    }

    function renderChips(questions) {
      chipsWrap.innerHTML = "";
      (questions || []).forEach(function (q) {
        var chip = el("button", "bb-chip", q);
        chip.type = "button";
        chip.addEventListener("click", function () {
          sendMessage(q);
        });
        chipsWrap.appendChild(chip);
      });
    }

    function addBubble(role, text) {
      var bubble = el("div", role === "user" ? "bb-msg bb-msg-user" : "bb-msg bb-msg-bot", "");
      bubble.textContent = text;
      body.appendChild(bubble);
      return bubble;
    }

    function showTyping() {
      var t = el("div", "bb-typing", COMMA_ICON + COMMA_ICON);
      t.id = "bb-typing-indicator";
      body.appendChild(t);
      body.scrollTop = body.scrollHeight;
    }

    function hideTyping() {
      var t = document.getElementById("bb-typing-indicator");
      if (t) t.remove();
    }

    function renderHistoryFromStorage() {
      if (!history.length) return;
      if (intro) intro.style.display = "none";
      history.forEach(function (m) {
        if (m.role === "user" || m.role === "assistant") {
          addBubble(m.role === "user" ? "user" : "bot", m.content);
        }
      });
      body.scrollTop = body.scrollHeight;
    }

    function sendMessage(text) {
      text = (text || input.value).trim();
      if (!text || sending) return;

      if (intro) intro.style.display = "none";
      chipsWrap.innerHTML = "";
      input.value = "";
      sending = true;
      sendBtn.disabled = true;

      addBubble("user", text);
      history.push({ role: "user", content: text });
      saveHistory(history);
      body.scrollTop = body.scrollHeight;
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

          var productsEl = renderProducts(data.products);
          if (productsEl) body.appendChild(productsEl);

          renderChips(data.suggested_questions);
          body.scrollTop = body.scrollHeight;
        })
        .catch(function () {
          hideTyping();
          addBubble(
            "bot",
            "Sorry, I couldn't connect just now. Please try again, or email care@beyondbeyond.co.in."
          );
        })
        .finally(function () {
          sending = false;
          sendBtn.disabled = false;
        });
    }

    launcher.addEventListener("click", function () {
      panel.classList.add("bb-open");
      launcher.classList.add("bb-hidden");
      input.focus();
    });
    closeBtn.addEventListener("click", function () {
      panel.classList.remove("bb-open");
      launcher.classList.remove("bb-hidden");
    });
    sendBtn.addEventListener("click", function () {
      sendMessage();
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") sendMessage();
    });

    renderChips(STARTER_QUESTIONS);
    renderHistoryFromStorage();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
