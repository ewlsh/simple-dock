import { Object as GObjectType } from 'gobject';

import { ScrollView } from 'types/lib/st';
import {
    ShowAppsIcon as $ShowAppsIcon,
    DashItemContainer as $DashItemContainer,
} from 'types/ui/dash';

const { Clutter, GLib, GObject, Shell, St } = imports.gi;

const AppFavorites = imports.ui.appFavorites;
const Main = imports.ui.main;

const Util = imports.misc.util;
const Params = imports.misc.params;

const {
    DASH_ANIMATION_TIME,
    ShowAppsIcon,
    Dash,
    DashActor,
    DashIcon,
    DashItemContainer,
} = imports.ui.dash;

var SimpleDashIcon = GObject.registerClass(
    { GTypeName: 'SimpleDock_DashIcon' },
    class SimpleDashIcon extends DashIcon {
        _resetId: number;
        _cycleIndex: number;
        _cycleWindows: any[] | null;

        _init(app: any) {
            super._init(app, {
                setSizeManually: true,
                showLabel: false,
            });

            this._resetId = 0;
            this._cycleIndex = 0;
            this._cycleWindows = null;
        }

        cycleWindows() {
            const appWindows = this.app.get_windows().filter((w: any) => !w.skip_taskbar);

            log(appWindows.length);

            if (appWindows.length < 1) {
                return;
            }

            if (this._resetId > 0) {
                GLib.source_remove(this._resetId);
            }

            this._resetId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 3500, () => {
                this._resetId = 0;
                this._cycleWindows = null;
                this._cycleIndex = 0;

                return GLib.SOURCE_REMOVE;
            });

            if (this._cycleWindows === null || this._cycleWindows.length !== appWindows.length) {
                this._cycleWindows = appWindows;
                this._cycleIndex = 0;
            }

            if (this._cycleIndex >= this._cycleWindows.length - 1) {
                this._cycleIndex = 0;
                log(`${this._cycleIndex} / ${this._cycleWindows.length - 1}`);
            } else {
                this._cycleIndex += 1;
                log(`${this._cycleIndex} / ${this._cycleWindows.length - 1}`);
            }

            const window = this._cycleWindows[this._cycleIndex];

            if (window) {
                Main.activateWindow(window);
            }
        }
    }
);

const SimpleDashActor = GObject.registerClass(
    { GTypeName: 'SimpleDock_DashActor' },
    class SimpleDashActor extends DashActor {
        _init() {
            super._init();

            this.set_offscreen_redirect(Clutter.OffscreenRedirect.ALWAYS);
        }
    }
);

const baseIconSizes = [16, 22, 24, 32, 48, 64];

export const SimpleDash = GObject.registerClass(
    {
        GTypeName: 'SimpleDock_Dash',
        Signals: {
            'menu-closed': {},
        },
    },
    class SimpleDash extends Dash {
        maxIconSize: number;
        iconSizes: number[];
        iconSize: number;

        _animatingPlaceholdersCount: number;
        _box: typeof St.Widget.prototype;
        _container: typeof SimpleDashActor.prototype;
        _dragPlaceholder: any;
        _dragPlaceholderPos: number;
        _ensureAppIconVisibilityTimeoutId: number;
        _fixedIconSize: number;
        _iconSizeFixed: boolean;
        _labelShowing: boolean;
        _monitorIndex: number;
        _resetHoverTimeoutId: number;
        _scrollView: ScrollView;
        _showAppsIcon: $ShowAppsIcon;
        _showLabelTimeoutId: number;
        _shownInitially: boolean;
        _signals: [GObjectType, ...number[]][];
        _tracker: any;
        _workId: any;

        _init(params: {
            monitorIndex: number;
            fixedIconSize?: boolean;
            iconSize?: number;
            iconSizes?: number[];
        }) {
            params = Params.parse(params, {
                monitorIndex: -1,
                fixedIconSize: false,
                iconSize: 64,
                iconSizes: baseIconSizes,
            });

            this._maxHeight = -1;
            this._monitorIndex = params.monitorIndex;
            this._iconSizeFixed = params.fixedIconSize;

            this.iconSize = params.iconSize;
            this.iconSizes = params.iconSizes;

            if (this._iconSizeFixed) {
                this._fixedIconSize = params.iconSize;
            } else {
                this._fixedIconSize = -1;
            }

            this._shownInitially = false;

            this._dragPlaceholder = null;
            this._dragPlaceholderPos = -1;
            this._animatingPlaceholdersCount = 0;
            this._showLabelTimeoutId = 0;
            this._resetHoverTimeoutId = 0;
            this._ensureAppIconVisibilityTimeoutId = 0;
            this._labelShowing = false;

            this._container = new SimpleDashActor();
            this._box = new St.BoxLayout({
                vertical: true,
                clip_to_allocation: false,
                x_align: Clutter.ActorAlign.START,
                y_align: Clutter.ActorAlign.START,
            });
            this._box._delegate = this;

            this._scrollView = new St.ScrollView({
                name: 'dockScrollView',
                hscrollbar_policy: St.PolicyType.NEVER,
                vscrollbar_policy: St.PolicyType.NEVER,
                enable_mouse_scrolling: false,
            });
            this._scrollView.connect('scroll-event', this._onScrollEvent.bind(this));

            this._container.add_actor(this._scrollView);
            this._scrollView.add_actor(this._box);

            this._showAppsIcon = new ShowAppsIcon();
            this._showAppsIcon.show();
            this._showAppsIcon.icon.setIconSize(this.iconSize);
            this._hookUpLabel(this._showAppsIcon);

            this.showAppsButton = this._showAppsIcon.toggleButton;

            this._container.add_actor(this._showAppsIcon);

            // Call the grandparent _init to avoid initializing
            // unnecessary UI elements from the parent class.
            // SHELL: super._init({ child: this._container });
            St.Bin.prototype._init.call(this, { child: this._container });

            this.connect('notify::height', () => {
                if (this._maxHeight != this.height) this._queueRedisplay();
                this._maxHeight = this.height;
            });

            this._workId = Main.initializeDeferredWork(this._box, this._redisplay.bind(this));

            this._appSystem = Shell.AppSystem.get_default();

            const installChangedId = this._appSystem.connect('installed-changed', () => {
                AppFavorites.getAppFavorites().reload();
                this._queueRedisplay();
            });

            this._tracker = Shell.WindowTracker.get_default();

            const appFavorites = AppFavorites.getAppFavorites();

            const favoritesChangedId = appFavorites.connect(
                'changed',
                this._queueRedisplay.bind(this)
            );
            const appStateChangedId = this._appSystem.connect(
                'app-state-changed',
                this._queueRedisplay.bind(this)
            );

            const itemDragBeginId = Main.overview.connect(
                'item-drag-begin',
                this._onDragBegin.bind(this)
            );
            const itemDragEndId = Main.overview.connect(
                'item-drag-end',
                this._onDragEnd.bind(this)
            );
            const itemDragCancelId = Main.overview.connect(
                'item-drag-cancelled',
                this._onDragCancelled.bind(this)
            );

            this.connect('destroy', this._onDestroy.bind(this));

            this._signals = [];

            this._signals.push(
                [this._appSystem, installChangedId, appStateChangedId],
                [appFavorites, favoritesChangedId],
                [Main.overview, itemDragBeginId, itemDragEndId, itemDragCancelId]
            );
        }

        _onDestroy() {
            this._signals.forEach(([obj, ...signalIds]) => {
                signalIds.forEach(id => obj.disconnect(id));
            });

            this._tracker = null;
            this._appSystem = null;
        }

        _onScrollEvent(_: any, event: any) {
            // If scroll is not used because the icon is resized, let the scroll event propagate.
            if (!this._iconSizeFixed) {
                return Clutter.EVENT_PROPAGATE;
            }

            // Reset timeout to avoid conflicting with the mouse hover event.
            if (this._ensureAppIconVisibilityTimeoutId > 0) {
                GLib.source_remove(this._ensureAppIconVisibilityTimeoutId);
                this._ensureAppIconVisibilityTimeoutId = 0;
            }

            // Skip to prevent handling scroll twice.
            if (event.is_pointer_emulated()) {
                return Clutter.EVENT_STOP;
            }

            const adjustment = this._scrollView.get_vscroll_bar().get_adjustment();

            const increment = adjustment.step_increment;
            let value = adjustment.get_value();

            switch (event.get_scroll_direction()) {
                case Clutter.ScrollDirection.UP:
                    value -= increment;
                    break;
                case Clutter.ScrollDirection.DOWN:
                    value += increment;
                    break;
                case Clutter.ScrollDirection.SMOOTH:
                    const [, dy] = event.get_scroll_delta();
                    value += dy * increment;
                    break;
            }

            adjustment.set_value(value);

            return Clutter.EVENT_STOP;
        }

        _adjustIconSize() {
            // For the icon size, we only consider children which are "proper"
            // icons (i.e. ignoring drag placeholders) and which are not
            // animating out (which means they will be destroyed at the end of
            // the animation)
            let iconChildren = this._box.get_children().filter((actor: any) => {
                return (
                    actor.child &&
                    actor.child._delegate &&
                    actor.child._delegate.icon &&
                    !actor.animatingOut
                );
            });

            iconChildren.push(this._showAppsIcon);

            if (this._maxHeight == -1) {
                return;
            }

            // Ensure the container is present on the stage to avoid lockscreen errors.
            if (!this._container || !this._container.realized || !this._container.get_stage()) {
                return;
            }

            let newIconSize: number;

            if (this._iconSizeFixed) {
                newIconSize = this._fixedIconSize;
            } else {
                let themeNode = this._container.get_theme_node();
                let maxAllocation = new Clutter.ActorBox({
                    x1: 0,
                    y1: 0,
                    x2: 42 /* whatever */,
                    y2: this._maxHeight,
                });
                let maxContent = themeNode.get_content_box(maxAllocation);
                let availHeight = maxContent.y2 - maxContent.y1;
                let spacing = themeNode.get_length('spacing');

                let firstButton = iconChildren[0].child;
                let firstIcon = firstButton.icon;

                // Enforce valid spacings during the size request
                firstIcon.icon.ensure_style();
                let [, iconHeight] = firstIcon.icon.get_preferred_height(-1);
                let [, buttonHeight] = firstButton.get_preferred_height(-1);

                // Subtract icon padding and box spacing from the available height
                availHeight -=
                    iconChildren.length * (buttonHeight - iconHeight) +
                    (iconChildren.length - 1) * spacing;

                let availSize = availHeight / iconChildren.length;

                let scaleFactor = St.ThemeContext.get_for_stage(global.stage).scale_factor;
                let iconSizes = this.iconSizes.map(s => s * scaleFactor);

                newIconSize = this.iconSizes[0];
                for (let i = 0; i < iconSizes.length; i++) {
                    if (iconSizes[i] < availSize) newIconSize = this.iconSizes[i];
                }
            }

            if (newIconSize == this.iconSize) return;

            let oldIconSize = this.iconSize;
            this.iconSize = newIconSize;
            this.emit('icon-size-changed');

            let scale = oldIconSize / newIconSize;
            for (let i = 0; i < iconChildren.length; i++) {
                let icon = iconChildren[i].child.icon || iconChildren[i].icon;

                // Set the new size immediately, to keep the icons' sizes
                // in sync with this.iconSize
                icon.setIconSize(this.iconSize);

                // Don't animate the icon size change when the overview
                // is transitioning, not visible or when initially filling
                // the dash
                if (Main.overview.animationInProgress || !this._shownInitially) continue;

                let [targetWidth, targetHeight] = icon.icon.get_size();

                // Scale the icon's texture to the previous size and
                // tween to the new size
                icon.icon.set_size(icon.icon.width * scale, icon.icon.height * scale);

                icon.icon.ease({
                    width: targetWidth,
                    height: targetHeight,
                    time: DASH_ANIMATION_TIME,
                    mode: Clutter.AnimationMode.EASE_OUT_QUAD,
                });
            }
        }

        setIconSize(size: number, fixed: boolean = false) {
            this._iconSizeFixed = fixed;
            this._fixedIconSize = size;

            this._queueRedisplay();
        }

        setIconSizes(sizes: number[]) {
            this.iconSizes = sizes;

            this._queueRedisplay();
        }

        _createAppItem(app: any): $DashItemContainer {
            let appIcon = new SimpleDashIcon(app);

            let item = new DashItemContainer();
            item.setChild(appIcon);

            appIcon.connect('menu-state-changed', (o, opened) => {
                if (!opened) {
                    this.emit('menu-closed');
                }

                this._itemMenuStateChanged(item, opened);
            });

            appIcon.connect('notify::hover', () => {
                if (appIcon.hover) {
                    this._ensureAppIconVisibilityTimeoutId = GLib.timeout_add(
                        GLib.PRIORITY_DEFAULT,
                        100,
                        () => {
                            Util.ensureActorVisibleInScrollView(this._scrollView, appIcon);
                            this._ensureAppIconVisibilityTimeoutId = 0;
                            return GLib.SOURCE_REMOVE;
                        }
                    );
                } else if (this._ensureAppIconVisibilityTimeoutId > 0) {
                    GLib.source_remove(this._ensureAppIconVisibilityTimeoutId);
                    this._ensureAppIconVisibilityTimeoutId = 0;
                }
            });

            appIcon.connect('clicked', actor => {
                Util.ensureActorVisibleInScrollView(this._scrollView, actor);

                if (!Main.overview._shown && appIcon.app == this._tracker.focus_app) {
                    appIcon.cycleWindows();
                }
            });

            appIcon.connect('key-focus-in', actor => {
                let [x_shift, y_shift] = Util.ensureActorVisibleInScrollView(
                    this._scrollView,
                    actor
                );
                if (appIcon._menu) {
                    appIcon._menu._boxPointer.xOffset = -x_shift;
                    appIcon._menu._boxPointer.yOffset = -y_shift;
                }
            });

            // Override default AppIcon label_actor, now the
            // accessible_name is set at DashItemContainer.setLabelText
            appIcon.label_actor = null;
            item.setLabelText(app.get_name());

            appIcon.icon.setIconSize(this.iconSize);
            this._hookUpLabel(item, appIcon);

            return item;
        }
    }
);
