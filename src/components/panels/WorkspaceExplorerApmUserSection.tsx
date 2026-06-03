import { UserRound } from 'lucide-react'
import { useApmPackages } from '../../hooks/queries/apm'
import { useStudioStore } from '../../store'
import { LayerRow } from './workspace-explorer-utils'

export default function WorkspaceExplorerApmUserSection() {
    const scope = useStudioStore((state) => state.apmPackageScope)
    const setScope = useStudioStore((state) => state.setApmPackageScope)
    const { data: userPackages = [], isLoading } = useApmPackages(true, 'user')
    const userScopeActive = scope === 'user'
    const packageCount = isLoading ? 'Loading packages' : `${userPackages.length} package${userPackages.length === 1 ? '' : 's'}`

    return (
        <section className="explorer-section explorer-section--apm-user">
            <div className="explorer__subheader">
                <span className="explorer__title">User</span>
            </div>
            <div className="explorer__tree explorer__tree--apm-user">
                <LayerRow
                    icon={<UserRound size={12} className={userScopeActive ? 'icon-active' : 'icon-muted'} />}
                    label="APM User"
                    meta={packageCount}
                    active={userScopeActive}
                    onClick={() => setScope(userScopeActive ? 'workspace' : 'user')}
                />
            </div>
        </section>
    )
}
