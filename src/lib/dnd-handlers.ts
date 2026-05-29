import type { PrimitiveCard } from './primitive-types'
/**
 * DnD mapping logic extracted from App.tsx.
 *
 * Contains pure helper functions and types for drag-and-drop primitive resolution
 * on the Studio canvas. These functions map dragged primitive data to store
 * mutations without depending on React state.
 */

import type { SharedPrimitiveRef } from '../../shared/chat-contracts'

import type { StudioState } from '../store/types'
import type { FullscreenNodeType } from '../store/workspace/types'
import type { ApmPackageScope } from '../../shared/apm-contracts'
import { primitiveUrnPath } from './primitive-urn'

// ── Types ───────────────────────────────────────────────

export type DragPreview = {
    kind: string;
    label: string;
};

export type DragPrimitive = Omit<Partial<PrimitiveCard>, 'kind' | 'source'> & {
    kind?: PrimitiveCard['kind'] | 'apm-package';
    label?: string;
    source?: string;
    scope?: ApmPackageScope;
    packageId?: string;
    packageKind?: string;
    manifestPath?: string;
    packageRoot?: string;
    primitiveCounts?: {
        agents?: number;
        instructions?: number;
        skills?: number;
        prompts?: number;
    };
    agentName?: string;
    paneId?: string;
    nodeId?: string;
    nodeType?: FullscreenNodeType;
    slug?: string;
    modelId?: string;
    semanticType?: string;
    value?: unknown;
    mcpConfig?: Record<string, unknown> | null;
    mcpServerNames?: string[];
    mcpBindingMap?: Record<string, string>;
    declaredMcpServerNames?: string[];
    matchedMcpServerNames?: string[];
    missingMcpServerNames?: string[];
    agentBody?: string | null;
    runtimeAgentId?: string | null;
    planMode?: boolean;
    /** Structured draft content for agent/team drafts */
    draftContent?: unknown;
};

export type DropTargetData = {
    type?: string;
    agentId?: string | null;
    teamId?: string | null;
    editorId?: string;
    splitPaneId?: string | null;
};

export type AgentPrimitivePayload = Parameters<StudioState['addAgentFromPrimitive']>[0];

// ── Helpers ─────────────────────────────────────────────

export function toDragPreview(primitive: DragPrimitive): DragPreview {
    return {
        kind: primitive?.kind || 'primitive',
        label: primitive?.label || primitive?.name || primitive?.modelId || 'Primitive',
    };
}

export function isWorkspaceNodeDrag(primitive: DragPrimitive | undefined | null): primitive is DragPrimitive & {
    source: 'workspace-node'
    nodeId: string
    nodeType: FullscreenNodeType
} {
    return primitive?.source === 'workspace-node'
        && typeof primitive.nodeId === 'string'
        && (primitive.nodeType === 'agent' || primitive.nodeType === 'team')
}

export function isSplitPaneDrag(primitive: DragPrimitive | undefined | null): primitive is DragPrimitive & {
    source: 'split-pane'
    paneId: string
    nodeId: string
    nodeType: FullscreenNodeType
} {
    return primitive?.source === 'split-pane'
        && typeof primitive.paneId === 'string'
        && typeof primitive.nodeId === 'string'
        && (primitive.nodeType === 'agent' || primitive.nodeType === 'team')
}

export function isSplitViewNodeDrag(primitive: DragPrimitive | undefined | null): primitive is DragPrimitive & {
    source: 'workspace-node' | 'split-pane'
    paneId?: string
    nodeId: string
    nodeType: FullscreenNodeType
} {
    return isWorkspaceNodeDrag(primitive) || isSplitPaneDrag(primitive)
}

export function primitiveRefFromDragPrimitive(primitive: DragPrimitive): SharedPrimitiveRef | null {
    if (primitive?.source === 'draft' && typeof primitive.draftId === 'string') {
        return { kind: 'draft' as const, draftId: primitive.draftId };
    }
    if (typeof primitive?.urn === 'string' && primitive.urn.length > 0) {
        return { kind: 'registry' as const, urn: primitive.urn };
    }
    return null;
}

export function isPackagePrimitiveDrag(primitive: DragPrimitive) {
    return primitive.source === 'workspace' || primitive.source === 'user';
}

export function getPrimitiveAuthor(primitive: DragPrimitive) {
    return String(primitive.author || '').replace(/^@/, '');
}

export function getPrimitiveSlug(primitive: DragPrimitive) {
    if (typeof primitive.urn === 'string' && primitive.urn.length > 0) {
        return primitiveUrnPath(primitive.urn) || primitive.slug || primitive.name || '';
    }
    return primitive.slug || primitive.name || '';
}

// ── Primitive → Agent applicators ───────────────────────

export function applyInstructionToAgent(store: StudioState, agentId: string, primitive: DragPrimitive) {
    const ref = primitiveRefFromDragPrimitive(primitive);
    if (ref) {
        store.setAgentInstructionRef(agentId, ref);
        return;
    }
    store.setAgentInstruction(agentId, primitive as PrimitiveCard);
}

export function applySkillToAgent(store: StudioState, agentId: string, primitive: DragPrimitive) {
    const ref = primitiveRefFromDragPrimitive(primitive);
    if (ref) {
        store.addAgentSkillRef(agentId, ref);
        return;
    }
    store.addAgentSkill(agentId, primitive as PrimitiveCard);
}

export function applyModelToAgent(
    store: StudioState,
    agentId: string,
    primitive: DragPrimitive,
    showDropWarning: (message: string) => void,
) {
    store.setAgentModel(agentId, {
        provider: primitive.provider as string,
        modelId: primitive.modelId as string,
    });
    if (primitive.connected === false) {
        showDropWarning(`${primitive.providerName || primitive.provider} is not connected in Settings yet. The agent can keep this model selection, but it will not run until provider access is configured.`);
    }
}

export function applyMcpToAgent(store: StudioState, agentId: string, primitive: DragPrimitive) {
    store.addAgentMcp(agentId, primitive as Parameters<StudioState['addAgentMcp']>[1]);
}

export async function applyPrimitiveToAgentTarget(
    store: StudioState,
    agentId: string,
    dropType: string | undefined,
    primitive: DragPrimitive,
    showDropWarning: (message: string) => void,
    resolveAgentPrimitiveForStudio: (primitive: DragPrimitive) => Promise<AgentPrimitivePayload>,
) {
    if (primitive.kind === 'agent') {
        store.applyAgentPrimitive(agentId, await resolveAgentPrimitiveForStudio(primitive));
        return true;
    }

    if (dropType === 'instruction' && primitive.kind === 'instruction') {
        applyInstructionToAgent(store, agentId, primitive);
        return true;
    }

    if (dropType === 'skill' && primitive.kind === 'skill') {
        applySkillToAgent(store, agentId, primitive);
        return true;
    }

    if (dropType === 'model' && primitive.kind === 'model') {
        applyModelToAgent(store, agentId, primitive, showDropWarning);
        return true;
    }

    if (dropType === 'mcp' && primitive.kind === 'mcp') {
        applyMcpToAgent(store, agentId, primitive);
        return true;
    }

    return false;
}
