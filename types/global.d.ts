// Gnome Shell
declare namespace global {
   
    var top_window_group: any;
    // var workspace_manager: any;
    // var window_manager: any;
    // var get_window_actors: () => any[];
    var display: any;
    var sync_pointer: () => void;
    var get_pointer: () => any;
    var window_group: any;
    var stage: any;
  }
  
  // Type Stubs
  type WindowActor = any;
  
  // GJS
  declare function log(msg: string, ...more: string[]): void;
  
  // Utility
  type Module = { exports?: { [key: string]: any } };

  declare function _(id: string): string;