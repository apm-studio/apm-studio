import {
    addAgentFromPrimitiveImpl,
    addAgentImpl,
    applyAgentPrimitiveImpl,
    removeAgentImpl,
    selectAgentImpl,
    selectAgentSessionImpl,
    updateAgentNameImpl,
    updateAgentPositionImpl,
    updateAgentSizeImpl,
} from './agent-node-actions'
import {
    addAgentMcp as addAgentMcpImpl,
    addAgentSkill as addAgentSkillImpl,
    addAgentSkillRef as addAgentSkillRefImpl,
    removeAgentMcp as removeAgentMcpImpl,
    removeAgentSkill as removeAgentSkillImpl,
    replaceAgentSkillRef as replaceAgentSkillRefImpl,
    setAgentBody as setAgentBodyImpl,
    setAgentMcpBinding as setAgentMcpBindingImpl,
    setAgentModel as setAgentModelImpl,
    setAgentModelVariant as setAgentModelVariantImpl,
    setAgentRuntimeId as setAgentRuntimeIdImpl,
    toggleAgentVisibility as toggleAgentVisibilityImpl,
    updateAgentAuthoringMeta as updateAgentAuthoringMetaImpl,
} from './agent-config'
import type { WorkspaceGetState, WorkspaceSetState } from './action-context'
import { agentIdCounter } from './id-state'
import type { WorkspaceSlice } from './types'

type WorkspaceAgentActions = Pick<WorkspaceSlice,
    | 'addAgent'
    | 'addAgentFromPrimitive'
    | 'applyAgentPrimitive'
    | 'removeAgent'
    | 'updateAgentPosition'
    | 'updateAgentSize'
    | 'updateAgentName'
    | 'selectAgent'
    | 'selectAgentSession'
    | 'setAgentBody'
    | 'addAgentSkill'
    | 'addAgentSkillRef'
    | 'replaceAgentSkillRef'
    | 'removeAgentSkill'
    | 'setAgentModel'
    | 'setAgentModelVariant'
    | 'setAgentRuntimeId'
    | 'addAgentMcp'
    | 'removeAgentMcp'
    | 'setAgentMcpBinding'
    | 'updateAgentAuthoringMeta'
    | 'toggleAgentVisibility'
>

export function createWorkspaceAgentActions(set: WorkspaceSetState, get: WorkspaceGetState): WorkspaceAgentActions {
    return {
        addAgent: (name, x, y) => addAgentImpl(get, set, agentIdCounter, name, x, y),
        addAgentFromPrimitive: (primitive, x, y) => addAgentFromPrimitiveImpl(get, set, agentIdCounter, primitive, x, y),
        applyAgentPrimitive: (agentId, primitive) => applyAgentPrimitiveImpl(get, set, agentId, primitive),
        removeAgent: (id) => removeAgentImpl(get, set, id),
        updateAgentPosition: (id, x, y) => updateAgentPositionImpl(set, id, x, y),
        updateAgentSize: (id, width, height) => updateAgentSizeImpl(set, id, width, height),
        updateAgentName: (id, name) => updateAgentNameImpl(get, set, id, name),
        selectAgent: (id) => selectAgentImpl(set, id),
        selectAgentSession: (sessionId) => selectAgentSessionImpl(set, sessionId),
        setAgentBody: (agentId, agentBody) => setAgentBodyImpl(set, get, agentId, agentBody),
        addAgentSkill: (agentId, skill) => addAgentSkillImpl(set, get, agentId, skill),
        addAgentSkillRef: (agentId, skillRef) => addAgentSkillRefImpl(set, get, agentId, skillRef),
        replaceAgentSkillRef: (agentId, currentRef, nextRef) => replaceAgentSkillRefImpl(set, get, agentId, currentRef, nextRef),
        removeAgentSkill: (agentId, skillKey) => removeAgentSkillImpl(set, get, agentId, skillKey),
        setAgentModel: (agentId, model) => setAgentModelImpl(set, get, agentId, model),
        setAgentModelVariant: (agentId, modelVariant) => setAgentModelVariantImpl(set, get, agentId, modelVariant),
        setAgentRuntimeId: (agentId, runtimeAgentId) => setAgentRuntimeIdImpl(set, get, agentId, runtimeAgentId),
        addAgentMcp: (agentId, mcp) => addAgentMcpImpl(set, get, agentId, mcp),
        removeAgentMcp: (agentId, mcpName) => removeAgentMcpImpl(set, get, agentId, mcpName),
        setAgentMcpBinding: (agentId, placeholderName, serverName) => setAgentMcpBindingImpl(set, get, agentId, placeholderName, serverName),
        updateAgentAuthoringMeta: (agentId, patch) => updateAgentAuthoringMetaImpl(set, get, agentId, patch),
        toggleAgentVisibility: (id) => toggleAgentVisibilityImpl(set, get, id),
    }
}
