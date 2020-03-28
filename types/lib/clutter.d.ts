import { Object } from "gobject";

export type TransitionProperties = {
  duration: number;
  delay: number;
  mode: number;
  onComplete: () => void;
};

export declare class Actor extends Object {
  constructor(...args: any[]);

  x: number;
  y: number;
  child: any;
  height: number;
  width: number;
  realized: boolean;
  set_height(height: number): void;
  set_width(width: number): void;
  remove_all_transitions(): void;
  ease_property(
    prop: string,
    flag: 0 | 1,
    properties: TransitionProperties
  ): void;
  get_stage(): any;
  add_constraint(constraint: any): void;
  set_child(child: any): void;
  move_anchor_point_from_gravity(anchor: number): void;
  set_anchor_point_from_gravity(anchor: number): void;
  emit(event: string): void;
  add_actor(actor: Actor): void;
  set_offscreen_redirect(option: number): void;
  get_theme_node(): any;
  set_allocation(box: any, flags: any): void;
  get_children(): any[];
  destroy(): void;
  show(): void;
  hide(): void;
}
