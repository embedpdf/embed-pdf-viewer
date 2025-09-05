import { BasePlugin, CoreState, PluginRegistry, StoreState, arePropsEqual } from '@embedpdf/core';
import {
  childrenFunctionOptions,
  CommandMenuComponent,
  CustomComponent,
  FloatingComponent,
  GroupedItemsComponent,
  HeaderComponent,
  PanelComponent,
  UICapability,
  UIComponentType,
  UIPluginConfig,
  UIPluginState,
} from './types';
import { UIComponent } from './ui-component';
import { initialState } from './reducer';
import {
  uiInitComponents,
  UIPluginAction,
  uiSetHeaderVisible,
  uiShowCommandMenu,
  uiTogglePanel,
  uiHideCommandMenu,
  TogglePanelPayload,
  SetHeaderVisiblePayload,
  uiUpdateComponentState,
  UpdateComponentStatePayload,
} from './actions';
import { MenuManager } from './menu/menu-manager';

export class UIPlugin extends BasePlugin<
  UIPluginConfig,
  UICapability,
  UIPluginState,
  UIPluginAction
> {
  static readonly id = 'ui' as const;
  private componentRenderers: Record<
    string,
    (
      props: any,
      children: (options?: childrenFunctionOptions) => any[],
      context?: Record<string, any>,
    ) => any
  > = {};
  private components: Record<string, UIComponent<UIComponentType<any>>> = {};
  private config: UIPluginConfig;
  private mapStateCallbacks: {
    [componentId: string]: (storeState: any, ownProps: any) => any;
  } = {};
  private globalStoreSubscription: () => void = () => {};
  private menuManager: MenuManager; // Add this

  constructor(id: string, registry: PluginRegistry, config: UIPluginConfig) {
    super(id, registry);
    this.config = config;

    // Initialize command center
    this.menuManager = new MenuManager(config.menuItems || {}, this.registry);

    // Subscribe to command events
    this.setupCommandEventHandlers();

    // Subscribe exactly once to the global store
    this.globalStoreSubscription = this.registry.getStore().subscribe((_action, newState) => {
      this.onGlobalStoreChange(newState);
    });
  }

  async initialize(): Promise<void> {
    // Step 1: Build all individual components
    this.buildComponents();

    // Step 2: Link children for grouped items
    this.linkGroupedItems();

    // Step 3: Set initial state for UI components
    this.setInitialStateUIComponents();
  }

  // Set up handlers for command events
  private setupCommandEventHandlers(): void {
    // Handle command menu requests
    this.menuManager.on(MenuManager.EVENTS.MENU_REQUESTED, (data) => {
      const { menuId, triggerElement, position, flatten } = data;

      const isOpen = this.state.commandMenu.commandMenu?.activeCommand === menuId;
      if (isOpen) {
        return this.dispatch(uiHideCommandMenu({ id: 'commandMenu' }));
      }

      this.dispatch(
        uiShowCommandMenu({
          id: 'commandMenu',
          commandId: menuId,
          triggerElement,
          position,
          flatten,
        }),
      );
    });

    // Optional: Track command execution for analytics or other purposes
    this.menuManager.on(MenuManager.EVENTS.COMMAND_EXECUTED, (data) => {
      this.logger.debug('UIPlugin', 'CommandExecuted', `Command executed: ${data.command.id}`, {
        commandId: data.command.id,
        source: data.source,
      });
    });
  }

  private addComponent(id: string, componentConfig: UIComponentType<any>) {
    if (this.components[id]) {
      this.logger.warn(
        'UIPlugin',
        'ComponentAlreadyExists',
        `Component with ID ${id} already exists and will be overwritten`,
      );
    }
    // Step 1: Build the UIComponent
    const component = new UIComponent(componentConfig, this.componentRenderers);
    this.components[id] = component;

    // Step 2: Store mapStateToProps if present
    if (typeof componentConfig.mapStateToProps === 'function') {
      this.mapStateCallbacks[id] = componentConfig.mapStateToProps;
    }

    return component;
  }

  private buildComponents() {
    Object.entries(this.config.components).forEach(([id, componentConfig]) => {
      this.addComponent(id, componentConfig);
    });
  }

  private linkGroupedItems() {
    Object.values(this.components).forEach((component) => {
      if (isItemWithSlots(component)) {
        const props = component.componentConfig;
        props.slots?.forEach((slot) => {
          const child = this.components[slot.componentId];
          if (child) {
            component.addChild(slot.componentId, child, slot.priority, slot.className);
          } else {
            this.logger.warn(
              'UIPlugin',
              'ChildComponentNotFound',
              `Child component ${slot.componentId} not found for GroupedItems ${props.id}`,
            );
          }
        });
      }
    });
  }

  private setInitialStateUIComponents() {
    const defaultState: UIPluginState = initialState;

    Object.entries(this.config.components).forEach(([componentId, definition]) => {
      if (definition.initialState) {
        // store the initialState object, e.g. { open: false } or { active: true }
        defaultState[definition.type][componentId] = definition.initialState;
      } else {
        defaultState[definition.type][componentId] = {};
      }
    });

    this.dispatch(uiInitComponents(defaultState));
  }

  private onGlobalStoreChange(state: StoreState<CoreState>) {
    for (const [id, uiComponent] of Object.entries(this.components)) {
      const mapFn = this.mapStateCallbacks[id];
      if (!mapFn) continue; // no mapping

      // ownProps is the UIComponent's current props
      const { id: _id, ...ownProps } = uiComponent.props;

      const partial = mapFn(state, ownProps);
      // If partial is non-empty or changes from old, do update
      const merged = { ...ownProps, ...partial };

      if (!arePropsEqual(ownProps, merged)) {
        uiComponent.update(partial);
      }
    }
  }

  private addSlot(parentId: string, slotId: string, priority?: number, className?: string) {
    // 1. Get the parent component
    const parentComponent = this.components[parentId];

    if (!parentComponent) {
      this.logger.error(
        'UIPlugin',
        'ParentComponentNotFound',
        `Parent component ${parentId} not found`,
      );
      return;
    }

    // 2. Check if parent has slots (is a container type)
    if (!isItemWithSlots(parentComponent)) {
      this.logger.error(
        'UIPlugin',
        'ParentComponentDoesNotSupportSlots',
        `Parent component ${parentId} does not support slots`,
      );
      return;
    }

    // 3. Get the component to add to the slot
    const childComponent = this.components[slotId];

    if (!childComponent) {
      this.logger.error(
        'UIPlugin',
        'ChildComponentNotFound',
        `Child component ${slotId} not found`,
      );
      return;
    }

    const parentChildren = parentComponent.getChildren();

    // 4. Determine priority for the new slot
    let slotPriority = priority;

    if (slotPriority === undefined) {
      // If no priority is specified, add it at the end with a reasonable gap
      const maxPriority =
        parentChildren.length > 0 ? Math.max(...parentChildren.map((child) => child.priority)) : 0;
      slotPriority = maxPriority + 10; // Add a gap of 10
    }

    // 6. Add the child to the parent component with the appropriate priority
    // The UIComponent will handle sorting and avoid duplicates
    parentComponent.addChild(slotId, childComponent, slotPriority, className);
  }

  protected buildCapability(): UICapability {
    return {
      registerComponentRenderer: (
        type: string,
        renderer: (
          props: any,
          children: (options?: childrenFunctionOptions) => any[],
          context?: Record<string, any>,
        ) => any,
      ) => {
        this.componentRenderers[type] = renderer;
      },
      getComponent: <T>(id: string): T | undefined => {
        return this.components[id] as T | undefined;
      },
      registerComponent: this.addComponent.bind(this),
      getCommandMenu: () =>
        Object.values(this.components).find((component) => isCommandMenuComponent(component)),
      hideCommandMenu: () => this.cooldownDispatch(uiHideCommandMenu({ id: 'commandMenu' }), 100),
      getFloatingComponents: (scrollerPosition?: 'inside' | 'outside') =>
        Object.values(this.components)
          .filter((component) => isFloatingComponent(component))
          .filter(
            (component) =>
              !scrollerPosition || component.props.scrollerPosition === scrollerPosition,
          ),
      getHeadersByPlacement: (placement: 'top' | 'bottom' | 'left' | 'right') =>
        Object.values(this.components)
          .filter((component) => isHeaderComponent(component))
          .filter((component) => component.props.placement === placement),
      getPanelsByLocation: (location: 'left' | 'right') =>
        Object.values(this.components)
          .filter((component) => isPanelComponent(component))
          .filter((component) => component.props.location === location),
      addSlot: this.addSlot.bind(this),
      togglePanel: (payload: TogglePanelPayload) => {
        this.dispatch(uiTogglePanel(payload));
      },
      setHeaderVisible: (payload: SetHeaderVisiblePayload) => {
        this.dispatch(uiSetHeaderVisible(payload));
      },
      updateComponentState: (payload: UpdateComponentStatePayload) => {
        this.dispatch(uiUpdateComponentState(payload));
      },
      ...this.menuManager.capabilities(),
    };
  }

  async destroy(): Promise<void> {
    this.globalStoreSubscription();
    this.components = {};
    this.componentRenderers = {};
    this.mapStateCallbacks = {};
  }
}

function isItemWithSlots(
  component: UIComponent<UIComponentType<any>>,
): component is
  | UIComponent<GroupedItemsComponent>
  | UIComponent<HeaderComponent>
  | UIComponent<PanelComponent>
  | UIComponent<FloatingComponent>
  | UIComponent<CustomComponent> {
  return (
    isGroupedItemsComponent(component) ||
    isHeaderComponent(component) ||
    isPanelComponent(component) ||
    isFloatingComponent(component) ||
    isCustomComponent(component)
  );
}

// Type guard function
function isGroupedItemsComponent(
  component: UIComponent<UIComponentType>,
): component is UIComponent<GroupedItemsComponent> {
  return component.type === 'groupedItems';
}

function isHeaderComponent(
  component: UIComponent<UIComponentType>,
): component is UIComponent<HeaderComponent> {
  return component.type === 'header';
}

function isPanelComponent(
  component: UIComponent<UIComponentType>,
): component is UIComponent<PanelComponent> {
  return component.type === 'panel';
}

function isFloatingComponent(
  component: UIComponent<UIComponentType>,
): component is UIComponent<FloatingComponent> {
  return component.type === 'floating';
}

function isCommandMenuComponent(
  component: UIComponent<UIComponentType>,
): component is UIComponent<CommandMenuComponent> {
  return component.type === 'commandMenu';
}

function isCustomComponent(
  component: UIComponent<UIComponentType>,
): component is UIComponent<CustomComponent> {
  return component.type === 'custom';
}
