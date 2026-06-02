import { Terminal as TerminalIcon, Github, ChevronDown } from 'lucide-react';
import { useStudioStore } from '../../store';
import { DropdownMenu } from '../shared/DropdownMenu';

import './WorkspaceToolbar.css';

export default function WorkspaceToolbar() {
    const isTerminalOpen = useStudioStore(s => s.isTerminalOpen);
    const setTerminalOpen = useStudioStore(s => s.setTerminalOpen);
    const isTrackingOpen = useStudioStore(s => s.isTrackingOpen);
    const setTrackingOpen = useStudioStore(s => s.setTrackingOpen);
    const addCanvasTerminal = useStudioStore(s => s.addCanvasTerminal);

    return (
        <div className="toolbar" aria-label="Studio Agent workspace controls">
            <DropdownMenu
                trigger={
                    <button
                        type="button"
                        className={`icon-btn ${isTerminalOpen ? 'icon-btn--active' : ''}`.trim()}
                        title="Terminal"
                        aria-label="Terminal options"
                    >
                        <TerminalIcon size={12} />
                        <ChevronDown size={10} />
                    </button>
                }
                items={[
                    { label: `${isTerminalOpen ? 'Hide' : 'Show'} Pinned Terminal`, onClick: () => setTerminalOpen(!isTerminalOpen) },
                    { label: 'Add Terminal to Canvas', onClick: () => addCanvasTerminal() },
                ]}
            />

            <button
                type="button"
                className={`icon-btn ${isTrackingOpen ? 'icon-btn--active' : ''}`.trim()}
                onClick={() => setTrackingOpen(!isTrackingOpen)}
                title="Workspace Tracking"
                aria-label="Toggle workspace tracking"
                aria-pressed={isTrackingOpen}
            >
                <Github size={12} />
            </button>
        </div>
    );
}
