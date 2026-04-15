if (typeof globalThis.DOMException !== "function") {
  class DOMExceptionPolyfill extends Error {
    code?: number;

    constructor(message = "", name = "Error") {
      super(message);
      this.name = name;
    }
  }

  Reflect.set(globalThis as object, "DOMException", DOMExceptionPolyfill);
}
