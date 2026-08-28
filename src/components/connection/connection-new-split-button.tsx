import { useRef, useState } from "react";
import { Plus, ChevronDown, Download, FolderPlus } from "lucide-react";
import { Button, IconButton, Menu, MenuItem } from "../ui";

interface ConnectionNewSplitButtonProps {
  onNewConnection: () => void;
  onImport: () => void;
  onNewGroup: () => void;
}

/** SCR-08 header: primary "New Connection" action, secondary actions
 *  (Import, New Group) behind the attached dropdown (design-spec 2.3/5.16). */
export function ConnectionNewSplitButton({ onNewConnection, onImport, onNewGroup }: ConnectionNewSplitButtonProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={anchorRef} className="relative flex items-center gap-1">
      <Button variant="primary" leadingIcon={<Plus size={14} />} onClick={onNewConnection}>
        New Connection
      </Button>
      <IconButton
        aria-label="More new-connection actions"
        aria-expanded={open}
        icon={<ChevronDown size={14} />}
        onClick={() => setOpen((v) => !v)}
      />
      {open && (
        <div className="absolute right-0 top-full z-popover mt-1">
          <Menu open onClose={() => setOpen(false)}>
            <MenuItem icon={<Download size={12} />} onSelect={() => { setOpen(false); onImport(); }}>
              Import Connections…
            </MenuItem>
            <MenuItem icon={<FolderPlus size={12} />} onSelect={() => { setOpen(false); onNewGroup(); }}>
              New Group
            </MenuItem>
          </Menu>
        </div>
      )}
    </div>
  );
}
