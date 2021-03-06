# Simple Dock

## A simple dock for the GNOME Shell

This extension improves the usability of GNOME's dash and offers the ability to "dock" it.

The eventual goal is to merge Simple Dock into upstream GNOME Shell. To that end, Simple Dock reuses mostly existing GNOME Shell mechanisms instead of inventing or patching its own.

Additionally, in hopes of upstreaming, this extension is highly opinionated.

It offers a choice in icon sizing, dock height, and visibility. These configuration options make the dash more accessible but don't overly change the dash' UI.

## Credit

This extension borrows significantly from the amazing work done by `micheleg` and other `dash-to-dock` contributors. While the codebase is not a direct fork of `dash-to-dock`, many bug fixes, optimizations, and insights has been included from `dash-to-dock`.

## Development

This extension uses Typescript.

In `gi/` you'll find auto-generated definitions for some libraries based on my `gi.ts` project.
In `types/` you'll find hand-written definitions for `St`, `Clutter`, and GNOME Shell's extension utilities.

To create an extension bundle the codebase is first compiled using `tsc` and then packaged with `rollup`.

## Build

```sh
make _build
```

## Installation

```sh
make install
```

## License

Simple Dock is distributed under the terms of the GNU General Public License, version 2 or later. See `COPYING`.
