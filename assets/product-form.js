if (!customElements.get('product-form')) {
  customElements.define(
    'product-form',
    class ProductForm extends HTMLElement {
      constructor() {
        super();

        this.form = this.querySelector('form');
        if (this.variantIdInput) this.variantIdInput.disabled = false;
        this.form.addEventListener('submit', this.onSubmitHandler.bind(this));
        //this.cart = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
        this.cart = document.querySelector('mini-cart');
        this.submitButton = this.querySelector('[type="submit"]');
        this.submitButtonText = this.submitButton.querySelector('span');

        if (document.querySelector('theme-cart-drawer')) this.submitButton.setAttribute('aria-haspopup', 'dialog');

        this.hideErrors = this.dataset.hideErrors === 'true';
      }

      onSubmitHandler(evt) {
        evt.preventDefault();
        if (this.submitButton.getAttribute('aria-disabled') === 'true') return;
        if (!this.blockSubmitIfRequiredFieldsEmpty(evt)) return;

        this.handleErrorMessage();

        this.submitButton.setAttribute('aria-disabled', true);
        this.submitButton.classList.add('loading');
        //this.querySelector('.loading__spinner').classList.remove('hidden');

        const config = fetchConfig('javascript');
        config.headers['X-Requested-With'] = 'XMLHttpRequest';
        delete config.headers['Content-Type'];

        const formData = new FormData(this.form);
        if (this.cart) {
          formData.append(
            'sections',
            this.cart.getSectionsToRender().map((section) => section.id)
          );
          formData.append('sections_url', window.location.pathname);
          this.cart.setActiveElement(document.activeElement);
        }
        config.body = formData;

        fetch(`${theme.routes.cart_add_url}`, config)
          .then((response) => response.json())
          .then((response) => {
            console.log("Cart response:", response);

            if (response.status) {
              // existing error handling...
              return;
            } else if (!this.cart) {
              window.location = theme.routes.cart_url;
              return;
            }

            // Existing AddToCart logic...
            // Meta Pixel AddToCart event
            // Note: this code previously referenced an undefined `productPayload`,
            // which prevented the tracking from running.
            const variantId = String(this.variantIdInput?.value || "");
            if (variantId && window.metaPixel?.trackAddToCart) {
              const quantityInput = this.form.querySelector('input[name="quantity"]');
              const quantity = quantityInput ? parseInt(quantityInput.value, 10) || 1 : 1;

              const productPayload = {
                content_type: "product",
                content_name: document.title,
                content_category: "product",
                content_ids: [variantId],
                contents: [
                  {
                    id: variantId,
                    quantity: quantity
                  }
                ]
              };

              window.metaPixel.trackAddToCart(productPayload);
            }

            const quickAddModal = this.closest("quick-add-modal");

            if (quickAddModal) {
              document.body.addEventListener(
                "modalClosed",
                () => {
                  setTimeout(() => {
                    this.cart.renderContents(response);
                  });
                },
                { once: true }
              );

              quickAddModal.hide(true);
            } else {
              this.cart.renderContents(response);
            }
          })
          .catch((e) => {
            console.error(e);
          })
          .finally(() => {
            this.submitButton.classList.remove("loading");

            if (this.cart && this.cart.classList.contains("is-empty")) {
              this.cart.classList.remove("is-empty");
            }

            if (!this.error) {
              this.submitButton.removeAttribute("aria-disabled");
            }
          });
      }

      blockSubmitIfRequiredFieldsEmpty(event) {
          if (!(this.form instanceof HTMLFormElement)) {
            throw new Error("Expected a form element.");
          }

          const formId = this.form.getAttribute('id');
          const requiredFields = document.querySelectorAll('[required]');
          let allFilled = true;
          for (const field of requiredFields) {
            const belongsToForm = (field.getAttribute('form') === formId || field.closest('form')?.id === formId);
            if (!belongsToForm) continue;

            let isValid = true;
            switch (field.type) {
              case 'checkbox':
              case 'radio':
                const group = document.querySelectorAll(`input[name="${field.name}"][type="${field.type}"]`);
                const isChecked = Array.from(group).some(input => input.checked);
                isValid = isChecked;
                break;
              case 'select-one':
                isValid = field.value !== '';
                break;
              case 'textarea':
              case 'text':
              case 'email':
              case 'number':
              case 'url':
              default:
                isValid = field.value.trim() !== '';
                break;
            }
            if (!isValid) {
              allFilled = false;
              field.classList.add('invalid');
            } else {
              field.classList.remove('invalid');
            }
          }

          if (!allFilled) {
            event.preventDefault();
            this.handleErrorMessage(theme.accessibilityStrings.fillInAllLineItemPropertyRequiredFields);
            return false;
          }
          return true;
        }

        handleErrorMessage(errorMessage = false) {
          if (this.hideErrors) return;

          this.errorMessageWrapper =
            this.errorMessageWrapper || this.querySelector('.product-form__error-message-wrapper');
          if (!this.errorMessageWrapper) return;
          this.errorMessage = this.errorMessage || this.errorMessageWrapper.querySelector('.product-form__error-message');

          this.errorMessageWrapper.toggleAttribute('hidden', !errorMessage);

          if (errorMessage) {
            this.errorMessage.textContent = errorMessage;
          }
        }

        toggleSubmitButton(disable = true, text) {
          if (disable) {
            this.submitButton.setAttribute('disabled', 'disabled');
            if (text) this.submitButtonText.textContent = text;
          } else {
            this.submitButton.removeAttribute('disabled');
            this.submitButtonText.textContent = theme.variantStrings.addToCart;
          }
        }

      get variantIdInput() {
          return this.form.querySelector('[name=id]');
        }
      }
  );
}
