import { UiImports } from "./ui";

declare interface ImportMap {
  docking: any;
  utils: any;
  appIcons: any;
  locations: any;
}

declare interface Extension {
  extensionState: any;
  metadata: { [key: string]: any };
  dir: any;
  uuid: string;
  path: string;
}

declare interface CurrentExtension extends Extension {
  imports: ImportMap;
}

declare interface GiImports {
  [key: string]: any;
  GObject: typeof import("gobject");
  Gtk: typeof import("gtk");
  GLib: typeof import("glib");
  Gio: typeof import("gio");
  St: typeof import("./lib/st");
}

declare interface Imports {
  [key: string]: any;
  ui: UiImports;
  gi: GiImports;
  misc: {
    [key: string]: any;
    extensionUtils: {
      extensions: { [key: string]: Extension };
      getCurrentExtension: () => CurrentExtension;
      getSettings(uuid: string): import("gio").Settings;
      initTranslations(domain?: string): void;
    };
  };
}

declare global {
  var imports: Imports;
}
