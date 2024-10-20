class Modal {
  private modal: HTMLDivElement;
  private container: HTMLDivElement;

  private modalInitialStyles: Partial<CSSStyleDeclaration> = {
    display: "none",
    position: "fixed",
    left: "0",
    top: "0",
    height: "100%",
    width: "100%",
    backgroundColor: "rgba(0,0,0,0.25)",
    placeItems: "center",
    zIndex: "9999",
  };

  private containerInitialStyles: Partial<CSSStyleDeclaration> = {
    maxWidth: "600px",
    width: "100%",
    height: "100%",
    borderRadius: "12px",
    overflow: "hidden",
    maxHeight: "90%",
  };

  private contentInitialStyles: Partial<CSSStyleDeclaration> = {
    width: "100%",
    height: "100%",
  };

  constructor(content: HTMLElement) {
    this.modal = document.createElement("div");

    this.modal.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    });

    Object.assign(this.modal.style, this.modalInitialStyles);

    this.container = document.createElement("div");

    Object.assign(this.container.style, this.containerInitialStyles);

    this.modal.append(this.container);

    Object.assign(content, this.contentInitialStyles);

    this.container.appendChild(content);

    const bodyElement: HTMLBodyElement = document.body as HTMLBodyElement;

    if (bodyElement === null) {
      throw "No body element!";
    }

    bodyElement.appendChild(this.modal);

    const mql = window.matchMedia("(max-width: 700px)");

    this.setSmallScreenStyle(mql.matches);

    mql.onchange = (e) => this.setSmallScreenStyle(e.matches);
  }

  private setSmallScreenStyle(smallScreen: boolean) {
    Object.assign(
      this.modal.style,
      smallScreen
        ? {
            padding: "0px",
          }
        : {
            padding: this.modalInitialStyles.padding,
          },
    );

    Object.assign(
      this.container.style,
      smallScreen
        ? {
            maxWidth: "100%",
            borderRadius: "0",
            maxHeight: "100%",
          }
        : {
            maxWidth: this.containerInitialStyles.maxWidth,
            borderRadius: this.containerInitialStyles.borderRadius,
            maxHeight: this.containerInitialStyles.maxHeight,
          },
    );
  }

  public open() {
    this.modal.style.display = "grid";
  }

  public close() {
    this.modal.style.display = "none";
  }
}
export default Modal;
