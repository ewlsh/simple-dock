import {
    Revealer,
    Switch,
    CheckButton,
    SpinButton,
    Scale,
    Label,
    Box,
    Button,
    Window,
    ComboBox,
    ModelButton,
} from 'gtk';

const { Gio, GLib, Gtk } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();

var DockMode = {
    OVERVIEW_ONLY: 0,
    AUTOHIDE: 1,
    FIXED: 2,
};

const SCALE_UPDATE_TIMEOUT = 500;

function buildWidget() {
    const settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.simple-dock');

    const builder = new Gtk.Builder();

    builder.set_translation_domain(Me.metadata['gettext-domain']);
    builder.add_from_file(`${Me.path}/prefs.ui`);

    // Timeout to delay the update of the settings
    let dock_size_source_id = 0;
    let icon_size_source_id = 0;

    {
        // Autohide settings
        const dock_enable_switch = builder.get_object('dock_enable_switch') as Switch;
        dock_enable_switch.connect('state-set', (_, enabled) => {
            settings.set_enum('mode', enabled ? DockMode.AUTOHIDE : DockMode.OVERVIEW_ONLY);
        });
        const dock_mode_combo = builder.get_object('dock_mode_combo') as ComboBox;
        const dock_mode_reveal = builder.get_object('dock_mode_reveal') as Revealer;
        const autohide_reveal = builder.get_object('autohide_reveal') as Revealer;
        settings.bind('mode', dock_mode_combo, 'active-id', Gio.SettingsBindFlags.DEFAULT);

        const value = settings.get_enum('mode');

        dock_mode_reveal.set_reveal_child(value !== DockMode.OVERVIEW_ONLY);
        autohide_reveal.set_reveal_child(value === DockMode.AUTOHIDE);

        settings.connect('changed::mode', settings => {
            const value = settings.get_enum('mode');

            dock_mode_reveal.set_reveal_child(value !== DockMode.OVERVIEW_ONLY);
            autohide_reveal.set_reveal_child(value === DockMode.AUTOHIDE);
        });

        const autohide_pressure_check = builder.get_object(
            'autohide_pressure_check'
        ) as CheckButton;
        const autohide_pressure_reveal = builder.get_object('autohide_pressure_reveal') as Revealer;
        settings.bind(
            'enable-pressure-threshold',
            autohide_pressure_check,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        settings.bind(
            'enable-pressure-threshold',
            autohide_pressure_reveal,
            'reveal-child',
            Gio.SettingsBindFlags.DEFAULT
        );

        const animation_duration_spinner = builder.get_object(
            'animation_duration_spinner'
        ) as SpinButton;
        settings.bind(
            'animation-duration',
            animation_duration_spinner,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );

        const hide_delay_spinner = builder.get_object('hide_delay_spinner') as SpinButton;
        settings.bind('hide-delay', hide_delay_spinner, 'value', Gio.SettingsBindFlags.DEFAULT);

        const show_delay_spinner = builder.get_object('show_delay_spinner') as SpinButton;
        settings.bind('show-delay', show_delay_spinner, 'value', Gio.SettingsBindFlags.DEFAULT);

        const pressure_threshold_spinbutton = builder.get_object(
            'pressure_threshold_spinbutton'
        ) as SpinButton;
        settings.bind(
            'pressure-threshold',
            pressure_threshold_spinbutton,
            'value',
            Gio.SettingsBindFlags.DEFAULT
        );
    }

    {
        // Size Settings

        const dock_size_extend_checkbutton = builder.get_object(
            'dock_size_extend_checkbutton'
        ) as CheckButton;
        const dock_size_reveal = builder.get_object('dock_size_reveal') as Revealer;
        settings.bind(
            'extend',
            dock_size_extend_checkbutton,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
        settings.bind(
            'extend',
            dock_size_reveal,
            'reveal-child',
            Gio.SettingsBindFlags.INVERT_BOOLEAN
        );

        const dock_size_scale = builder.get_object('dock_size_scale') as Scale;
        dock_size_scale.set_value(settings.get_double('height'));
        dock_size_scale.add_mark(0.9, Gtk.PositionType.TOP, null);
        dock_size_scale.connect('format-value', (_, value) => {
            return `${Math.round(value * 100)}%`;
        });
        dock_size_scale.connect('value-changed', scale => {
            if (dock_size_source_id > 0) GLib.source_remove(dock_size_source_id);

            dock_size_source_id = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                SCALE_UPDATE_TIMEOUT,
                () => {
                    settings.set_double('height', scale.get_value());
                    dock_size_source_id = 0;
                    return GLib.SOURCE_REMOVE;
                }
            );
        });

        const iconSizesVariant = settings.get_value('icon-sizes');
        const len = iconSizesVariant.n_children();
        let rawIconSizes = [];

        for (let i = 0; i < len; i++) {
            const val = iconSizesVariant.get_child_value(i).get_int32();
            rawIconSizes.push(val);
        }

        const defaultIconSizes = rawIconSizes
            .sort((a, b) => b - a)
            .reduce(
                (prev, next) => {
                    const last = prev.pop();

                    prev.push(last);

                    if (last - next >= 8) {
                        prev.push(next);
                    }

                    return prev;
                },
                [Number.MAX_SAFE_INTEGER]
            )
            .slice(1);

        const icon_size_reveal = builder.get_object('icon_size_reveal') as Revealer;
        settings.bind(
            'fixed-icon-size',
            icon_size_reveal,
            'reveal-child',
            Gio.SettingsBindFlags.DEFAULT
        );
        const icon_size_scale = builder.get_object('icon_size_scale') as Scale;
        icon_size_scale.set_range(
            defaultIconSizes[defaultIconSizes.length - 1],
            defaultIconSizes[0]
        );
        icon_size_scale.set_value(settings.get_int('icon-size'));
        defaultIconSizes.forEach(size => {
            icon_size_scale.add_mark(size, Gtk.PositionType.TOP, `${size}`);
        });
        icon_size_scale.connect('format-value', (_, value) => {
            return `${Math.round(value)}px`;
        });
        icon_size_scale.connect('value-changed', scale => {
            if (icon_size_source_id > 0) GLib.source_remove(icon_size_source_id);

            icon_size_source_id = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                SCALE_UPDATE_TIMEOUT,
                () => {
                    settings.set_int('icon-size', scale.get_value());
                    icon_size_source_id = 0;
                    return GLib.SOURCE_REMOVE;
                }
            );
        });

        // Correct for rtl languages
        if (Gtk.Widget.get_default_direction() == Gtk.TextDirection.RTL) {
            // Flip value position: this is not done automatically
            // I suppose due to a bug, having a more than one mark and one above a value of 100
            // makes the rendering of the marks wrong in rtl. This doesn't happen setting the scale as not flippable
            // and then manually inverting it
            dock_size_scale.set_value_pos(Gtk.PositionType.LEFT);
            icon_size_scale.set_value_pos(Gtk.PositionType.LEFT);

            icon_size_scale.set_flippable(false);
            icon_size_scale.set_inverted(true);
        }

        const icon_size_fixed_check = builder.get_object('icon_size_fixed_check') as CheckButton;
        settings.bind(
            'fixed-icon-size',
            icon_size_fixed_check,
            'active',
            Gio.SettingsBindFlags.DEFAULT
        );
    }

    const widget = new Gtk.ScrolledWindow({
        hscrollbar_policy: Gtk.PolicyType.NEVER,
    });
    const child = builder.get_object('settings') as Box;
    widget.add(child);

    widget.connect('realize', () => {
        const window = (widget.get_toplevel() as unknown) as Window;

        if (window) {
            window.resize(600, 600);
        }
    });

    return widget;
}

function init() {
    ExtensionUtils.initTranslations();
}

function buildPrefsWidget() {
    const widget = buildWidget();

    widget.show_all();

    return widget;
}
