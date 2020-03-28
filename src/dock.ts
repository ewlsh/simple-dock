const { Clutter, GLib, GObject, Gtk, Meta, Shell, St } = imports.gi;

const Main = imports.ui.main;
const OverviewControls = imports.ui.overviewControls;
const ViewSelector = imports.ui.viewSelector;
const Layout = imports.ui.layout;

const ExtensionUtils = imports.misc.extensionUtils;

import { Object } from 'gobject';
import { Settings } from 'gio';

import * as Dash from './dash';

var State = {
    HIDDEN: 0,
    SHOWING: 1,
    SHOWN: 2,
    HIDING: 3,
};

var Mode = {
    OVERVIEW_ONLY: 0,
    AUTOHIDE: 1,
    FIXED: 2,
};

const SimpleDashSlider = GObject.registerClass(
    {
        GTypeName: 'SimpleDock_DashSlider',
    },
    class DashSlider extends OverviewControls.SlidingControl {
        _init() {
            super._init({ slideDirection: OverviewControls.SlideDirection.LEFT });

            this.x_expand = true;
            this.x_align = Clutter.ActorAlign.START;
            this.y_expand = true;
        }

        _getSlide() {
            if (this._visible || this._inDrag) return 1;
            else return 0;
        }

        _onOverviewHiding() {}

        _updateSlide(duration: number, delay = 0, onComplete = () => {}) {
            const slide = this._getSlide();
            this.ease_property('@layout.slide-x', slide, {
                mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                duration: duration * 1000,
                delay: delay * 1000,
                onComplete,
            });
        }

        slideIn(duration: number, delay = 0, onComplete = () => {}) {
            this._visible = true;
            this._updateSlide(duration, delay, onComplete);
        }

        slideOut(duration: number, delay = 0, onComplete = () => {}) {
            this._visible = false;
            this._updateSlide(duration, delay, onComplete);
        }
    }
);

export const Dock = GObject.registerClass(
    {
        GTypeName: 'SimpleDock_Dock',
        Signals: {
            showing: {},
            hiding: {},
        },
    },
    class Dock extends St.Bin {
        constrainSize: any;
        dash: typeof Dash.SimpleDash.prototype;

        _barrier: any;
        _box: any;
        _canUsePressure: boolean;
        _dashSpacer: any;
        _dockEdge: any;
        _dockEntered: any;
        _dockMode: number;
        _dockSettings: Settings;
        _dockState: number;
        _duration: number;
        _hideDelay: number;
        _ignoreHover: boolean;
        _monitor: any;
        _monitorIndex: number;
        _paintId: number;
        _pressureBarrier: any;
        _pressureThreshold: number;
        _removeBarrierTimeoutId: number;
        _requirePressureToShow: boolean;
        _saveIgnoreHover: any;
        _showAppsButton: boolean;
        _showDelay: number;
        _signals: [Object, ...number[]][];
        _slider: typeof SimpleDashSlider.prototype;

        _init(params: { monitorIndex: number }) {
            const { monitorIndex } = params;

            this._monitorIndex = monitorIndex;

            this._dockSettings = ExtensionUtils.getSettings(
                'org.gnome.shell.extensions.simple-dock'
            );

            this._signals = [];

            // Update dock on settings changes
            this._initializeSettings();
            this._bindSettingsChanges();

            // Used to ignore hover events while autohiding
            this._ignoreHover = false;
            this._saveIgnoreHover = null;

            // Initial dock state.
            this._dockState = State.HIDDEN;

            // Get the monitor object for this dock.
            this._monitor = Main.layoutManager.monitors[this._monitorIndex];

            // Pressure barrier state
            this._canUsePressure = false;
            this._pressureBarrier = null;
            this._barrier = null;
            this._removeBarrierTimeoutId = 0;

            // Fallback autohide detection
            this._dockEdge = null;

            // Get icon size settings.
            const fixedIconSize = this._dockSettings.get_boolean('fixed-icon-size');
            const iconSize = this._dockSettings.get_int('icon-size');
            const iconSizes = this._getIconSizes();

            // Create a new dash.
            // SHELL: this.dash = Dash.Dash({
            this.dash = new Dash.SimpleDash({
                monitorIndex,
                fixedIconSize,
                iconSizes,
                iconSize,
            });

            this.dash.showAppsButton.connect(
                'notify::checked',
                this._onShowAppsButtonToggled.bind(this)
            );

            super._init({
                name: 'dock',
                reactive: false,
            });

            this._box = new St.BoxLayout({
                name: 'dockbox',
                reactive: true,
                track_hover: true,
            });
            this._box.add_style_class_name('simpledock');
            this._box.connect('notify::hover', this._hoverChanged.bind(this));

            this.dash.connect('menu-closed', () => {
                this._box.sync_hover();
            });

            this._signals.push([
                global.display,
                global.display.connect('workareas-changed', this._reallocate.bind(this)),
                global.display.connect('in-fullscreen-changed', this._updateBarrier.bind(this)),
            ]);

            // Only initialize signals when the overview isn't a dummy.
            if (!Main.overview.isDummy) {
                this._signals.push(
                    [
                        Main.overview,
                        Main.overview.connect('item-drag-begin', this._onDragStart.bind(this)),
                        Main.overview.connect('item-drag-end', this._onDragEnd.bind(this)),
                        Main.overview.connect('item-drag-cancelled', this._onDragEnd.bind(this)),
                        Main.overview.connect('showing', this._onOverviewShowing.bind(this)),
                        Main.overview.connect('hiding', this._onOverviewHiding.bind(this)),
                    ],
                    [
                        Main.overview.viewSelector,
                        // Hide on appview
                        Main.overview.viewSelector.connect(
                            'page-changed',
                            this._pageChanged.bind(this)
                        ),
                        Main.overview.viewSelector.connect(
                            'page-empty',
                            this._onPageEmpty.bind(this)
                        ),
                    ],
                    [
                        Main.overview.viewSelector._showAppsButton,
                        // Ensure the ShowAppsButton status is kept in sync
                        Main.overview.viewSelector._showAppsButton.connect(
                            'notify::checked',
                            this._syncShowAppsButtonToggled.bind(this)
                        ),
                    ]
                );
            }

            // Delay operations that require the shell to be fully loaded and with
            // user theme applied.

            let id = this.connect_after('paint', () => {
                this.disconnect(id);

                // Drag and drop needs a non-null target if the overview hasn't yet been opened.
                if (!Main.overview.isDummy && Main.overview.viewSelector._activePage == null) {
                    // SHELL: js/ui/viewSelector.js | Update this._activePage = null;
                    Main.overview.viewSelector._activePage = Main.overview.viewSelector._workspacesPage;
                }

                this._updateDashVisibility();

                // If the extension is loaded while the overview is open.
                // SHELL: Remove this code.
                if (Main.overview.visibleTarget) {
                    this._onOverviewShowing();
                    this._pageChanged();
                }

                // Setup barriers.
                this._updatePressureBarrier();
                this._updateBarrier();

                // Setup the fallback autohide detection as needed.
                this._setupFallbackEdgeIfNeeded();
            });

            // SHELL: Remove this._dashSpacer
            this._dashSpacer = new OverviewControls.DashSpacer();
            this._dashSpacer.setDashActor(this._box);

            if (!Main.overview.isDummy) {
                const { _controls } = Main.overview._overview;

                _controls._group.insert_child_at_index(this._dashSpacer, 0);
            }

            this._box.add_actor(this.dash);
            this._box.x_expand = true;

            // SHELL: this._slider = new OverviewControls.DashSlider();
            this._slider = new SimpleDashSlider();
            this._slider.add_actor(this._box);

            this.set_child(this._slider);

            Main.uiGroup.add_child(this);
            if (Main.uiGroup.contains(global.top_window_group))
                Main.uiGroup.set_child_below_sibling(this, global.top_window_group);
            
            this._updateTracking();

            // Constrain the dash to the dock's height.
            let constraint = new Clutter.BindConstraint({
                source: this,
                coordinate: Clutter.BindCoordinate.HEIGHT,
            });
            this.dash.add_constraint(constraint);

            // Set initial allocation based on work area.
            this._reallocate();

            if (!Main.overview.isDummy) {
                Main.ctrlAltTabManager.addGroup(this.dash, _('Dash'), 'user-bookmarks-symbolic', {
                    focusCallback: this._onAccessibilityFocus.bind(this),
                });
            }

            this.connect('destroy', this._onDestroy.bind(this));
        }

        _initializeSettings() {
            const settings = this._dockSettings;

            this._dockMode = settings.get_enum('mode');
            this._pressureThreshold = settings.get_double('pressure-threshold');
            this._duration = settings.get_double('animation-duration');
            this._showDelay = settings.get_double('show-delay');
            this._hideDelay = settings.get_double('hide-delay');
            this._requirePressureToShow = settings.get_boolean('enable-pressure-threshold');
        }

        _bindSettingsChanges() {
            const settings = this._dockSettings;

            const ids = ([
                [
                    ['changed::icon-size', 'changed::fixed-icon-size'],
                    () => {
                        const fixed = settings.get_boolean('fixed-icon-size');
                        const size = settings.get_int('icon-size');
                        this.dash.setIconSize(size, fixed);
                    },
                ],
                [
                    ['changed::icon-sizes'],
                    () => {
                        const sizes = this._getIconSizes();
                        this.dash.setIconSizes(sizes);
                    },
                ],
                [
                    ['changed::mode'],
                    () => {
                        this._dockMode = settings.get_enum('mode');

                        log(`DOCK MODE: ${this._dockMode}`);

                        this._updateTracking();
                        this._updateDashVisibility();
                        this._updateBarrier();
                    },
                ],
                [['changed::extend', 'changed::height'], this._reallocate.bind(this)],
                [
                    ['changed::enable-pressure-threshold'],
                    () => {
                        this._requirePressureToShow = settings.get_boolean(
                            'enable-pressure-threshold'
                        );

                        this._setupFallbackEdgeIfNeeded();
                        this._updateBarrier();
                    },
                ],
                [
                    ['changed::pressure-threshold'],
                    () => {
                        this._pressureThreshold = settings.get_double('pressure-threshold');

                        this._updatePressureBarrier();
                        this._updateBarrier();
                    },
                ],
                [
                    ['changed::animation-duration'],
                    () => {
                        this._duration = settings.get_double('animation-duration');
                    },
                ],
                [
                    ['changed::hide-delay'],
                    () => {
                        this._hideDelay = settings.get_double('hide-delay');
                    },
                ],
                [
                    ['changed::show-delay'],
                    () => {
                        this._showDelay = settings.get_double('show-delay');
                    },
                ],
            ] as [string[], () => void][])
                .map(([signals, handler]) =>
                    signals.map(signal => settings.connect(signal, handler))
                )
                .reduce((prev, next) => [...prev, ...next], [] as number[]);

            this._signals.push([settings, ...ids]);
        }

        _onDestroy() {
            this._signals.forEach(([obj, ...signalIds]: [Object, number]) => {
                signalIds.forEach(id => obj.disconnect(id));
            });

            this.dash.destroy();

            // Remove barrier timeout
            if (this._removeBarrierTimeoutId > 0) GLib.source_remove(this._removeBarrierTimeoutId);

            // Remove existing barrier
            this._removeBarrier();

            if (this._dockEdge) {
                this._dockEdge.destroy();
            }

            // Remove the dashSpacer
            this._dashSpacer.destroy();

            this._dockSettings.run_dispose();
            this._dockSettings = null;
        }

        _getIconSizes(): number[] {
            const iconSizesVariant = this._dockSettings.get_value('icon-sizes');
            const n = iconSizesVariant.n_children();
            const iconSizes = [];

            for (let i = 0; i < n; i++) {
                const val = iconSizesVariant.get_child_value(i).get_int32();

                iconSizes.push(val);
            }

            return iconSizes;
        }

        _onShowAppsButtonToggled(button: any) {
            const selector = Main.overview.viewSelector;

            // SHELL: Move to js/ui/viewSelector.js
            if (!Main.overview.visibleTarget) {
                selector.showApps();
            } else if (selector._showAppsButton.checked !== button.checked) {
                selector._showAppsButton.checked = button.checked;
            }
        }

        _updateDashVisibility() {
            // Ignore if overview is visible.
            if (Main.overview.visibleTarget) {
                return;
            }

            // If autohiding check that the dash should still be visible
            if (this._dockMode === Mode.AUTOHIDE) {
                this._ignoreHover = false;
                global.sync_pointer();

                if (this._box.hover) {
                    this._animateIn();
                } else {
                    this._animateOut();
                }
            } else if (this._dockMode === Mode.FIXED) {
                this._animateIn();
            } else {
                this._animateOut();
            }
        }

        _onOverviewShowing() {
            this._ignoreHover = true;
            this._removeTransitions();

            this._animateIn();
        }

        _onOverviewHiding() {
            this._ignoreHover = false;
            this._updateDashVisibility();
        }

        _hoverChanged() {
            if (!this._ignoreHover && this._dockMode === Mode.AUTOHIDE) {
                if (this._box.hover) {
                    this._show();
                } else {
                    this._hide();
                }
            }
        }

        _show() {
            if (this._dockState === State.HIDDEN || this._dockState === State.HIDING) {
                if (this._dockState === State.HIDING) {
                    this._removeTransitions();
                }

                // Prevent 'double' animations which can cause visual quirks with autohide.
                if (this._dockState !== State.SHOWING) {
                    this.emit('showing');
                    this._animateIn();
                }
            }
        }

        _hide() {
            if (this._dockState == State.SHOWN || this._dockState == State.SHOWING) {
                let delay = this._hideDelay;

                if (this._dockState == State.SHOWING) {
                    delay += this._duration;
                }

                this.emit('hiding');
                this._animateOut(delay);
            }
        }

        _animateIn(delay = 0) {
            this._dockState = State.SHOWING;

            this._slider.slideIn(this._duration, delay, () => {
                this._dockState = State.SHOWN;

                if (this._removeBarrierTimeoutId > 0) {
                    GLib.source_remove(this._removeBarrierTimeoutId);
                }

                // Only schedule a remove timeout if the barrier exists.
                if (this._barrier) {
                    this._removeBarrierTimeoutId = GLib.timeout_add(
                        GLib.PRIORITY_DEFAULT,
                        100,
                        this._removeBarrier.bind(this)
                    );
                }
            });
        }

        _animateOut(delay = 0) {
            this._dockState = State.HIDING;

            this._slider.slideOut(this._duration, delay, () => {
                this._dockState = State.HIDDEN;

                // Remove queued barrier removal if any
                if (this._removeBarrierTimeoutId > 0) {
                    GLib.source_remove(this._removeBarrierTimeoutId);
                }

                this._updateBarrier();
            });
        }

        // Based on GNOME Shell's Hot Corner Fallback
        // /js/ui/layout.js
        _setupFallbackEdgeIfNeeded() {
            this._canUsePressure = global.display.supports_extended_barriers();

            if (this._dockEdge) {
                this._dockEdge.destroy();
                this._dockEdge = null;
            }

            if (!this._canUsePressure) {
                log('[simple-dock] Using fallback edge detection.');

                const workArea = Main.layoutManager.getWorkAreaForMonitor(this._monitorIndex);
                const height = workArea.height - 3;

                this._dockEdge = new Clutter.Actor({
                    name: 'dock-edge',
                    width: 1,
                    height,
                    opacity: 0,
                    reactive: true,
                });

                Main.layoutManager.addChrome(this._dockEdge);

                if (Clutter.get_default_text_direction() == Clutter.TextDirection.RTL) {
                    this._dockEdge.set_position(workArea.width - this._dockEdge.width, 0);
                    this.set_anchor_point_from_gravity(Clutter.Gravity.EAST);
                } else {
                    this._dockEdge.set_position(0, 1);
                }

                this._dockEdge.connect('enter-event', () => {
                    if (!this._dockEntered) {
                        this._dockEntered = true;
                        if (!this._monitor.inFullscreen) {
                            this._onPressureSensed();
                        }
                    }

                    return Clutter.EVENT_PROPAGATE;
                });

                this._dockEdge.connect('leave-event', (_: any, event: any) => {
                    if (event.get_related() !== this._dockEdge) {
                        this._dockEntered = false;
                    }

                    return Clutter.EVENT_STOP;
                });
            }
        }

        _updatePressureBarrier() {
            this._canUsePressure = global.display.supports_extended_barriers();

            // Remove existing pressure barrier
            if (this._pressureBarrier) {
                this._pressureBarrier.destroy();
                this._pressureBarrier = null;
            }

            if (this._barrier) {
                this._barrier.destroy();
                this._barrier = null;
            }

            // Construct a new pressure barrier, even if pressure is disabled.
            if (this._canUsePressure) {
                // Set pressure to '0' if no pressure is required.
                const pressure = this._requirePressureToShow ? this._pressureThreshold : 0;
                this._pressureBarrier = new Layout.PressureBarrier(
                    pressure,
                    1000 + this._showDelay * 1000, // 1 second plus the delay to show.
                    Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW
                );
                this._pressureBarrier.connect('trigger', () => {
                    if (this._monitor.inFullscreen) return;
                    this._onPressureSensed();
                });
            }
        }

        _onPressureSensed() {
            if (Main.overview.visibleTarget) return;

            // After any animations have completed, check that the mouse hasn't left the
            // dock area.
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000 * this._duration, () => {
                let [x, y] = global.get_pointer();

                const computed_x = this.x + this._slider.x;
                const computed_y = this._monitor.y + this._monitor.height;

                if (
                    x > computed_x ||
                    x < this._monitor.x ||
                    y < this._monitor.y ||
                    y > computed_y
                ) {
                    this._hoverChanged();
                    return GLib.SOURCE_REMOVE;
                } else {
                    return GLib.SOURCE_CONTINUE;
                }
            });

            this._show();
        }

        _removeBarrier() {
            if (this._barrier) {
                if (this._pressureBarrier) {
                    this._pressureBarrier.removeBarrier(this._barrier);
                }

                this._barrier.destroy();
                this._barrier = null;
            }

            this._removeBarrierTimeoutId = 0;
            return false;
        }

        _updateBarrier() {
            // Remove existing barrier
            this._removeBarrier();

            // The barrier needs to be removed in fullscreen with autohide disabled, otherwise the mouse can
            // get trapped on monitor.
            if (this._monitor.inFullscreen) return;

            // Manually reset pressure barrier
            // This is necessary because we remove the pressure barrier when it is triggered to show the dock
            if (this._pressureBarrier) {
                this._pressureBarrier._reset();
                this._pressureBarrier._isTriggered = false;
            }

            // Create new barrier
            // The barrier extends to the whole workarea, minus 1 px to avoid conflicting with other active corners
            // Note: dash in fixed position doesn't use pressure barrier.
            if (this._canUsePressure && this._dockMode === Mode.AUTOHIDE) {
                let x1, x2, y1, y2, direction;
                let workArea = Main.layoutManager.getWorkAreaForMonitor(this._monitor.index);

                x1 = this._monitor.x + 1;
                x2 = x1;
                y1 = workArea.y + 1;
                y2 = workArea.y + workArea.height - 1;
                direction = Meta.BarrierDirection.POSITIVE_X;

                if (this._pressureBarrier && this._dockState == State.HIDDEN) {
                    this._barrier = new Meta.Barrier({
                        display: global.display,
                        x1: x1,
                        x2: x2,
                        y1: y1,
                        y2: y2,
                        directions: direction,
                    });
                    this._pressureBarrier.addBarrier(this._barrier);
                }
            }
        }

        _updateTracking() {
            Main.layoutManager._untrackActor(this._slider);
            Main.layoutManager._untrackActor(this);

            if (this._dockMode === Mode.FIXED) {
                // Note: tracking the fullscreen directly on the slider actor causes some hiccups when fullscreening
                // windows of certain applications

                Main.layoutManager._trackActor(this, {
                    affectsInputRegion: false,
                    trackFullscreen: true,
                });
                Main.layoutManager._trackActor(this._slider, { affectsStruts: true });
            } else {
                // Add aligning container without tracking it for input region

                Main.layoutManager._trackActor(this._slider);
            }
        }

        _reallocate() {
            // Ensure variables linked to settings are updated.
            this._updateDashVisibility();

            // Note: do not use the workarea coordinates in the direction on which the dock is placed,
            // to avoid a loop [position change -> workArea change -> position change] with
            // fixed dock.
            let workArea = Main.layoutManager.getWorkAreaForMonitor(this._monitorIndex);

            // Reserve space for the dash on the overview if the dock is on the primary monitor
            // SHELL: Remove this if-else.
            if (this._monitorIndex == Main.layoutManager.primaryIndex) {
                this._dashSpacer.show();
            } else {
                this._dashSpacer.hide();
            }

            let extendHeight = this._dockSettings.get_boolean('extend');
            let height = extendHeight ? 1 : this._dockSettings.get_double('height');

            if (height < 0 || height > 1) {
                height = 0.95;
            }

            this.height = Math.round(height * workArea.height);

            this.move_anchor_point_from_gravity(Clutter.Gravity.NORTH_WEST);

            this.x = this._monitor.x;
            this.y = workArea.y + Math.round(((1 - height) / 2) * workArea.height);

            if (extendHeight) {
                this.dash._container.set_height(this.height);
                this.add_style_class_name('extended');
            } else {
                this.dash._container.set_height(-1);
                this.remove_style_class_name('extended');
            }
        }

        _removeTransitions() {
            this._slider.remove_all_transitions();
        }

        _onDragStart() {
            this._saveIgnoreHover = this._ignoreHover;
            this._ignoreHover = true;
            this._animateIn();
        }

        _onDragEnd() {
            if (this._saveIgnoreHover !== null) {
                this._ignoreHover = this._saveIgnoreHover;
            }

            this._saveIgnoreHover = null;
            this._box.sync_hover();

            if (Main.overview._shown) {
                this._pageChanged();
            }
        }

        _pageChanged() {
            const activePage = Main.overview.viewSelector.getActivePage();
            const showDash =
                activePage == ViewSelector.ViewPage.WINDOWS ||
                activePage == ViewSelector.ViewPage.APPS;

            if (showDash) {
                this._animateIn();
            } else {
                this._animateOut();
            }
        }

        _onPageEmpty() {
            const activePage = Main.overview.viewSelector.getActivePage();
            this._dashSpacer.visible = activePage == ViewSelector.ViewPage.WINDOWS;
        }

        _onAccessibilityFocus() {
            this._box.navigate_focus(null, Gtk.DirectionType.TAB_FORWARD, false);
            this._animateIn();
        }

        _syncShowAppsButtonToggled() {
            let status = Main.overview.viewSelector._showAppsButton.checked;
            if (this.dash.showAppsButton.checked !== status)
                this.dash.showAppsButton.checked = status;
        }
    }
);
