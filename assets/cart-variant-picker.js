/**
 * Lets a customer swap a line item's variant from inside the cart drawer.
 *
 * The Cart AJAX API has no "change this line's variant" call -- /cart/change.js only accepts
 * quantity, properties and selling plan -- so a swap is an add of the new variant followed by
 * a removal of the old line. Adding first means a failure mid-way leaves the customer with a
 * duplicate rather than an empty cart, which is the recoverable direction to fail in.
 */
class CartVariantPicker extends HTMLElement {
  constructor() {
    super();

    this.select = this.querySelector('select');
    this.previousValue = this.select?.value;
    this.select?.addEventListener('change', this.onChange.bind(this));
  }

  get miniCart() {
    return document.querySelector('mini-cart');
  }

  getSectionsToRender() {
    return [
      { id: 'mini-cart', section: 'mini-cart', selector: '.shopify-section' },
      { id: 'cart-icon-bubble', section: 'cart-icon-bubble', selector: '.shopify-section' },
      { id: 'mobile-cart-icon-bubble', section: 'mobile-cart-icon-bubble', selector: '.shopify-section' },
      { id: 'cart-live-region-text', section: 'cart-live-region-text', selector: '.shopify-section' }
    ];
  }

  parseProperties() {
    try {
      const properties = JSON.parse(this.dataset.properties || '{}');
      // A cart with no line-item properties serialises as an empty array, not an object.
      return properties && !Array.isArray(properties) ? properties : {};
    }
    catch (e) {
      return {};
    }
  }

  async onChange() {
    const variantId = this.select.value;
    if (!variantId || variantId === this.dataset.variantId) return;

    this.setLoading(true);

    const sections = this.getSectionsToRender().map((section) => section.section);
    const item = {
      id: Number(variantId),
      quantity: Number(this.dataset.quantity) || 1,
      properties: this.parseProperties()
    };

    if (this.dataset.sellingPlan) {
      item.selling_plan = Number(this.dataset.sellingPlan);
    }

    try {
      const addResponse = await fetch(theme.routes.cart_add_url, {
        ...fetchConfig('javascript'),
        body: JSON.stringify({ items: [item] })
      });
      const added = await addResponse.json();

      if (added.status && added.status !== 200) {
        this.showError(added.description || added.message);
        this.revert();
        return;
      }

      const removeResponse = await fetch(theme.routes.cart_change_url, {
        ...fetchConfig(),
        body: JSON.stringify({
          id: this.dataset.key,
          quantity: 0,
          sections: sections,
          sections_url: window.location.pathname
        })
      });
      const state = await removeResponse.json();

      // The drawer markup exists on the cart page too, but re-rendering it there would leave
      // the page's own line-item table stale, so fall back to a reload -- same as gift-tiers.js.
      if (document.body.classList.contains('template-cart')) {
        window.location.href = theme.routes.cart_url;
        return;
      }

      this.miniCart?.renderContents(state);

      document.dispatchEvent(new CustomEvent('cart:updated', { detail: { cart: JSON.stringify(state) } }));
      publish(PUB_SUB_EVENTS.cartUpdate, { source: 'cart-variant-picker' });
    }
    catch (e) {
      console.error(e);
      this.showError(theme.cartStrings?.error);
      this.revert();
    }
  }

  revert() {
    this.select.value = this.previousValue;
    this.setLoading(false);
  }

  setLoading(isLoading) {
    this.classList.toggle('is-loading', isLoading);
    this.select.disabled = isLoading;

    const cartItems = document.getElementById('main-cart-items');
    cartItems?.classList.toggle('cart__items--disabled', isLoading);

    const spinner = this.closest('.cart-item')?.querySelector('.loading-overlay');
    spinner?.classList.toggle('hidden', !isLoading);
  }

  showError(message) {
    if (!message) return;
    const errorText = document.getElementById(`Line-item-error-${this.dataset.line}`)?.querySelector('.cart-item__error-text');
    if (errorText) errorText.textContent = message;
  }
}

customElements.define('cart-variant-picker', CartVariantPicker);
