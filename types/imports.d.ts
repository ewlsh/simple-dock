declare interface ImportMap {
  dash: typeof import("../src/dash");
  dock: typeof import("../src/dock");
  inject: typeof import("../src/inject");
}

declare interface CurrentExtension {
  metadata: any;
}
