import { DockInjector } from './inject';

const Main = imports.ui.main;

const ExtensionUtils = imports.misc.extensionUtils;

var injector: DockInjector = null;

function init() {
  ExtensionUtils.initTranslations('simple-dock');
}

function enable(this: any) {
    // If the dock already exists in upstream, we hide.
    if (Main.overview._overview._dock) return;

    injector = new DockInjector();
}

function disable(this: any) {
    if (injector != null) {
        injector.destroy();
        injector = null;
    }
}
