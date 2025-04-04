/** @jsxImportSource preact */
import { h, Fragment, ComponentChildren } from 'preact';
import { useUI } from '../hooks';
import { ComponentWrapper } from './component-wrapper';

export function NavigationWrapper({ children }: { children: ComponentChildren }) {
  const ui = useUI();

  const navbars = ui ? {top: ui.getHeadersByPlacement('top'), left: ui.getHeadersByPlacement('left'), right: ui.getHeadersByPlacement('right'), bottom: ui.getHeadersByPlacement('bottom')} : {top: [], left: [], right: [], bottom: []};
  const flyouts = ui ? ui.getFlyOuts() : [];
  const panels = ui ? {left: ui.getPanelsByLocation('left'), right: ui.getPanelsByLocation('right')} : {left: [], right: []};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {navbars.top.length > 0 && (
        <div style={{ width: '100%' }}>
          {navbars.top.map(header => <ComponentWrapper key={header.props.id} component={header} />)}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'row', flexGrow: 1, overflow: 'hidden' }}>
        {navbars.left.length > 0 && (
            <div>{navbars.left.map(header => <ComponentWrapper key={header.props.id} component={header} />)}</div>
        )}
        {panels.left.length > 0 && (
          <>
            {panels.left.map(panel => <ComponentWrapper key={panel.props.id} component={panel} />)}
          </>
        )}
        <div style={{ flexGrow: 1, position: 'relative' }}>
          {children}
        </div>
        {navbars.right.length > 0 && (
          <div>
            {navbars.right.map(header => <ComponentWrapper key={header.props.id} component={header} />)}
          </div>
        )}
        {panels.right.length > 0 && (
          <>
            {panels.right.map(panel => <ComponentWrapper key={panel.props.id} component={panel} />)}
          </>
        )}
      </div>
      {navbars.bottom.length > 0 && (
        <div style={{ width: '100%' }}>
          {navbars.bottom.map(header => <ComponentWrapper key={header.props.id} component={header} />)}
        </div>
      )}
      {flyouts.map(flyout => <ComponentWrapper key={flyout.props.id} component={flyout} />)}
    </div>
  );
}