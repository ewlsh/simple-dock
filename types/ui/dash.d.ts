import { Actor } from '../lib/clutter';

export declare interface DashImports {
    DASH_ITEM_LABEL_HIDE_TIME: any;
    DASH_ITEM_HOVER_TIMEOUT: any;
    DASH_ANIMATION_TIME: number;
    ShowAppsIcon: typeof ShowAppsIcon;
    Dash: typeof Dash;
    DashActor: typeof DashActor;
    DashIcon: typeof DashIcon;
    DashItemContainer: typeof DashItemContainer;
}

export declare class Dash extends Actor {

    constructor(...args: any[]);

    _maxHeight: number;
    _endDrag: any;
    _onDragMotion: any;
    _appIdListToHash: any;
    _syncLabel: any;
    _clearDragPlaceholder: any;
    _clearEmptyDropTarget: any;
    handleDragOver: any;
    acceptDrop: any;
    _dragPlaceholder: any;
    _dragPlaceholderPos: number;
    _animatingPlaceholdersCount: number;
    _showLabelTimeoutId: number;
    _resetHoverTimeoutId: number;
    _labelShowing: boolean;
    _appSystem: any;
    _workId: number;
    _box: any;

    showAppsButton: any;
    _showAppsIcon: typeof ShowAppsIcon.prototype;

    _onDragBegin(): void;
    _onDragEnd(): void;
    _onDragCancelled(): void;

    _redisplay(): void;
    _queueRedisplay(): void;
    _hookUpLabel(icon: DashItemContainer | DashIcon, appIcon?: DashIcon): void;
    _createAppItem(app: any): DashItemContainer;
    _itemMenuStateChanged(item: DashItemContainer, opened: boolean): void;
}

export declare class DashActor extends Actor {
    constructor(...args: any[]);

    vfunc_get_preferred_height(width: number): any;
    get_stage(): any;
}

export declare class DashItemContainer extends Actor {
  constructor(...args: any[]);

  setChild(appIcon: DashIcon): void;
  setLabelText(text: string): void;
}


export declare class DashIcon extends Actor {
    constructor(...args: any[]);

    app: any;
    hover: any;
    label_actor: any;
    icon: any;

    _menu: any;

    setIconSize(iconSize: number): void;
}

export declare class ShowAppsIcon extends DashIcon {
    constructor(...args: any[]);

    icon: DashIcon;
    toggleButton: Actor;
}
