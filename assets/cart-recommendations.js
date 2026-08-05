/**
 * Makes the cart drawer's recommendation rail reachable with a mouse.
 *
 * The rail is a horizontal scroller. Touch and trackpads drive it natively, but a mouse
 * wheel only emits vertical delta -- which the drawer takes for itself -- so with a mouse
 * the rail cannot be scrolled at all, and its scrollbar is hidden by design. This
 * translates a vertical wheel into horizontal scroll and adds click-and-drag, the two
 * gestures a mouse user actually reaches for.
 *
 * Every listener is bound to the rail rather than the document: a non-passive wheel
 * listener on the document would opt the whole page out of the browser's scroll
 * optimisations.
 */
class CartRecommendations extends HTMLElement {
  /* How far the pointer must travel before it counts as a drag and not a click on a card. */
  static DRAG_THRESHOLD = 4;

  /* Scroll snapping springs the cards back mid-gesture, so it is suspended while one is
     running and restored once the rail has been still for this long. */
  static SNAP_RESTORE_DELAY = 120;

  /* Firefox reports wheel delta in lines, and some setups in pages. Roughly a line. */
  static LINE_HEIGHT = 16;

  connectedCallback() {
    this.list = this.querySelector('.cart-recommendations__list');
    if (!this.list) return;

    this.pointerId = null;
    this.dragging = false;
    this.snapTimer = null;
    this.swallowClick = this.swallowClick.bind(this);

    this.list.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
    this.list.addEventListener('pointerdown', this.onPointerDown.bind(this));
    this.list.addEventListener('pointermove', this.onPointerMove.bind(this));
    this.list.addEventListener('pointerup', this.onPointerEnd.bind(this));
    this.list.addEventListener('pointercancel', this.onPointerEnd.bind(this));
    this.list.addEventListener('dragstart', this.onDragStart.bind(this));
  }

  /* Card images are natively draggable, and that drag would hijack the scroll gesture.
     Suppress it for as long as a mouse button is down on the rail. */
  onDragStart(event) {
    if (this.pointerId !== null) event.preventDefault();
  }

  get canScroll() {
    return this.list.scrollWidth > this.list.clientWidth + 1;
  }

  onWheel(event) {
    if (!this.canScroll) return;

    // Trackpads and tilt wheels send their own horizontal delta and already work. Only
    // stand in for the vertical-only mouse wheel.
    if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;

    let delta = event.deltaY;
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
      delta *= CartRecommendations.LINE_HEIGHT;
    } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
      delta *= this.list.clientWidth;
    }

    // Once the rail bottoms out, hand the gesture back so the wheel goes on scrolling the
    // drawer rather than getting trapped here.
    const maxScroll = this.list.scrollWidth - this.list.clientWidth;
    if ((delta < 0 && this.list.scrollLeft <= 0) || (delta > 0 && this.list.scrollLeft >= maxScroll - 1)) {
      return;
    }

    event.preventDefault();
    this.suspendSnap();
    this.list.scrollLeft += delta;
  }

  onPointerDown(event) {
    // Touch and pen already scroll the rail natively, with momentum this cannot match.
    if (event.pointerType !== 'mouse' || event.button !== 0 || !this.canScroll) return;

    this.pointerId = event.pointerId;
    this.dragStartX = event.clientX;
    this.dragStartScroll = this.list.scrollLeft;
    this.dragging = false;
  }

  onPointerMove(event) {
    if (this.pointerId !== event.pointerId) return;

    const travelled = event.clientX - this.dragStartX;

    if (!this.dragging) {
      if (Math.abs(travelled) < CartRecommendations.DRAG_THRESHOLD) return;
      this.dragging = true;

      // Capture so the drag survives the cursor leaving the rail mid-gesture.
      this.list.setPointerCapture(this.pointerId);
      this.list.classList.add('is-dragging');
    }

    event.preventDefault();
    this.suspendSnap();
    this.list.scrollLeft = this.dragStartScroll - travelled;
  }

  onPointerEnd(event) {
    if (this.pointerId !== event.pointerId) return;

    if (this.dragging) {
      if (this.list.hasPointerCapture(this.pointerId)) {
        this.list.releasePointerCapture(this.pointerId);
      }
      this.list.classList.remove('is-dragging');
      this.suspendSnap();

      // A drag that finishes on top of a card would otherwise fire a click and navigate to
      // the product. Swallow that one click -- and drop the listener again on the next tick
      // in case the drag ended somewhere no click follows.
      this.list.addEventListener('click', this.swallowClick, { capture: true, once: true });
      setTimeout(() => {
        this.list.removeEventListener('click', this.swallowClick, { capture: true });
      }, 0);
    }

    this.pointerId = null;
    this.dragging = false;
  }

  swallowClick(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  /* Drops snapping for the duration of the gesture, then lets it settle the rail onto a
     card once the wheel or drag has stopped. */
  suspendSnap() {
    this.list.classList.add('is-scrolling');
    clearTimeout(this.snapTimer);
    this.snapTimer = setTimeout(() => {
      this.list.classList.remove('is-scrolling');
    }, CartRecommendations.SNAP_RESTORE_DELAY);
  }
}
customElements.define('cart-recommendations', CartRecommendations);
