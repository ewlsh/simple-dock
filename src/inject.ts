const { Meta } = imports.gi;
const Main = imports.ui.main;
const Signals = imports.signals;

import * as Dock from './dock';
import { Object as GObjectType } from 'gobject';

export class DockInjector {
    _oldDash: any;
    monitorsChangedId: number;
    _dock: any;
    _toggleLater: any;
    _signals: [GObjectType, ...number[]][];

    constructor() {
        this._oldDash = Main.overview.isDummy ? null : Main.overview.dash;

        if (this._createDock()) {
            this._injectPrimaryDash();
        }

        this._signals = [];
        this._bindSettings();
    }

    _bindSettings() {
        const mm = Meta.MonitorManager.get();

        this._signals.push(
            [mm, mm.connect('monitors-changed', this._toggle.bind(this))],
            [Main.sessionMode, Main.sessionMode.connect('updated', this._toggle.bind(this))]
        );
    }

    destroy() {
        this._signals.forEach(([obj, ...signalIds]) => {
            signalIds.forEach(id => obj.disconnect(id));
        });

        if (this._toggleLater) {
            Meta.later_remove(this._toggleLater);
            delete this._toggleLater;
        }

        this._restoreDash();

        this._dock.destroy();

        this._oldDash = null;
    }

    _toggle() {
        if (this._toggleLater) Meta.later_remove(this._toggleLater);

        this._toggleLater = Meta.later_add(Meta.LaterType.BEFORE_REDRAW, () => {
            delete this._toggleLater;
            this._restoreDash();
            this._dock.destroy();
            this._createDock();
            // @ts-ignore
            this.emit('toggled');
        });
    }

    _createDock() {
        // Don't attempt to create the dock when no monitors exist.
        if (Main.layoutManager.monitors.length <= 0) {
            return false;
        }

        // First we create the main Dock, to get the extra features to bind to this one
        this._dock = new Dock.Dock({
            monitorIndex: Main.layoutManager.primaryIndex,
        });
        return true;
    }

    _injectPrimaryDash() {
        const def = Object.getOwnPropertyDescriptor(Main.overview.constructor.prototype, 'dash');

        Object.defineProperty(Main.overview, 'dash', {
            configurable: true,
            get: () => (Main.overview.isDummy ? this._dock.dash : def.get.call(Main.overview)),
        });

        if (Main.overview.isDummy) return;

        // Hide the original dash.
        this._oldDash.hide();

        // Also set dash width to 1, so it's almost not taken into account by code
        // calculating the reserved space in the overview. The reason to keep it at 1 is
        // to allow its visibility change to trigger an allocation of the appGrid which
        // in turn is triggering the appsIcon spring animation, required when no other
        // actors has this effect, i.e in horizontal mode and without the workspaceThumbnails
        // 1 static workspace only)
        this._oldDash.set_width(1);

        const { _controls } = Main.overview._overview;

        _controls.dash = this._dock.dash;
    }

    _restoreDash() {
        const def = Object.getOwnPropertyDescriptor(Main.overview.constructor.prototype, 'dash');
        Object.defineProperty(Main.overview, 'dash', def);

        if (!this._oldDash) return;

        if (Main.overview.isDummy) return;

        const { _controls } = Main.overview._overview;

        _controls.dash = this._oldDash;

        const { dash } = _controls;

        // Show the dash again.
        dash.show();
        // Reset the dash width to default.
        dash.set_width(-1);
        // Force the icon size to be recalculated
        dash._maxHeight = -1;
    }
}
Signals.addSignalMethods(DockInjector.prototype);
