import { Menu, MenuItem } from '@embedpdf/viewer-react';
import { copyLink, emailLink } from './share'; // your app

export function ShareMenu() {
  return (
    <Menu icon="link" label="Share">
      <MenuItem icon="copy" onSelect={copyLink}>
        Copy link
      </MenuItem>
      <MenuItem icon="message" onSelect={emailLink}>
        Email a link
      </MenuItem>
    </Menu>
  );
}
