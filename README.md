# Simple Dock

## A simple dock for the GNOME Shell

This extension improves the usability of GNOME's dash and offers the ability to "dock" it.

The eventual goal is to merge Simple Dock into upstream GNOME Shell. To that end, Simple Dock reuses mostly  existing GNOME Shell mechanisms instead of inventing or patching its own.

Additionally, in hopes of upstreaming, this extension is highly opinionated.

It offers a choice in icon sizing, animation duration, and pressure levels. These configuration options make the dash more accessible but don't overly change the dash' UI.

## Credit

This extension borrows significantly from the amazing work done by `micheleg` and other `dash-to-dock` contributors. While the codebase is not a direct copy of from `dash-to-dock`, many bug fixes and optimizations has been included from `dash-to-dock`.

## Development

This extension uses Typescript.

In `gi/` you'll find auto-generated definitions for some libraries based on my `gi.ts` project.
In `types/` you'll find hand-written definitions for `St`, `Clutter`, and GNOME Shell's extension utilities.

To create an extension bundle the codebase is first compiled using `tsc` and then packaged with `rollup`.

## Installation from source

The extension can be installed directly from source, either for the convenience of using git or to test the latest development version. Clone the desired branch with git

<pre>git clone https://github.com/rockon999/simple-dock.git</pre>
or download the branch from github. A simple Makefile is included. Then run
<pre>make
make install
</pre>
to install the extension in your home directory. A Shell reload is required <code>Alt+F2 r Enter</code> and the extension has to be enabled  with *gnome-tweak-tool* or with *dconf*.

## Bug Reporting

Bugs should be reported to the Github bug tracker [https://github.com/rockon999/simple-dock/issues](https://github.com/rockon999/simple-dock/issues).

In general, I will not consider feature requests.

## License
Simple Dock is distributed under the terms of the GNU General Public License, version 2 or later. See `COPYING`.
