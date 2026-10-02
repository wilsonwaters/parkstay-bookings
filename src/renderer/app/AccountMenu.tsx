import { useState } from 'react';
import { CircleUser, Info, Settings } from 'lucide-react';
import { useHref } from 'react-router-dom';
import { IconButton, Menu, MenuItem } from '../components/ui';
import AboutDialog from '../components/AboutDialog';
import { ROUTES } from './routes';

/**
 * "Account and settings": Settings and About. There is no sign-in or Logout here: WA Stay has
 * no app login (brief D2), and provider accounts arrive with V6/U4.
 */
export function AccountMenu() {
  const [aboutOpen, setAboutOpen] = useState(false);
  const settingsHref = useHref(ROUTES.settings());
  return (
    <>
      <Menu align="end" trigger={<IconButton label="Account and settings" icon={<CircleUser />} />}>
        <MenuItem href={settingsHref} icon={<Settings size={16} aria-hidden="true" />}>
          Settings
        </MenuItem>
        <MenuItem icon={<Info size={16} aria-hidden="true" />} onSelect={() => setAboutOpen(true)}>
          About WA Stay
        </MenuItem>
      </Menu>
      <AboutDialog isOpen={aboutOpen} onClose={() => setAboutOpen(false)} />
    </>
  );
}

export default AccountMenu;
