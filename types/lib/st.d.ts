import * as Clutter from './clutter';

export declare class Widget extends Clutter.Actor {
    _delegate: any;

    remove_style_class_name(name: string): void;
    add_style_class_name(name: string): void;
}

export declare class Bin extends Widget {}

export declare class BoxLayout extends Widget {}

export declare class ThemeContext {
    static get_for_stage(stage: any): any;
}

export declare class ScrollView extends Widget {
    constructor(...args: any[]);

    get_vscroll_bar(): any;
    get_effect(effect: string): any;
    update_fade_effect(h: number, v: number): any;
}

export enum PolicyType {
    NEVER,
}

export enum Side {
    TOP,
    RIGHT,
    BOTTOM,
    LEFT,
}
