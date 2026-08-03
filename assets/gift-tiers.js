class GiftTierProgress extends HTMLElement {
  constructor() {
    super();

    this.miniCart = document.querySelector('mini-cart');

    const tiers = [1, 2, 3]
      .map((tier) => this.getTierConfig(tier))
      .filter((tier) => tier !== null);

    const toRemove = {};
    const toAdd = [];

    tiers.forEach((tier) => {
      if (tier.qualifies && !tier.present) {
        toAdd.push({
          id: tier.variantId,
          quantity: 1,
          properties: { _gift_tier: String(tier.tier) }
        });
      }
      else if (!tier.qualifies && tier.present && tier.key) {
        toRemove[tier.key] = 0;
      }
    });

    if (toAdd.length === 0 && Object.keys(toRemove).length === 0) return;

    this.syncTiers(toRemove, toAdd);
  }

  getTierConfig(tier) {
    const variantId = this.getAttribute(`data-tier-${tier}-variant-id`);
    if (!variantId) return null;

    return {
      tier,
      variantId,
      key: this.getAttribute(`data-tier-${tier}-key`),
      qualifies: this.getAttribute(`data-tier-${tier}-qualifies`) === 'true',
      present: this.getAttribute(`data-tier-${tier}-present`) === 'true'
    };
  }

  getSectionsToRender() {
    return [
      { id: 'mini-cart', section: 'mini-cart', selector: '.shopify-section' },
      { id: 'cart-icon-bubble', section: 'cart-icon-bubble', selector: '.shopify-section' },
      { id: 'mobile-cart-icon-bubble', section: 'mobile-cart-icon-bubble', selector: '.shopify-section' },
      { id: 'cart-live-region-text', section: 'cart-live-region-text', selector: '.shopify-section' }
    ];
  }

  async syncTiers(toRemove, toAdd) {
    const sections = this.getSectionsToRender().map((section) => section.section);
    let lastResponse = null;

    try {
      if (Object.keys(toRemove).length > 0) {
        const response = await fetch(theme.routes.cart_update_url, {
          ...fetchConfig(),
          body: JSON.stringify({
            updates: toRemove,
            sections: sections,
            sections_url: window.location.pathname
          })
        });
        lastResponse = await response.json();
      }

      if (toAdd.length > 0) {
        const response = await fetch(theme.routes.cart_add_url, {
          ...fetchConfig('javascript'),
          body: JSON.stringify({
            items: toAdd,
            sections: sections,
            sections_url: window.location.pathname
          })
        });
        lastResponse = await response.json();
      }
    }
    catch (e) {
      console.error(e);
      return;
    }

    if (!lastResponse) return;

    // The drawer's markup (and this element) is present on every page, including /cart itself.
    // renderContents() only patches the drawer, so on the cart page a full reload keeps the
    // visible line-item table in sync too, matching how GiftWrapping.setGiftWrap() behaves.
    if (document.body.classList.contains('template-cart')) {
      window.location.href = theme.routes.cart_url;
      return;
    }

    this.miniCart && this.miniCart.renderContents(lastResponse);
  }
}
customElements.define('gift-tier-progress', GiftTierProgress);

class CartTerms extends HTMLElement {
  constructor() {
    super();

    this.checkbox = this.querySelector('.cart-terms__checkbox');
    this.checkoutButton = this.closest('form')?.querySelector('button[name="checkout"]');

    if (!this.checkbox || !this.checkoutButton) return;

    // The drawer's markup is fully replaced on every cart change (including a background
    // gift-tier sync), which would otherwise silently re-lock checkout after a customer
    // already agreed. Persist like DiscountCode does for the discount code input.
    if (isStorageSupported('session') && window.sessionStorage.getItem('cart-terms-agreed') === 'true') {
      this.checkbox.checked = true;
      this.checkoutButton.disabled = false;
    }

    this.checkbox.addEventListener('change', () => {
      this.checkoutButton.disabled = !this.checkbox.checked;

      if (isStorageSupported('session')) {
        window.sessionStorage.setItem('cart-terms-agreed', this.checkbox.checked ? 'true' : 'false');
      }
    });
  }
}
customElements.define('cart-terms', CartTerms);
